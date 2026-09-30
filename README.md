# Outil briefs SEO et devis

Phenix Group International. On saisit une fiche client (commerce de proximité),
et l'outil produit :

- **un brief SEO** en Markdown (`brief-[entreprise].md`), à donner comme contexte
  à Claude pour générer le site. Il contient la direction artistique, les
  modules retenus, l'arborescence, le title, la meta et le H1 de chaque page,
  le JSON-LD LocalBusiness, le maillage interne et les contraintes techniques.
  Il existe aussi en ZIP, avec les captures d'écran nommées lisiblement ;
- **un devis chiffré** à partir des modules cochés et du catalogue. Il sépare
  le ponctuel et le mensuel, gère la TVA à 20 %, l'autoliquidation et
  l'exonération, et détaille trois modalités de règlement. Il s'exporte en
  PDF (impression) et en Markdown.

En production : https://devis-brief.monsitedemo-talens.fr. Déploiement sur le
VPS : voir [DEPLOIEMENT.md](DEPLOIEMENT.md).

## Démarrer en local

```bash
git clone git@github.com:phenixbusinessconsulting-cmd/outil-devis-brief.git
cd outil-devis-brief
npm install
cp .env.example .env
# Dans .env : DATABASE_URL="file:./.local/data.db", UPLOAD_DIR=./.local/uploads,
#             COOKIE_SECURE=false, NODE_ENV=development, un SESSION_SECRET quelconque
npx prisma migrate deploy
npm run db:seed
npm run create-admin -- --username admin --name "Admin"
npm run dev          # http://127.0.0.1:3100
npm test             # calculs du devis, balises SEO
```

## Pile technique

Node.js ≥ 20.19, Express 5, Prisma 7 + SQLite (better-sqlite3), sessions en
base (cookie httpOnly), bcrypt, sharp (compression des captures au-delà de
500 Ko), archiver (ZIP). Front en HTML/CSS/JS natifs, sans étape de build.

## Organisation

```
prisma/schema.prisma      modèle de données (montants en centimes)
prisma/seed.js            catalogue initial : un module par case du formulaire
src/app.js                Express : sécurité, sessions, routes
src/routes/               auth, clients, screenshots (+ fichiers), quotes, exports, admin
src/services/pricing.js   calculs du devis, partagés avec le navigateur (/shared/pricing.js)
src/services/seo.js       arborescence, title ≤ 60, meta ≤ 155, H1, maillage
src/services/brief.js     Markdown du brief
public/                   pages (fiche, devis, impression, administration)
scripts/                  create-admin, backup
deploy/                   Nginx, systemd (service, sauvegarde quotidienne)
```

## Principes

- **Le catalogue est la source des modules.** Chaque ligne active devient une
  case à cocher dans la fiche et donne son tarif au devis. Ajouter une
  prestation dans **Catalogue** la fait apparaître dans le formulaire.
- **Un devis émis est figé.** Il reçoit un numéro sans trou (`D-2026-0001`) et
  garde les taux de sa création. Pour le modifier, on le duplique.
- **Les lignes « par page »** reçoivent par défaut le nombre de pages de
  prestations et de villes du brief. Accueil, à propos, tarifs et contact
  relèvent du forfait.
- **Sécurité.** Les captures sont servies uniquement par une route
  authentifiée. Les écritures exigent un en-tête propre à l'application
  (protection CSRF). Les connexions sont limitées en nombre. Le DOM est
  construit sans `innerHTML`.
- **RGPD.** La durée de conservation se règle dans les paramètres. Les
  fiches qui la dépassent y sont signalées. Aucune suppression n'est
  automatique : chaque fiche a un bouton de suppression définitive (devis et
  captures compris).
