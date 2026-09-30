import { api } from './api.js';
import { h, clear } from './ui.js';
import { computeQuote, formatEuros, formatDate, REVERSE_CHARGE_MENTION, UNIT_LABELS } from '/shared/pricing.js';

const id = new URLSearchParams(location.search).get('id');
const [quote, meta] = await Promise.all([api.get(`/api/quotes/${id}`), api.get('/api/meta')]);
const r = computeQuote(quote);
const client = quote.client;
const p = meta.provider;
const comma = (n) => String(n).replace('.', ',');

document.title = `Devis ${quote.number || `brouillon ${quote.id}`} — ${client.nomCommercial || client.raisonSociale}`;
document.getElementById('print').addEventListener('click', () => window.print());

function discount(l) {
  if (l.discountType === 'POURCENT' && l.discountValue) return `−${comma(l.discountValue)} %`;
  if (l.discountType === 'MONTANT' && l.discountValue) return `−${formatEuros(l.discountValue)}`;
  return '';
}

function linesTable(lines) {
  return h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Désignation'), h('th', { class: 'num' }, 'Qté'), h('th', {}, 'Unité'), h('th', { class: 'num' }, 'PU HT'), h('th', { class: 'num' }, 'Remise'), h('th', { class: 'num' }, 'Total HT'))),
    h('tbody', {}, lines.map((l) => h('tr', {},
      h('td', {}, h('strong', {}, l.label), l.description ? h('div', { class: 'desc' }, l.description) : null),
      h('td', { class: 'num' }, comma(l.quantity)),
      h('td', {}, UNIT_LABELS[l.unit]),
      h('td', { class: 'num' }, formatEuros(l.unitPriceHT)),
      h('td', { class: 'num' }, discount(l)),
      h('td', { class: 'num' }, formatEuros(l.amounts.net)),
    ))),
  );
}

function sums(t, suffix = '') {
  return h('table', { class: 'sum' }, h('tbody', {},
    h('tr', {}, h('td', {}, `Total HT${suffix}`), h('td', { class: 'num' }, formatEuros(t.ht))),
    r.showVat ? h('tr', {}, h('td', {}, `TVA ${t.vatRate} %`), h('td', { class: 'num' }, formatEuros(t.vat))) : null,
    h('tr', { class: 'grand' }, h('td', {}, r.showVat ? `Total TTC${suffix}` : `Montant à régler${suffix}`), h('td', { class: 'num' }, formatEuros(t.due))),
  ));
}

const pay = r.payments;
const sel = quote.selectedPayment;

clear(
  document.getElementById('sheet'),
  h('header', { class: 'doc' },
    h('div', { class: 'provider' },
      h('strong', {}, p.name),
      p.address ? h('div', {}, p.address) : null,
      p.siret ? h('div', {}, `SIRET ${p.siret}`) : null,
      p.vatNumber ? h('div', {}, `TVA ${p.vatNumber}`) : null,
      [p.email, p.phone].filter(Boolean).length ? h('div', {}, [p.email, p.phone].filter(Boolean).join(' · ')) : null,
    ),
    h('div', { class: 'doc-title' },
      h('h1', {}, 'DEVIS'),
      quote.number ? h('div', { class: 'num' }, `N° ${quote.number}`) : h('div', { class: 'draft' }, 'BROUILLON — non émis'),
    ),
  ),
  h('div', { class: 'parties' },
    h('div', { class: 'meta' },
      h('div', {}, h('span', { class: 'label' }, 'Date d’émission : '), formatDate(r.issuedAt)),
      h('div', {}, h('span', { class: 'label' }, 'Validité : '), `${quote.validityDays} jours, jusqu’au ${formatDate(r.validUntil)}`),
    ),
    h('div', { class: 'client' },
      h('div', { class: 'label' }, 'Client'),
      h('strong', {}, client.raisonSociale),
      client.nomCommercial && client.nomCommercial !== client.raisonSociale ? h('div', {}, client.nomCommercial) : null,
      client.adresse ? h('div', {}, client.adresse) : null,
      client.codePostal || client.ville ? h('div', {}, [client.codePostal, client.ville].filter(Boolean).join(' ')) : null,
      client.siret ? h('div', {}, `SIRET ${client.siret}`) : null,
      quote.clientVatNumber ? h('div', {}, `TVA intracommunautaire ${quote.clientVatNumber}`) : null,
    ),
  ),
  r.oneOffLines.length ? [h('h2', {}, 'Prestations ponctuelles'), linesTable(r.oneOffLines), sums(r.oneOff)] : null,
  r.recurringLines.length ? [h('h2', {}, 'Prestations récurrentes mensuelles'), linesTable(r.recurringLines), sums(r.recurring, ' / mois')] : null,
  r.optionLines.length ? [h('h2', {}, 'Options proposées (non incluses dans le total)'), linesTable(r.optionLines), sums(r.options)] : null,
  r.oneOff.due > 0
    ? [
        h('h2', {}, 'Modalités de règlement'),
        h('div', { class: 'pay' },
          h('div', { class: sel === 'COMPTANT' ? 'selected' : '' },
            h('h3', {}, 'Comptant'),
            pay.cash.discount ? h('div', {}, `Remise ${comma(pay.cash.discountPct)} % : −${formatEuros(pay.cash.discount)}`) : null,
            h('div', { class: 'big' }, formatEuros(pay.cash.total)),
            h('div', {}, 'à la commande'),
          ),
          h('div', { class: sel === 'TROIS_FOIS' ? 'selected' : '' },
            h('h3', {}, 'En trois fois'),
            h('table', {}, h('tbody', {}, pay.threeTimes.installments.map((i) => h('tr', {}, h('td', {}, `${i.label} (${formatDate(i.date)})`), h('td', { class: 'num' }, formatEuros(i.amount)))))),
          ),
          h('div', { class: sel.startsWith('MENSUEL') ? 'selected' : '' },
            h('h3', {}, 'Mensualisé'),
            pay.monthly[0].downPayment ? h('div', {}, `Apport : ${formatEuros(pay.monthly[0].downPayment)}`) : null,
            h('table', {}, h('tbody', {}, pay.monthly.map((m) => h('tr', { style: sel === `MENSUEL_${m.months}` ? 'font-weight:700' : '' },
              h('td', {}, `${m.months} × ${formatEuros(m.monthlyAmount)}`),
              h('td', { class: 'num' }, `total ${formatEuros(m.totalCost)}`),
            )))),
          ),
        ),
      ]
    : null,
  quote.notes ? [h('h2', {}, 'Remarques'), h('div', { class: 'notes' }, quote.notes)] : null,
  r.reverseCharge ? h('p', { class: 'mention' }, REVERSE_CHARGE_MENTION) : null,
  quote.vatRegime === 'EXONERATION' && quote.exemptionMention ? h('p', { class: 'mention' }, quote.exemptionMention) : null,
  h('div', { class: 'sign' },
    h('div', {}, h('strong', {}, 'Le prestataire'), h('div', { class: 'hint' }, p.name)),
    h('div', {}, h('strong', {}, 'Bon pour accord'), h('div', { class: 'hint' }, 'Date, nom, signature et cachet du client, précédés de la mention « Bon pour accord »')),
  ),
  quote.legalMentions ? h('div', { class: 'legal' }, quote.legalMentions) : null,
);
