import { api } from './api.js';
import { h, $, clear, initPage, toast, showError, parseNumber, formatDateTime } from './ui.js';

const me = await initPage('parametres');
const app = $('#app');
if (me.role !== 'ADMIN') {
  clear(app, h('p', { class: 'alert danger' }, 'Accès réservé à l’administrateur.'));
  throw new Error('forbidden');
}
const [meta, initial] = await Promise.all([api.get('/api/meta'), api.get('/api/admin/settings')]);
const s = { ...initial };

const text = (label, key, { textarea = false, full = false, type = 'text', placeholder = '' } = {}) => {
  const el = textarea ? h('textarea', { rows: 5, placeholder }) : h('input', { type, placeholder });
  el.value = s[key] ?? '';
  el.addEventListener('input', () => (s[key] = el.value));
  return h('label', { class: `field${full ? ' full' : ''}` }, label, el);
};
const num = (label, key) => {
  const el = h('input', { type: 'text', inputmode: 'decimal', value: String(s[key]).replace('.', ',') });
  el.addEventListener('input', () => (s[key] = parseNumber(el.value)));
  return h('label', { class: 'field' }, label, el);
};

const regime = h('select', {}, meta.vatRegimes.map((v) => h('option', { value: v.code }, v.label)));
regime.value = s.vatRegime;
regime.addEventListener('change', () => (s.vatRegime = regime.value));

const rgpdCard = h('section', { class: 'card' });

async function loadRgpd() {
  const r = await api.get('/api/admin/rgpd');
  clear(rgpdCard,
    h('h2', {}, 'Fiches au-delà de la durée de conservation'),
    h('p', { class: 'small muted' }, `Durée : ${r.retentionMonths} mois sans activité (modification de la fiche, capture ajoutée ou devis créé). Aucune suppression automatique : ouvrez chaque fiche pour la supprimer définitivement.`),
    r.expired.length
      ? h('table', {}, h('tbody', {}, r.expired.map((c) => h('tr', {},
          h('td', {}, h('a', { href: `/fiche?id=${c.id}#rgpd` }, c.nomCommercial || c.raisonSociale)),
          h('td', { class: 'muted' }, `Dernière activité : ${formatDateTime(c.lastActivityAt)}`),
        ))))
      : h('p', { class: 'alert ok' }, 'Aucune fiche au-delà de la durée de conservation.'),
  );
}

clear(app,
  h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Paramètres'), h('p', { class: 'muted' }, 'Valeurs par défaut des nouveaux devis. Un devis existant garde les valeurs de sa création.'))),
  h('section', { class: 'card' },
    h('h2', {}, 'TVA et règlement'),
    h('div', { class: 'grid' },
      h('label', { class: 'field' }, 'Régime de TVA', regime),
      num('Remise comptant (%)', 'cashDiscountPct'),
      num('À la commande, paiement en 3 fois (%)', 'depositPct'),
      num('Validité des devis (jours)', 'quoteValidityDays'),
      num('Majoration mensualisé 12 mois (%)', 'monthlySurcharge12Pct'),
      num('Majoration mensualisé 24 mois (%)', 'monthlySurcharge24Pct'),
      num('Majoration mensualisé 36 mois (%)', 'monthlySurcharge36Pct'),
      text('Mention d’exonération de TVA', 'exemptionMention', { full: true }),
    ),
    h('p', { class: 'small muted' }, 'En autoliquidation, la mention « Autoliquidation de la TVA par le preneur — article 283-2 du Code général des impôts » est ajoutée automatiquement.'),
  ),
  h('section', { class: 'card' },
    h('h2', {}, 'Prestataire'),
    h('div', { class: 'grid' },
      text('Raison sociale', 'providerName'),
      text('SIRET', 'providerSiret'),
      text('N° TVA intracommunautaire', 'providerVatNumber'),
      text('E-mail', 'providerEmail', { type: 'email' }),
      text('Téléphone', 'providerPhone'),
      text('Adresse', 'providerAddress', { full: true }),
      text('Mentions légales (pied de devis)', 'legalMentions', { textarea: true, full: true, placeholder: 'Forme juridique et capital, RCS, pénalités de retard, indemnité forfaitaire de 40 € pour frais de recouvrement, assurance…' }),
    ),
  ),
  h('section', { class: 'card' },
    h('h2', {}, 'RGPD'),
    h('div', { class: 'grid' }, num('Durée de conservation des fiches (mois)', 'clientRetentionMonths')),
    h('p', { class: 'small muted' }, 'Les fiches qui dépassent cette durée sont signalées ci-dessous ; leur suppression reste manuelle.'),
  ),
  rgpdCard,
  h('div', { class: 'savebar' }, h('button', {
    class: 'btn primary',
    onclick: async () => {
      try {
        await api.put('/api/admin/settings', s);
        toast('Paramètres enregistrés');
        loadRgpd();
      } catch (err) { showError(err); }
    },
  }, 'Enregistrer')),
);
loadRgpd().catch(showError);
