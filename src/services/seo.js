// Arborescence, balises et maillage proposés dans le brief.

export const TITLE_MAX = 60;
export const META_MAX = 155;

export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Coupe au dernier mot entier ; ajoute « … » si coupé. */
export function truncate(text, max) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Title au format « prestation + ville + marque », 60 caractères maximum.
 * On retire d'abord la marque, puis on raccourcit la prestation : la ville
 * est gardée, c'est elle qui porte la requête locale.
 */
export function buildTitle(prestation, ville, marque) {
  const parts = [cap(prestation), ville].filter(Boolean).join(' à ');
  const full = marque ? `${parts} | ${marque}` : parts;
  if (full.length <= TITLE_MAX) return full;
  if (parts.length <= TITLE_MAX) return parts;
  const suffix = ville ? ` à ${ville}` : '';
  return `${truncate(cap(prestation), TITLE_MAX - suffix.length)}${suffix}`;
}

export function buildMeta(text) {
  return truncate(text, META_MAX);
}

function brandOf(client) {
  return client.nomCommercial || client.raisonSociale;
}

function phoneSuffix(client) {
  return client.telephone ? ` ☎ ${client.telephone}` : '';
}

function proofText(client) {
  if (client.nbAvisGoogle && client.noteGoogle) {
    return ` Noté ${String(client.noteGoogle).replace('.', ',')}/5 sur ${client.nbAvisGoogle} avis Google.`;
  }
  return '';
}

export function importantCommunes(client) {
  const communes = Array.isArray(client.communes) ? client.communes : [];
  return communes
    .filter((c) => c && c.nom && c.importante)
    .filter((c) => slugify(c.nom) !== slugify(client.ville));
}

/**
 * Arborescence : accueil, une page par prestation, une page par commune
 * importante, à propos, contact, tarifs. Chaque page reçoit title, meta, H1.
 */
export function buildSitemap(client, offerings = []) {
  const brand = brandOf(client);
  const ville = client.ville;
  const activity = client.motClePrincipal || client.secteur || 'Artisan';
  const activitySlug = slugify(activity);
  const pages = [];

  pages.push({
    key: 'accueil',
    type: 'Accueil',
    path: '/',
    title: buildTitle(activity, ville, brand),
    meta: buildMeta(
      `${brand}, ${activity.toLowerCase()} à ${ville || 'votre service'}${client.rayonKm ? ` et dans un rayon de ${client.rayonKm} km` : ''}.${proofText(client)} Devis gratuit et rapide.${phoneSuffix(client)}`,
    ),
    h1: `${cap(activity)} à ${ville || '[ville]'}`,
  });

  offerings.forEach((o) => {
    const slug = slugify(o.name);
    pages.push({
      key: `prestation-${slug}`,
      type: 'Prestation',
      path: `/${slug}${ville ? `-${slugify(ville)}` : ''}`,
      title: buildTitle(o.name, ville, brand),
      meta: buildMeta(
        `${cap(o.name)} à ${ville || 'proximité'} par ${brand}. ${o.description ? `${o.description.replace(/\.$/, '')}. ` : ''}Devis gratuit, intervention rapide.${phoneSuffix(client)}`,
      ),
      h1: `${cap(o.name)} à ${ville || '[ville]'}`,
      offering: o,
    });
  });

  importantCommunes(client).forEach((c) => {
    pages.push({
      key: `ville-${slugify(c.nom)}`,
      type: 'Ville',
      path: `/${activitySlug}-${slugify(c.nom)}`,
      title: buildTitle(activity, c.nom, brand),
      meta: buildMeta(
        `${cap(activity)} à ${c.nom} : ${brand} intervient chez vous depuis ${ville || 'notre atelier'}.${proofText(client)} Demandez votre devis gratuit.`,
      ),
      h1: `${cap(activity)} à ${c.nom}`,
      commune: c.nom,
    });
  });

  pages.push(
    {
      key: 'a-propos',
      type: 'À propos',
      path: '/a-propos',
      title: buildTitle(`${brand}, ${activity.toLowerCase()}`, ville, ''),
      meta: buildMeta(
        `Découvrez ${brand}${client.anneeCreation ? `, ${activity.toLowerCase()} depuis ${client.anneeCreation}` : ''} à ${ville || 'proximité'} : notre équipe, nos valeurs et nos réalisations.`,
      ),
      h1: `${brand}, votre ${activity.toLowerCase()} à ${ville || '[ville]'}`,
    },
    {
      key: 'tarifs',
      type: 'Tarifs',
      path: '/tarifs',
      title: buildTitle(`Tarifs ${activity.toLowerCase()}`, ville, brand),
      meta: buildMeta(
        `Tarifs et prix indicatifs de ${brand}, ${activity.toLowerCase()} à ${ville || 'proximité'}. Devis détaillé gratuit, sans engagement.`,
      ),
      h1: `Tarifs ${activity.toLowerCase()} à ${ville || '[ville]'}`,
    },
    {
      key: 'contact',
      type: 'Contact',
      path: '/contact',
      title: buildTitle(`Contact ${activity.toLowerCase()}`, ville, brand),
      meta: buildMeta(
        `Contactez ${brand} à ${ville || 'proximité'} pour un devis gratuit.${client.adresse ? ` ${client.adresse}.` : ''}${phoneSuffix(client)}`,
      ),
      h1: `Contacter ${brand}`,
    },
  );

  return pages;
}

/** Maillage interne : liens suggérés depuis chaque page. */
export function buildInternalLinks(pages) {
  const byType = (t) => pages.filter((p) => p.type === t);
  const services = byType('Prestation');
  const cities = byType('Ville');
  const find = (key) => pages.find((p) => p.key === key);
  const pick = (list, exclude, n) => list.filter((p) => p.key !== exclude).slice(0, n);

  return pages.map((page) => {
    let targets = [];
    switch (page.type) {
      case 'Accueil':
        targets = [...services, ...cities, find('a-propos'), find('tarifs'), find('contact')];
        break;
      case 'Prestation':
        targets = [find('accueil'), ...pick(services, page.key, 3), ...cities.slice(0, 3), find('tarifs'), find('contact')];
        break;
      case 'Ville':
        targets = [find('accueil'), ...services, ...pick(cities, page.key, 2), find('contact')];
        break;
      case 'Tarifs':
        targets = [...services, find('contact')];
        break;
      case 'À propos':
        targets = [find('accueil'), ...services.slice(0, 3), find('contact')];
        break;
      case 'Contact':
        targets = [find('accueil'), find('tarifs')];
        break;
    }
    return { from: page, to: targets.filter(Boolean) };
  });
}
