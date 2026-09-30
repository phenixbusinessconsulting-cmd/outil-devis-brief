// Brief SEO en Markdown : contexte de génération du site.

import path from 'node:path';
import {
  CATEGORIES,
  TONES,
  REFERENCE_ELEMENTS,
  ANIMATION_LEVELS,
  ORIGINS,
  DAYS,
  labelOf,
} from './constants.js';
import { slugify, buildSitemap, buildInternalLinks, importantCommunes, TITLE_MAX, META_MAX } from './seo.js';
import { buildLocalBusiness } from './jsonld.js';
import { formatEuros } from './pricing.js';

export function companySlug(client) {
  return slugify(client.nomCommercial || client.raisonSociale) || `client-${client.id}`;
}

export function briefFileName(client) {
  return `brief-${companySlug(client)}.md`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'reference';
  }
}

/** Nom lisible d'une capture dans le ZIP : captures/ref-01-site-com-02-accueil.webp */
export function screenshotPath(refIndex, ref, shotIndex, shot) {
  const ext = path.extname(shot.storedName) || '.webp';
  const caption = slugify(shot.caption).slice(0, 40);
  const n = (i) => String(i + 1).padStart(2, '0');
  return `captures/ref-${n(refIndex)}-${slugify(hostOf(ref.url))}-${n(shotIndex)}${caption ? `-${caption}` : ''}${ext}`;
}

const list = (items) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '_Non renseigné._');
const val = (v, fallback = '_Non renseigné._') => (v === null || v === undefined || v === '' ? fallback : v);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== '' && x != null) : []);
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function priceRange(o) {
  if (o.priceMin == null && o.priceMax == null) return '';
  if (o.priceMin != null && o.priceMax != null) return `${formatEuros(o.priceMin)} – ${formatEuros(o.priceMax)}`;
  if (o.priceMin != null) return `à partir de ${formatEuros(o.priceMin)}`;
  return `jusqu’à ${formatEuros(o.priceMax)}`;
}

function sectionDirection(client) {
  const refs = client.references || [];
  const out = ['## 1. Direction artistique', ''];
  out.push(
    '> **Avant de générer le site, consulte chacune des URL ci-dessous et les captures associées** ' +
      '(dossier `captures/` du ZIP), en te concentrant sur les éléments retenus et en respectant le niveau d’inspiration.',
    '',
  );

  const couleurs = arr(client.couleursImposees);
  out.push('### Contraintes globales', '');
  out.push(`- **Couleurs imposées** : ${couleurs.length ? couleurs.map((c) => `\`${c}\``).join(', ') : 'aucune'}`);
  out.push(`- **Polices imposées** : ${val(client.policesImposees, 'aucune')}`);
  out.push(`- **Niveau d’animation** : ${labelOf(ANIMATION_LEVELS, client.niveauAnimation)}`);
  out.push('');

  if (!refs.length) {
    out.push('_Aucune référence visuelle fournie._', '');
    return out.join('\n');
  }

  refs.forEach((ref, i) => {
    out.push(`### Référence ${i + 1} — ${hostOf(ref.url)}`, '');
    out.push(`- **URL** : ${ref.url}`);
    out.push(`- **Origine** : ${labelOf(ORIGINS, ref.origin)}`);
    out.push(
      `- **Niveau d’inspiration** : ${ref.inspirationLevel}/5 ${'●'.repeat(ref.inspirationLevel)}${'○'.repeat(5 - ref.inspirationLevel)}`,
    );
    const elements = arr(ref.elements).map((e) => labelOf(REFERENCE_ELEMENTS, e));
    out.push(`- **Éléments retenus** : ${elements.length ? elements.join(', ') : 'aucun en particulier'}`);
    if (ref.likes) out.push(`- **Ce qui plaît** : ${ref.likes}`);
    if (ref.avoid) out.push(`- **À ne pas reprendre** : ${ref.avoid}`);
    const shots = ref.screenshots || [];
    if (shots.length) {
      out.push('- **Captures** :');
      shots.forEach((s, j) => {
        const p = screenshotPath(i, ref, j, s);
        out.push(`  - \`${p}\`${s.caption ? ` — ${s.caption}` : ''}`);
      });
    }
    out.push('');
  });
  return out.join('\n');
}

