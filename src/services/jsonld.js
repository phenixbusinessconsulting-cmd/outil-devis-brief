// Données structurées LocalBusiness, préremplies depuis la fiche.

import { DAYS } from './constants.js';

const SCHEMA_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** « 09:00-12:00, 14h-18h30 » → [['09:00','12:00'], ['14:00','18:30']] */
export function parseSlots(text) {
  const norm = (t) => {
    const m = t.match(/^(\d{1,2})\s*[:h]?\s*(\d{2})?$/);
    if (!m) return null;
    return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
  };
  return String(text || '')
    .split(/[,;/]|\bet\b/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s*[-–à]\s*/).map((t) => norm(t.trim())))
    .filter((pair) => pair.length === 2 && pair[0] && pair[1]);
}

export function openingHours(horaires = {}) {
  const specs = [];
  DAYS.forEach((day, i) => {
    const h = horaires[day];
    if (!h || h.ferme) return;
    parseSlots(h.plages).forEach(([opens, closes]) => {
      specs.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: SCHEMA_DAYS[i], opens, closes });
    });
  });
  return specs;
}

export function buildLocalBusiness(client, offerings = []) {
  const reseaux = client.reseaux || {};
  const sameAs = [client.lienGbp, reseaux.facebook, reseaux.instagram, reseaux.tiktok, reseaux.linkedin].filter(Boolean);
  const communes = (client.communes || []).map((c) => c.nom).filter(Boolean);
  const areaServed = [client.ville, ...communes]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((name) => ({ '@type': 'City', name }));

  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: client.nomCommercial || client.raisonSociale,
    legalName: client.raisonSociale,
    description: [client.secteur, client.ville && `à ${client.ville}`].filter(Boolean).join(' '),
    url: 'https://[domaine-du-site]/',
    image: 'https://[domaine-du-site]/images/facade.jpg',
    telephone: client.telephone || undefined,
    email: client.email || undefined,
    foundingDate: client.anneeCreation ? String(client.anneeCreation) : undefined,
    identifier: client.siret ? { '@type': 'PropertyValue', propertyID: 'SIRET', value: client.siret } : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: client.adresse || undefined,
      postalCode: client.codePostal || undefined,
      addressLocality: client.ville || undefined,
      addressCountry: 'FR',
    },
    areaServed: areaServed.length ? areaServed : undefined,
    openingHoursSpecification: undefined,
    aggregateRating:
      client.nbAvisGoogle && client.noteGoogle
        ? { '@type': 'AggregateRating', ratingValue: client.noteGoogle, reviewCount: client.nbAvisGoogle, bestRating: 5 }
        : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    makesOffer: offerings.length
      ? offerings.map((o) => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: o.name, description: o.description || undefined },
          priceSpecification:
            o.priceMin != null || o.priceMax != null
              ? {
                  '@type': 'PriceSpecification',
                  priceCurrency: 'EUR',
                  minPrice: o.priceMin != null ? o.priceMin / 100 : undefined,
                  maxPrice: o.priceMax != null ? o.priceMax / 100 : undefined,
                }
              : undefined,
        }))
      : undefined,
  };
  const hours = openingHours(client.horaires);
  if (hours.length) data.openingHoursSpecification = hours;
  // JSON.stringify retire les clés undefined.
  return JSON.parse(JSON.stringify(data));
}
