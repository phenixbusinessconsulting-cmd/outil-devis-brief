import { api } from './api.js';
import { h, $, clear, initPage, showError, formatDateTime } from './ui.js';

await initPage('clients');
const app = $('#app');

const list = h('div', { class: 'card' });
const search = h('input', { type: 'search', placeholder: 'Rechercher (raison sociale, nom, ville)…', style: 'max-width:340px' });

clear(
  app,
  h(
    'div',
    { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Fiches clients'), h('p', { class: 'muted' }, 'Une fiche = un brief SEO et ses devis.')),
    h('div', { class: 'actions' }, search, h('a', { class: 'btn primary', href: '/fiche' }, '+ Nouvelle fiche')),
  ),
  list,
);

async function load() {
  try {
    const q = search.value.trim();
    const clients = await api.get(`/api/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    if (!clients.length) {
      clear(list, h('p', { class: 'empty' }, q ? 'Aucune fiche ne correspond.' : 'Aucune fiche pour l’instant. Créez la première.'));
      return;
    }
    clear(
      list,
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Entreprise'), h('th', {}, 'Secteur'), h('th', {}, 'Ville'), h('th', { class: 'num' }, 'Devis'), h('th', {}, 'Modifiée le'), h('th', {}, 'Par'))),
          h(
            'tbody',
            {},
            clients.map((c) =>
              h(
                'tr',
                { class: 'clickable', onclick: () => (location.href = `/fiche?id=${c.id}`) },
                h('td', {}, h('strong', {}, c.nomCommercial || c.raisonSociale), c.nomCommercial ? h('div', { class: 'small muted' }, c.raisonSociale) : null),
                h('td', {}, c.secteur || '—'),
                h('td', {}, c.ville || '—'),
                h('td', { class: 'num' }, c._count.quotes),
                h('td', { class: 'nowrap' }, formatDateTime(c.updatedAt)),
                h('td', {}, c.createdBy?.displayName || '—'),
              ),
            ),
          ),
        ),
      ),
    );
  } catch (err) {
    showError(err);
  }
}

let timer;
search.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
load();