function sectionModules(client) {
  const modules = client.modules || [];
  const line = (m) => `- **${m.catalogItem.label}**${m.precision ? ` — ${m.precision}` : ''}`;
  const byCat = (items) =>
    CATEGORIES.filter((c) => items.some((m) => m.catalogItem.category === c.code))
      .map((c) => [`**${c.label}**`, ...items.filter((m) => m.catalogItem.category === c.code).map(line)].join('\n'))
      .join('\n\n');
  const included = modules.filter((m) => !m.isOption);
  const options = modules.filter((m) => m.isOption);
  return [
    '## 2. Modules retenus',
    '',
    '### Inclus dans la prestation',
    '',
    included.length ? byCat(included) : '_Aucun._',
    '',
    '### Options à chiffrer',
    '',
    options.length ? byCat(options) : '_Aucune._',
    '',
  ].join('\n');
}

function sectionEntreprise(client) {
  const offerings = client.offerings || [];
  const out = ['## 3. Entreprise', ''];
  out.push('### Identité', '');
  out.push(`- **Raison sociale** : ${val(client.raisonSociale)}`);
  out.push(`- **Nom commercial** : ${val(client.nomCommercial)}`);
  out.push(`- **Secteur d’activité** : ${val(client.secteur)}`);
  out.push(`- **Année de création** : ${val(client.anneeCreation)}`);
  out.push(`- **SIRET** : ${val(client.siret)}`);
  out.push(`- **Forme juridique** : ${val(client.formeJuridique)}`);
  out.push(`- **Assurances à afficher** : ${val(client.assurances)}`);
  out.push('');

  out.push('### Implantation', '');
  out.push(`- **Adresse** : ${val([client.adresse, client.codePostal, client.ville].filter(Boolean).join(', '))}`);
  out.push(`- **Ville principale** : ${val(client.ville)}`);
  out.push(`- **Rayon d’intervention** : ${client.rayonKm ? `${client.rayonKm} km` : '_Non renseigné._'}`);
  const communes = arr(client.communes);
  out.push(
    `- **Zone de chalandise** : ${
      communes.length ? communes.map((c) => (c.importante ? `**${c.nom}**` : c.nom)).join(', ') : '_Non renseignée._'
    }${communes.some((c) => c.importante) ? ' _(en gras : communes importantes, une page chacune)_' : ''}`,
  );
  out.push('');

  out.push('### Offre', '');
  if (offerings.length) {
    out.push('| Prestation / gamme | Description | Prix indicatif |', '|---|---|---|');
    offerings.forEach((o) => out.push(`| ${esc(o.name)} | ${esc(o.description)} | ${esc(priceRange(o))} |`));
  } else {
    out.push('_Aucune prestation saisie._');
  }
  out.push('');

  out.push('### SEO', '');
  out.push(`- **Mot-clé principal** : ${val(client.motClePrincipal)}`);
  out.push(`- **Mots-clés secondaires** : ${arr(client.motsClesSecond).join(', ') || '_Non renseignés._'}`);
  out.push(`- **Longue traîne** :`);
  out.push(list(arr(client.longueTraine).map((x) => `« ${x} »`)).replace(/^/gm, '  '));
  out.push(`- **Concurrents identifiés** :`);
  out.push(
    list(arr(client.concurrents).map((c) => (c.url ? `${c.nom || c.url} — ${c.url}` : c.nom))).replace(/^/gm, '  '),
  );
  out.push('');

  out.push('### Preuves', '');
  out.push(
    `- **Avis Google** : ${
      client.nbAvisGoogle ? `${client.nbAvisGoogle} avis, note moyenne ${String(val(client.noteGoogle, '?')).replace('.', ',')}/5` : '_Non renseigné._'
    }`,
  );
  out.push(`- **Témoignages clients** : ${val(client.temoignages)}`);
  out.push(`- **Réalisations marquantes** : ${val(client.realisations)}`);
  out.push(`- **Certifications et labels** : ${val(client.certifications)}`);
  out.push('');

  out.push('### Contact', '');
  out.push(`- **Téléphone** : ${val(client.telephone)}`);
  out.push(`- **E-mail** : ${val(client.email)}`);
  out.push(`- **Fiche Google Business Profile** : ${val(client.lienGbp)}`);
  const reseaux = client.reseaux || {};
  const liens = Object.entries(reseaux).filter(([, v]) => v);
  out.push(`- **Réseaux sociaux** : ${liens.length ? liens.map(([k, v]) => `${k} ${v}`).join(' · ') : '_Aucun._'}`);
  out.push('- **Horaires** :');
  const horaires = client.horaires || {};
  DAYS.forEach((d) => {
    const h = horaires[d];
    const txt = !h ? 'non renseigné' : h.ferme ? 'fermé' : h.plages || 'non renseigné';
    out.push(`  - ${d.charAt(0).toUpperCase() + d.slice(1)} : ${txt}`);
  });
  out.push('');

  out.push('### Ton et style', '');
  out.push(`- **Ton** : ${arr(client.tons).map((t) => labelOf(TONES, t)).join(', ') || '_Non renseigné._'}`);
  out.push(`- **Éléments de langage** : ${val(client.elementsLangage)}`);
  out.push('');
  return out.join('\n');
}

