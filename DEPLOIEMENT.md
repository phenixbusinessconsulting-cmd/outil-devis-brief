# Déploiement de l'outil briefs & devis sur le VPS Hostinger

Adresse : **https://devis-brief.monsitedemo-talens.fr**

Procédure pas à pas, à dérouler une fois en `root` sur le VPS (Ubuntu ou
Debian). Les mises à jour ultérieures se font en quelques commandes (étape 11).

Le code vient de GitHub : le VPS clone le dépôt `outil-devis-brief`. Les
données (base, captures, sauvegardes) restent sur le VPS, hors du dépôt.

| Élément | Emplacement |
|---|---|
| Code | `/opt/outil-devis-brief` |
| Configuration secrète | `/opt/outil-devis-brief/.env` |
| Base SQLite | `/var/lib/outil-devis/data.db` |
| Captures d'écran | `/var/lib/outil-devis/uploads/` (jamais servies directement par Nginx) |
| Sauvegardes | `/var/backups/outil-devis/` (30 jours) |
| Port interne | `127.0.0.1:3100` |

---

## 1. DNS

Dans la zone DNS de `monsitedemo-talens.fr` (hPanel Hostinger → Domaines →
DNS), créer un enregistrement **A** nommé `devis-brief`, pointant vers
l'adresse IP du VPS (`72.62.25.236` si c'est le même serveur que le CRM).
Vérifier la propagation avant l'étape 9 :

```bash
dig +short devis-brief.monsitedemo-talens.fr    # doit afficher l'IP du VPS
```

## 2. Dépendances système

Node.js 22 (Prisma 7 exige Node 20.19 au minimum), Nginx, certbot, git :

```bash
apt update
apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v    # v22.x
```

`build-essential` ne sert que si les modules natifs (`sharp`,
`better-sqlite3`) n'ont pas de binaire précompilé pour le serveur.

## 3. Utilisateur et dossiers

Le service tourne sous un utilisateur dédié, sans shell ni droits root :

```bash
useradd --system --home /var/lib/outil-devis --shell /usr/sbin/nologin outil-devis
install -d -o outil-devis -g outil-devis -m 750 /var/lib/outil-devis /var/lib/outil-devis/uploads
install -d -o outil-devis -g outil-devis -m 700 /var/backups/outil-devis
```

## 4. Récupérer le code depuis GitHub

Le dépôt est privé : le VPS a besoin d'une **clé de déploiement** en lecture
seule.

```bash
ssh-keygen -t ed25519 -f /root/.ssh/github_outil_devis -N "" -C "vps-outil-devis"
cat /root/.ssh/github_outil_devis.pub
```

Copier la ligne affichée dans GitHub : dépôt `outil-devis-brief` →
**Settings → Deploy keys → Add deploy key**, sans cocher « Allow write
access ». Puis ajouter ces lignes à `/root/.ssh/config` (avec `nano`) :

```
Host github-outil-devis
  HostName github.com
  User git
  IdentityFile /root/.ssh/github_outil_devis
  IdentitiesOnly yes
```

et cloner :

```bash
git clone git@github-outil-devis:phenixbusinessconsulting-cmd/outil-devis-brief.git /opt/outil-devis-brief
cd /opt/outil-devis-brief
```

## 5. Configuration (.env)

```bash
cp .env.example .env
SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" .env
chown root:outil-devis .env
chmod 640 .env
nano .env    # relire : PORT, DATABASE_URL, UPLOAD_DIR, COOKIE_SECURE=true
```

Le `.env` n'est jamais versionné (il est ignoré par git).

## 6. Installation, base de données, catalogue

```bash
cd /opt/outil-devis-brief
npm ci --omit=dev                        # génère aussi le client Prisma
sudo -u outil-devis npx prisma migrate deploy
sudo -u outil-devis npm run db:seed      # catalogue initial, prix à 0 €
```

`db:seed` crée les 45 lignes du catalogue (un module par case du
formulaire). Il peut être relancé sans risque : les lignes existantes ne sont
pas modifiées.

## 7. Créer le premier administrateur

Aucun compte n'existe par défaut.

```bash
cd /opt/outil-devis-brief
sudo -u outil-devis npm run create-admin -- --username prenom.nom --name "Prénom Nom"
```

Le mot de passe (10 caractères minimum) est demandé au clavier, sans
affichage. Il n'apparaît donc pas dans l'historique du shell. Les comptes
commerciaux se créent ensuite depuis l'interface (**Utilisateurs**).

