import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, truncate, buildTitle, buildSitemap, TITLE_MAX, META_MAX } from '../src/services/seo.js';
import { parseSlots } from '../src/services/jsonld.js';

test('slugify : accents, esperluette, ponctuation', () => {
  assert.equal(slugify('Rénovation & Salle de Bain !'), 'renovation-et-salle-de-bain');
  assert.equal(slugify("L'Isle-d'Abeau"), 'l-isle-d-abeau');
});

test('truncate : coupe au mot, ne dépasse jamais', () => {
  const t = truncate('un deux trois quatre cinq six sept huit neuf dix', 20);
  assert.ok(t.length <= 20);
  assert.ok(t.endsWith('…'));
});

test('title : marque retirée puis prestation raccourcie, ville gardée', () => {
  assert.equal(buildTitle('plombier', 'Lyon', 'Dupont'), 'Plombier à Lyon | Dupont');
  const long = buildTitle('Installation et entretien de pompes à chaleur air-eau', 'Villeurbanne', 'Dupont Chauffage');
  assert.ok(long.length <= TITLE_MAX, long);
  assert.ok(long.endsWith('à Villeurbanne'), long);
});

test('arborescence : pages villes uniquement pour les communes importantes, limites respectées', () => {
  const client = {
    raisonSociale: 'Boulangerie Martin SAS',
    nomCommercial: 'Aux Délices de la Fournée Traditionnelle Martin',
    motClePrincipal: 'boulangerie artisanale',
    ville: 'Saint-Symphorien-sur-Coise',
    telephone: '04 00 00 00 00',
    nbAvisGoogle: 250,
    noteGoogle: 4.9,
    communes: [
      { nom: 'Saint-Symphorien-sur-Coise', importante: true },
      { nom: 'Chazelles-sur-Lyon', importante: true },
      { nom: 'Pomeys', importante: false },
    ],
  };
  const pages = buildSitemap(client, [{ name: 'Pains au levain naturel et viennoiseries pur beurre', description: 'x'.repeat(200) }]);
  assert.deepEqual(pages.map((p) => p.type), ['Accueil', 'Prestation', 'Ville', 'À propos', 'Tarifs', 'Contact']);
  pages.forEach((p) => {
    assert.ok(p.title.length <= TITLE_MAX, `${p.title} (${p.title.length})`);
    assert.ok(p.meta.length <= META_MAX, `${p.meta} (${p.meta.length})`);
  });
  assert.equal(new Set(pages.map((p) => p.path)).size, pages.length);
});

test('horaires : formats courants', () => {
  assert.deepEqual(parseSlots('8h-12h, 14h-18h30'), [['08:00', '12:00'], ['14:00', '18:30']]);
  assert.deepEqual(parseSlots('09:00 – 19:00'), [['09:00', '19:00']]);
  assert.deepEqual(parseSlots(''), []);
});
