#!/bin/bash
# Installation et mise à jour complètes sur le VPS, en root. Idempotent :
# chaque étape vérifie ce qui existe déjà, le script peut donc être relancé à
# chaque déploiement.
#
# Lancé par le workflow GitHub Actions (.github/workflows/deploiement.yml)
# après l'envoi du code dans APP_DIR, ou à la main :
#   DOMAINE=devis-brief.monsitedemo-talens.fr bash scripts/install-vps.sh
#
# Variables : DOMAINE (obligatoire), APP_DIR, CERTBOT_EMAIL, ADMIN_USERNAME.
# Le mot de passe du premier administrateur, s'il faut le créer, est lu sur
# l'entrée standard : jamais en argument (il resterait visible dans ps).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/outil-devis-brief}"
DOMAINE="${DOMAINE:?DOMAINE manquant}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
SERVICE_USER=outil-devis
DATA_DIR=/var/lib/outil-devis
BACKUP_DIR=/var/backups/outil-devis
export DEBIAN_FRONTEND=noninteractive

etape() { echo; echo "▶ $*"; }
ok() { echo "  ✓ $*"; }
alerte() { echo "  ⚠ $*"; }
echec() { echo "  ✗ $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || echec "à lancer en root"
[ -f "$APP_DIR/package.json" ] || echec "code absent de $APP_DIR"
cd "$APP_DIR"

ADMIN_PASSWORD=""
if [ ! -t 0 ]; then IFS= read -r ADMIN_PASSWORD || true; fi

# Exécute une commande sous l'utilisateur du service.
en_service() { runuser -u "$SERVICE_USER" -- env HOME="$DATA_DIR" "$@"; }

etape "Paquets système"
manque=()
command -v nginx >/dev/null || manque+=(nginx)
command -v certbot >/dev/null || manque+=(certbot)
dpkg -s python3-certbot-nginx >/dev/null 2>&1 || manque+=(python3-certbot-nginx)
command -v curl >/dev/null || manque+=(curl)
command -v gcc >/dev/null || manque+=(build-essential)
if [ ${#manque[@]} -gt 0 ]; then
  apt-get update -qq
  apt-get install -y -qq "${manque[@]}" >/dev/null
  ok "installés : ${manque[*]}"
else
  ok "déjà présents"
fi

node_ok() {
  command -v node >/dev/null &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)'
}
if ! node_ok; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  node_ok || echec "Node.js ≥ 20.19 introuvable après installation"
fi
ok "Node.js $(node -v)"

etape "Utilisateur et dossiers"
id -u "$SERVICE_USER" >/dev/null 2>&1 ||
  useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 750 "$DATA_DIR" "$DATA_DIR/uploads"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 700 "$BACKUP_DIR"
ok "$SERVICE_USER, $DATA_DIR, $BACKUP_DIR"

etape "Configuration (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  secret="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$secret|" .env
  ok ".env créé avec un secret de session aléatoire"
else
  ok ".env existant conservé"
fi
chown root:"$SERVICE_USER" .env
chmod 640 .env

etape "Dépendances, base de données, catalogue"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
en_service ./node_modules/.bin/prisma migrate deploy
en_service node prisma/seed.js

etape "Premier administrateur"
admins="$(en_service node --input-type=module -e "
  import { prisma } from './src/db.js';
  console.log(await prisma.user.count({ where: { role: 'ADMIN' } }));
  await prisma.\$disconnect();
")"
if [ "$admins" != "0" ]; then
  ok "$admins administrateur(s) existant(s), rien à créer"
elif [ -n "$ADMIN_PASSWORD" ]; then
  printf '%s\n' "$ADMIN_PASSWORD" | en_service node scripts/create-admin.js --username "$ADMIN_USERNAME" --name "$ADMIN_USERNAME"
else
  alerte "aucun administrateur et aucun mot de passe fourni (secret OUTIL_ADMIN_PASSWORD)"
fi

etape "Service systemd"
install -m 644 deploy/outil-devis.service /etc/systemd/system/outil-devis.service
systemctl daemon-reload
systemctl enable outil-devis >/dev/null 2>&1
systemctl restart outil-devis
for _ in $(seq 1 20); do
  curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS http://127.0.0.1:3100/api/health >/dev/null ||
  { journalctl -u outil-devis -n 30 --no-pager; echec "le service ne répond pas"; }
ok "outil-devis actif"

etape "Nginx"
install -m 644 deploy/outil-devis-proxy.conf /etc/nginx/snippets/outil-devis-proxy.conf
# Certains Nginx ne lisent que conf.d/ : on suit la configuration en place.
if nginx -T 2>/dev/null | grep -qE '^\s*include\s+/etc/nginx/sites-enabled/'; then
  conf=/etc/nginx/sites-available/outil-devis
  lien=/etc/nginx/sites-enabled/outil-devis
else
  conf=/etc/nginx/conf.d/outil-devis.conf
  lien=""
fi
# Posé une seule fois : certbot y ajoute ensuite le bloc HTTPS, qu'une
# recopie effacerait.
if [ ! -f "$conf" ]; then
  sed "s/server_name .*;/server_name $DOMAINE;/" deploy/nginx-outil-devis.conf > "$conf"
  ok "configuration posée : $conf"
else
  ok "configuration existante conservée : $conf"
fi
[ -z "$lien" ] || ln -sfn "$conf" "$lien"
nginx -t 2>&1 | tail -1
systemctl reload nginx

etape "Certificat HTTPS"
if [ -d "/etc/letsencrypt/live/$DOMAINE" ]; then
  ok "certificat déjà présent (renouvellement automatique par certbot)"
else
  if [ -n "$CERTBOT_EMAIL" ]; then contact=(-m "$CERTBOT_EMAIL"); else contact=(--register-unsafely-without-email); fi
  if certbot --nginx -d "$DOMAINE" --redirect --non-interactive --agree-tos --no-eff-email "${contact[@]}"; then
    ok "certificat obtenu"
  else
    alerte "certbot a échoué : vérifier que le DNS de $DOMAINE pointe vers ce serveur"
  fi
fi

etape "Sauvegardes quotidiennes"
chmod +x scripts/backup.sh
install -m 644 deploy/outil-devis-backup.service deploy/outil-devis-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now outil-devis-backup.timer >/dev/null 2>&1
ok "prochaine sauvegarde : $(systemctl show outil-devis-backup.timer -p NextElapseUSecRealtime --value)"

etape "Contrôle final"
if curl -fsS --resolve "$DOMAINE:443:127.0.0.1" "https://$DOMAINE/api/health" >/dev/null 2>&1; then
  ok "https://$DOMAINE répond"
elif curl -fsS --resolve "$DOMAINE:80:127.0.0.1" "http://$DOMAINE/api/health" >/dev/null 2>&1; then
  alerte "http://$DOMAINE répond, mais pas encore en HTTPS"
else
  echec "$DOMAINE ne répond pas via Nginx"
fi