## 8. Service systemd

```bash
cp deploy/outil-devis.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now outil-devis
systemctl status outil-devis --no-pager
curl -s http://127.0.0.1:3100/api/health    # {"ok":true}
```

Le service redémarre tout seul en cas d'arrêt (`Restart=always`) et au
démarrage du VPS. Journaux : `journalctl -u outil-devis -f`.

## 9. Nginx et certificat SSL (Let's Encrypt)

```bash
cp deploy/outil-devis-proxy.conf /etc/nginx/snippets/
cp deploy/nginx-outil-devis.conf /etc/nginx/sites-available/outil-devis
ln -s /etc/nginx/sites-available/outil-devis /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

certbot --nginx -d devis-brief.monsitedemo-talens.fr --redirect \
  -m phenixbusinessconsulting@gmail.com --agree-tos --no-eff-email
```

certbot ajoute le bloc HTTPS, la redirection HTTP → HTTPS, et programme le
renouvellement automatique. Pour vérifier le renouvellement :

```bash
certbot renew --dry-run
```

Les autres sites du VPS ne sont pas touchés : chaque domaine a son propre
bloc `server`.

Pare-feu : si `ufw` est actif, `ufw allow 'Nginx Full'`. Le port 3100 ne
doit **pas** être ouvert, puisque l'application n'écoute que sur 127.0.0.1.

Ouvrir ensuite https://devis-brief.monsitedemo-talens.fr et se connecter.

## 10. Sauvegardes quotidiennes

```bash
cp deploy/outil-devis-backup.service deploy/outil-devis-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now outil-devis-backup.timer
systemctl list-timers 'outil-devis*'

# Premier essai immédiat :
systemctl start outil-devis-backup.service
journalctl -u outil-devis-backup --no-pager | tail -3
ls -lh /var/backups/outil-devis/
```

Chaque nuit à 3 h 15, le service fait une copie cohérente de la base (même
service en marche, intégrité vérifiée) et des captures, dans une archive
`outil-devis_AAAA-MM-JJ_HHMM.tar.gz`. Les archives de plus de 30 jours sont
supprimées (`BACKUP_DAYS` dans le `.env` pour changer la durée).

**RGPD** : aucune purge automatique. Les fiches qui dépassent la durée de
conservation (réglée dans **Paramètres**) y sont signalées, et se
suppriment à la main depuis la fiche (bouton « Supprimer définitivement »).
Une fiche supprimée disparaît des sauvegardes au bout de 30 jours.

**Copie hors du VPS** (recommandé) : une sauvegarde sur le même disque ne
protège pas d'une perte du serveur. Depuis un Mac :

```bash
rsync -av root@72.62.25.236:/var/backups/outil-devis/ ~/Sauvegardes/outil-devis/
```

### Restaurer une sauvegarde

```bash
systemctl stop outil-devis
mkdir /tmp/restauration && tar -xzf /var/backups/outil-devis/outil-devis_AAAA-MM-JJ_HHMM.tar.gz -C /tmp/restauration
install -o outil-devis -g outil-devis -m 640 /tmp/restauration/data.db /var/lib/outil-devis/data.db
rm -f /var/lib/outil-devis/data.db-wal /var/lib/outil-devis/data.db-shm
rsync -a --delete /tmp/restauration/uploads/ /var/lib/outil-devis/uploads/
chown -R outil-devis:outil-devis /var/lib/outil-devis
systemctl start outil-devis
rm -rf /tmp/restauration
```

## 11. Mettre à jour l'application

Après un push sur GitHub :

```bash
cd /opt/outil-devis-brief && git pull
npm ci --omit=dev
sudo -u outil-devis npx prisma migrate deploy
systemctl restart outil-devis
```

## Dépannage

| Symptôme | Piste |
|---|---|
| 502 Bad Gateway | `systemctl status outil-devis`, puis `journalctl -u outil-devis -n 50` |
| « Variable … absente du .env » au démarrage | comparer `.env` et `.env.example` |
| Envoi de captures refusé (413) | `client_max_body_size` dans Nginx, `MAX_UPLOAD_MB` dans `.env` |
| Déconnexion immédiate après connexion | `COOKIE_SECURE=true` exige HTTPS : vérifier le certificat |
| Mot de passe administrateur perdu | recréer un administrateur avec `npm run create-admin`, puis réinitialiser l'ancien depuis **Utilisateurs** |