function sectionSitemap(pages, client) {
  const out = ['## 4. Arborescence proposée', ''];
  pages.forEach((p) => out.push(`- \`${p.path}\` — ${p.type}${p.commune ? ` (${p.commune})` : ''}${p.offering ? ` (${p.offering.name})` : ''}`));
  out.push('', '## 5. Balises par page', '');
  out.push(`_Title ≤ ${TITLE_MAX} caractères, meta description ≤ ${META_MAX} caractères, un seul H1 par page._`, '');
  pages.forEach((p) => {
    out.push(`### ${p.type} — \`${p.path}\``, '');
    out.push(`- **Title** (${p.title.length} car.) : ${p.title}`);
    out.push(`- **Meta description** (${p.meta.length} car.) : ${p.meta}`);
    out.push(`- **H1** : ${p.h1}`);
    if (p.type === 'Ville') {
      out.push(
        `- **Contenu propre à ${p.commune}** : quartiers ou repères locaux, délai d’intervention depuis ${client.ville || 'le siège'}, ` +
          'réalisations faites sur place, particularités de l’habitat. Aucun paragraphe copié d’une autre page ville.',
      );
    }
    out.push('');
  });
  return out.join('\n');
}

function sectionLinks(pages) {
  const out = ['## 7. Maillage interne suggéré', ''];
  buildInternalLinks(pages).forEach(({ from, to }) => {
    out.push(`- \`${from.path}\` → ${to.map((t) => `\`${t.path}\``).join(', ') || '—'}`);
  });
  out.push(
    '',
    '_Ancres descriptives (« plombier à Villeurbanne », pas « cliquez ici »), liens placés dans le corps du texte, ' +
      'fil d’Ariane sur toutes les pages hors accueil._',
    '',
  );
  return out.join('\n');
}

function sectionConstraints(client) {
  return [
    '## 8. Contraintes techniques à respecter',
    '',
    '- Un seul H1 par page.',
    `- Numéro de téléphone cliquable (\`tel:${(client.telephone || '').replace(/[^\d+]/g, '') || '…'}\`) visible dès le haut de page en mobile.`,
    '- Formulaire de contact de trois champs maximum.',
    '- HTTPS partout, aucune ressource mixte.',
    '- Chargement en moins de trois secondes sur mobile en 4G : images WebP dimensionnées, lazy-loading, pas de framework lourd, polices limitées.',
    '- Aucun contenu dupliqué entre les pages de villes : chaque page ville a un texte rédigé pour elle.',
    '- Données structurées LocalBusiness ci-dessus intégrées dans l’accueil, complétées (url, image).',
    '',
  ].join('\n');
}

export function buildBrief(client) {
  const pages = buildSitemap(client, client.offerings || []);
  const brand = client.nomCommercial || client.raisonSociale;
  const jsonld = buildLocalBusiness(client, client.offerings || []);
  const communes = importantCommunes(client);

  return [
    `# Brief SEO — ${brand}`,
    '',
    `_Généré le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date())} · ${pages.length} pages proposées` +
      `${communes.length ? ` dont ${communes.length} pages villes` : ''}._`,
    '',
    sectionDirection(client),
    sectionModules(client),
    sectionEntreprise(client),
    sectionSitemap(pages, client),
    '## 6. Données structurées (JSON-LD)',
    '',
    '```html',
    '<script type="application/ld+json">',
    JSON.stringify(jsonld, null, 2),
    '</script>',
    '```',
    '',
    sectionLinks(pages),
    sectionConstraints(client),
  ].join('\n');
}
