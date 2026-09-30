import { api } from './api.js';
import { h, $, clear, initPage, showError, formatDateTime } from './ui.js';
import { formatEuros } from '/shared/pricing.js';

await initPage('devis');
const app = $('#app');

const STATUS = { BROUILLON: 'Brouillon', EMIS: 'Émis', SIGNE: 'Signé', REFUSE: 'Refusé' };

try {
  const quotes = await api.get('/api/quotes');
  clear(
    app,
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Devis'), h('p', { class: 'muted' }, 'Les devis se créent depuis une fiche client.'))),
    h(
      'div',
      { class: 'card' },
      quotes.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              {},
              h('thead', {}, h('tr', {}, h('th', {}, 'Numéro'), h('th', {}, 'Client'), h('th', {}, 'Statut'), h('th', { class: 'num' }, 'Ponctuel'), h('th', { class: 'num' }, 'Mensuel'), h('th', {}, 'Émis le'), h('th', {}, 'Par'))),
              h(
                'tbody',
                {},
                quotes.map((q) =>
                  h(
                    'tr',
                    { class: 'clickable', onclick: () => (location.href = `/devis?id=${q.id}`) },
                    h('td', { class: 'nowrap' }, h('strong', {}, q.number || `Brouillon #${q.id}`)),
                    h('td', {}, q.client.nomCommercial || q.client.raisonSociale),
                    h('td', {}, h('span', { class: `badge ${q.status}` }, STATUS[q.status])),
                    h('td', { class: 'num' }, formatEuros(q.oneOffDue)),
                    h('td', { class: 'num' }, q.recurringDue ? `${formatEuros(q.recurringDue)} / mois` : '—'),
                    h('td', { class: 'nowrap' }, q.issuedAt ? formatDateTime(q.issuedAt) : '—'),
                    h('td', {}, q.createdBy?.displayName || '—'),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'empty' }, 'Aucun devis pour l’instant.'),
    ),
  );
} catch (err) {
  showError(err);
}
