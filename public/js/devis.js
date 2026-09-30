import { api } from './api.js';
import { h, $, clear, initPage, toast, showError, parseEuros, centsToInput, parseNumber, params, download, confirmDialog } from './ui.js';
import { computeQuote, formatEuros, formatDate, REVERSE_CHARGE_MENTION, UNIT_LABELS } from '/shared/pricing.js';

await initPage('devis');
const app = $('#app');

const [meta, catalog] = await Promise.all([api.get('/api/meta'), api.get('/api/catalog')]);
const STATUS = { BROUILLON: 'Brouillon', EMIS: 'Émis', SIGNE: 'Signé', REFUSE: 'Refusé' };

let quote = await api.get(`/api/quotes/${params.get('id')}`);
let dirty = false;
const editable = () => quote.status === 'BROUILLON';

window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

const totalsEl = h('div');
const paymentsEl = h('div');
const vatAlert = h('div', { class: 'alert danger hidden' }, '⚠ Autoliquidation retenue mais numéro de TVA intracommunautaire du client vide.');
const statusEl = h('span', { class: 'status' });

function touch() {
  dirty = true;
  statusEl.textContent = 'Modifications non enregistrées';
  statusEl.classList.add('dirty');
  refresh();
}

/* ---------- Totaux et modalités, recalculés à chaque frappe ---------- */

function totalBox(title, t, r, suffix = '') {
  return h(
    'div',
    { class: 'total-box' },
    h('h3', {}, title),
    h('div', { class: 'line' }, h('span', {}, `Sous-total HT${suffix}`), h('span', {}, formatEuros(t.ht))),
    t.discount ? h('div', { class: 'line small muted' }, h('span', {}, 'dont remises'), h('span', {}, `−${formatEuros(t.discount)}`)) : null,
    r.showVat ? h('div', { class: 'line' }, h('span', {}, `TVA ${t.vatRate} %`), h('span', {}, formatEuros(t.vat))) : null,
    h('div', { class: 'line grand' }, h('span', {}, r.showVat ? `Total TTC${suffix}` : `À régler${suffix}`), h('span', {}, formatEuros(t.due))),
  );
}

function refresh() {
  const r = computeQuote(quote);
  vatAlert.classList.toggle('hidden', !r.missingClientVat);
  clear(
    totalsEl,
    h(
      'div',
      { class: 'totals' },
      totalBox('Prestations ponctuelles', r.oneOff, r),
      r.recurringLines.length ? totalBox('Récurrent mensuel', r.recurring, r, ' / mois') : null,
      r.optionLines.length ? totalBox('Options (hors total)', r.options, r) : null,
    ),
    r.reverseCharge ? h('p', { class: 'small', style: 'margin-top:0.75rem' }, h('strong', {}, REVERSE_CHARGE_MENTION)) : null,
  );
  const p = r.payments;
  const selected = quote.selectedPayment;
  const box = (code, title, ...content) =>
    h('div', { class: `pay-option${selected === code || (code === 'MENSUEL' && selected.startsWith('MENSUEL')) ? ' selected' : ''}` }, h('h3', {}, title), ...content);
  clear(
    paymentsEl,
    h(
      'div',
      { class: 'pay-grid' },
      box(
        'COMPTANT',
        'Comptant',
        p.cash.discount ? h('div', { class: 'line' }, `Remise ${String(p.cash.discountPct).replace('.', ',')} % : −${formatEuros(p.cash.discount)}`) : h('div', { class: 'small muted' }, 'Aucune remise paramétrée'),
        h('div', { class: 'stat' }, formatEuros(p.cash.total)),
      ),
      box(
        'TROIS_FOIS',
        'En trois fois',
        h('table', {}, h('tbody', {}, p.threeTimes.installments.map((i) => h('tr', {}, h('td', {}, i.label, h('div', { class: 'small muted' }, formatDate(i.date))), h('td', { class: 'num' }, formatEuros(i.amount)))))),
      ),
      box(
        'MENSUEL',
        'Mensualisé',
        p.monthly[0].downPayment ? h('div', { class: 'small' }, `Apport : ${formatEuros(p.monthly[0].downPayment)}`) : null,
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Durée'), h('th', { class: 'num' }, 'Mensualité'), h('th', { class: 'num' }, 'Coût total'))),
          h('tbody', {}, p.monthly.map((m) => h('tr', {}, h('td', {}, `${m.months} mois`, h('div', { class: 'small muted' }, `+${String(m.surchargePct).replace('.', ',')} %`)), h('td', { class: 'num' }, formatEuros(m.monthlyAmount)), h('td', { class: 'num' }, formatEuros(m.totalCost)))))),
      ),
    ),
    h('p', { class: 'small muted' }, 'Modalités calculées sur les prestations ponctuelles ; les prestations mensuelles sont facturées à part.'),
  );
}

/* ---------- Lignes ---------- */

const linesBody = h('tbody');

function lineRow(line, i) {
  const ro = !editable();
  const labelIn = h('input', { type: 'text', value: line.label, disabled: ro, placeholder: 'Désignation' });
  labelIn.addEventListener('input', () => { line.label = labelIn.value; touch(); });
  const descIn = h('input', { type: 'text', value: line.description, disabled: ro, placeholder: 'Description', class: 'small', style: 'margin-top:0.25rem' });
  descIn.addEventListener('input', () => { line.description = descIn.value; touch(); });

  const qty = h('input', { type: 'text', inputmode: 'decimal', class: 'qty', value: String(line.quantity).replace('.', ','), disabled: ro });
  qty.addEventListener('input', () => { line.quantity = parseNumber(qty.value); touch(); });

  const unit = h('select', { disabled: ro }, meta.units.map((u) => h('option', { value: u.code }, UNIT_LABELS[u.code])));
  unit.value = line.unit;
  unit.addEventListener('change', () => { line.unit = unit.value; line.recurring = unit.value === 'MOIS'; touch(); renderLines(); });

  const price = h('input', { type: 'text', inputmode: 'decimal', class: 'money', value: centsToInput(line.unitPriceHT), disabled: ro });
  price.addEventListener('input', () => { line.unitPriceHT = parseEuros(price.value) ?? 0; touch(); updateLineTotal(); });

  const dType = h('select', { disabled: ro }, h('option', { value: 'AUCUNE' }, '—'), h('option', { value: 'POURCENT' }, '%'), h('option', { value: 'MONTANT' }, '€'));
  dType.value = line.discountType;
  const dVal = h('input', { type: 'text', inputmode: 'decimal', class: 'money', disabled: ro || line.discountType === 'AUCUNE' });
  const showDisc = () => (dVal.value = line.discountType === 'MONTANT' ? centsToInput(line.discountValue) : line.discountValue ? String(line.discountValue).replace('.', ',') : '');
  showDisc();
  dType.addEventListener('change', () => {
    line.discountType = dType.value;
    line.discountValue = 0;
    dVal.disabled = dType.value === 'AUCUNE';
    showDisc();
    touch();
    updateLineTotal();
  });
  dVal.addEventListener('input', () => {
    line.discountValue = line.discountType === 'MONTANT' ? parseEuros(dVal.value) ?? 0 : parseNumber(dVal.value);
    touch();
    updateLineTotal();
  });

  const option = h('input', { type: 'checkbox', checked: line.isOption, disabled: ro, title: 'Option : chiffrée à part, hors total' });
  option.addEventListener('change', () => { line.isOption = option.checked; touch(); renderLines(); });

  const totalCell = h('td', { class: 'num' });
  const updateLineTotal = () => {
    const c = computeQuote({ ...quote, lines: [line] }).lines[0].amounts;
    clear(totalCell, h('strong', {}, formatEuros(c.net)), c.discount ? h('div', { class: 'small muted' }, `−${formatEuros(c.discount)}`) : null);
  };
  qty.addEventListener('input', updateLineTotal);
  updateLineTotal();

  const move = (delta) => {
    const j = i + delta;
    if (j < 0 || j >= quote.lines.length) return;
    [quote.lines[i], quote.lines[j]] = [quote.lines[j], quote.lines[i]];
    quote.lines.forEach((l, k) => (l.position = k));
    touch();
    renderLines();
  };

  return h(
    'tr',
    {},
    h('td', { style: 'min-width:220px' }, labelIn, descIn),
    h('td', { class: 'nowrap' }, h('span', { class: `badge${line.isOption ? ' option' : ''}` }, line.isOption ? 'Option' : line.unit === 'MOIS' ? 'Mensuel' : 'Ponctuel'), h('div', {}, h('label', { class: 'check small' }, option, 'option'))),
    h('td', {}, qty),
    h('td', {}, unit),
    h('td', {}, price),
    h('td', {}, h('div', { class: 'disc' }, dType, dVal)),
    totalCell,
    h('td', { class: 'nowrap' }, ro ? null : [
      h('button', { class: 'btn icon small', type: 'button', title: 'Monter', onclick: () => move(-1) }, '↑'),
      h('button', { class: 'btn icon small', type: 'button', title: 'Descendre', onclick: () => move(1) }, '↓'),
      h('button', { class: 'btn danger icon small', type: 'button', title: 'Supprimer', onclick: () => { quote.lines.splice(i, 1); quote.lines.forEach((l, k) => (l.position = k)); touch(); renderLines(); } }, '✕'),
    ]),
  );
}

function renderLines() {
  quote.lines.forEach((l, k) => (l.position = k));
  clear(linesBody, quote.lines.length ? quote.lines.map(lineRow) : h('tr', {}, h('td', { colspan: 8, class: 'empty' }, 'Aucune ligne.')));
  refresh();
}

function addLineControls() {
  if (!editable()) return null;
  const select = h('select', { style: 'max-width:360px' }, h('option', { value: '' }, 'Ajouter depuis le catalogue…'),
    meta.categories.map((cat) => {
      const items = catalog.filter((c) => c.category === cat.code);
      return items.length ? h('optgroup', { label: cat.label }, items.map((c) => h('option', { value: c.id }, `${c.label} — ${formatEuros(c.basePriceHT)} / ${UNIT_LABELS[c.unit]}`))) : null;
    }));
  select.addEventListener('change', () => {
    const item = catalog.find((c) => c.id === Number(select.value));
    select.value = '';
    if (!item) return;
    quote.lines.push({
      catalogItemId: item.id, label: item.label, description: item.description, unit: item.unit, unitPriceHT: item.basePriceHT,
      quantity: 1, discountType: 'AUCUNE', discountValue: 0, recurring: item.unit === 'MOIS', isOption: false, position: quote.lines.length,
    });
    touch();
    renderLines();
  });
  const free = h('button', {
    class: 'btn small', type: 'button',
    onclick: () => {
      quote.lines.push({ catalogItemId: null, label: 'Nouvelle ligne', description: '', unit: 'FORFAIT', unitPriceHT: 0, quantity: 1, discountType: 'AUCUNE', discountValue: 0, recurring: false, isOption: false, position: quote.lines.length });
      touch();
      renderLines();
    },
  }, '+ Ligne libre');
  return h('div', { class: 'actions', style: 'margin-top:0.75rem' }, select, free);
}

/* ---------- Paramètres du devis ---------- */

function numField(text, key, { suffix = '%', euros = false } = {}) {
  const input = h('input', { type: 'text', inputmode: 'decimal', disabled: !editable(), value: euros ? centsToInput(quote[key]) : String(quote[key] ?? '').replace('.', ',') });
  input.addEventListener('input', () => {
    quote[key] = euros ? parseEuros(input.value) ?? 0 : parseNumber(input.value);
    touch();
  });
  return h('label', { class: 'field' }, `${text} (${euros ? '€' : suffix})`, input);
}

function settingsCard() {
  const ro = !editable();
  const regime = h('select', { disabled: ro }, meta.vatRegimes.map((v) => h('option', { value: v.code }, v.label)));
  regime.value = quote.vatRegime;
  regime.addEventListener('change', () => { quote.vatRegime = regime.value; touch(); });
  const vatNum = h('input', { type: 'text', value: quote.clientVatNumber, disabled: ro, placeholder: 'FR00123456789' });
  vatNum.addEventListener('input', () => { quote.clientVatNumber = vatNum.value.trim(); touch(); });
  const validity = h('input', { type: 'number', min: 1, max: 365, value: quote.validityDays, disabled: ro });
  validity.addEventListener('input', () => { quote.validityDays = Number(validity.value) || 30; touch(); });
  const payment = h('select', { disabled: ro }, h('option', { value: '' }, 'Non précisée'), meta.paymentChoices.map((p) => h('option', { value: p.code }, p.label)));
  payment.value = quote.selectedPayment;
  payment.addEventListener('change', () => { quote.selectedPayment = payment.value; touch(); });
  const notes = h('textarea', { disabled: ro, placeholder: 'Remarques affichées sur le devis' });
  notes.value = quote.notes;
  notes.addEventListener('input', () => { quote.notes = notes.value; touch(); });
  const legal = h('textarea', { disabled: ro, rows: 4 });
  legal.value = quote.legalMentions;
  legal.addEventListener('input', () => { quote.legalMentions = legal.value; touch(); });

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Conditions'),
    h(
      'div',
      { class: 'grid' },
      h('label', { class: 'field' }, 'Régime de TVA', regime),
      h('label', { class: 'field' }, 'N° TVA intracommunautaire du client', vatNum),
      h('label', { class: 'field' }, 'Validité (jours)', validity),
      h('label', { class: 'field' }, 'Modalité retenue', payment),
      numField('Remise comptant', 'cashDiscountPct'),
      numField('À la commande (3 fois)', 'depositPct'),
      numField('Apport (mensualisé)', 'monthlyDownPayment', { euros: true }),
      numField('Majoration 12 mois', 'monthlySurcharge12Pct'),
      numField('Majoration 24 mois', 'monthlySurcharge24Pct'),
      numField('Majoration 36 mois', 'monthlySurcharge36Pct'),
      h('label', { class: 'field full' }, 'Remarques', notes),
      h('label', { class: 'field full' }, 'Mentions légales du prestataire', legal),
    ),
    vatAlert,
  );
}

/* ---------- Actions ---------- */

async function save({ silent = false } = {}) {
  quote = await api.put(`/api/quotes/${quote.id}`, quote);
  dirty = false;
  if (!silent) toast('Devis enregistré');
  render();
}

const run = (fn) => async () => {
  try { await fn(); } catch (err) { showError(err); }
};

function actions() {
  const list = [];
  if (editable()) {
    list.push(
      h('button', { class: 'btn primary', type: 'button', onclick: run(() => save()) }, 'Enregistrer'),
      h('button', {
        class: 'btn accent', type: 'button',
        onclick: run(async () => {
          const r = computeQuote(quote);
          const warn = r.missingClientVat ? ' Attention : numéro de TVA intracommunautaire du client manquant.' : '';
          if (!(await confirmDialog(`Émettre le devis ? Il recevra un numéro définitif et ne sera plus modifiable.${warn}`, { confirmLabel: 'Émettre' }))) return;
          if (dirty) await save({ silent: true });
          quote = await api.post(`/api/quotes/${quote.id}/emettre`);
          toast(`Devis ${quote.number} émis`);
          render();
        }),
      }, 'Émettre'),
    );
  } else {
    if (quote.status !== 'SIGNE') list.push(h('button', { class: 'btn', type: 'button', onclick: run(async () => { quote = await api.post(`/api/quotes/${quote.id}/statut`, { status: 'SIGNE' }); render(); }) }, 'Marquer signé'));
    if (quote.status !== 'REFUSE') list.push(h('button', { class: 'btn', type: 'button', onclick: run(async () => { quote = await api.post(`/api/quotes/${quote.id}/statut`, { status: 'REFUSE' }); render(); }) }, 'Marquer refusé'));
  }
  const beforeExport = async () => { if (dirty) await save({ silent: true }); };
  list.push(
    h('button', { class: 'btn', type: 'button', onclick: run(async () => { await beforeExport(); window.open(`/devis-print?id=${quote.id}`, '_blank'); }) }, 'PDF / imprimer'),
    h('button', { class: 'btn', type: 'button', onclick: run(async () => { await beforeExport(); download(`/api/quotes/${quote.id}/devis.md`); }) }, 'Markdown'),
    h('button', { class: 'btn', type: 'button', onclick: run(async () => { const copy = await api.post(`/api/quotes/${quote.id}/dupliquer`); location.href = `/devis?id=${copy.id}`; }) }, 'Dupliquer'),
  );
  if (editable()) {
    list.push(h('button', {
      class: 'btn danger', type: 'button',
      onclick: run(async () => {
        if (!(await confirmDialog('Supprimer ce brouillon ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
        await api.del(`/api/quotes/${quote.id}`);
        dirty = false;
        location.href = `/fiche?id=${quote.clientId}#exports`;
      }),
    }, 'Supprimer'));
  }
  return list;
}

function render() {
  const r = computeQuote(quote);
  const client = quote.client;
  document.title = `${quote.number || `Brouillon #${quote.id}`} — Briefs & devis`;
  statusEl.textContent = editable() ? '' : 'Devis émis : lecture seule. Dupliquez-le pour le modifier.';
  statusEl.classList.remove('dirty');
  clear(
    app,
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        {},
        h('a', { href: `/fiche?id=${quote.clientId}#exports`, class: 'small' }, `← ${client.nomCommercial || client.raisonSociale}`),
        h('h1', {}, quote.number ? `Devis ${quote.number}` : `Devis brouillon #${quote.id}`, ' ', h('span', { class: `badge ${quote.status}` }, STATUS[quote.status])),
        h('p', { class: 'muted small' }, quote.issuedAt ? `Émis le ${formatDate(r.issuedAt)} · valable jusqu’au ${formatDate(r.validUntil)}` : 'Le numéro est attribué à l’émission.'),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Lignes'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'quote-lines' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Désignation'), h('th', {}, 'Type'), h('th', {}, 'Qté'), h('th', {}, 'Unité'), h('th', {}, 'PU HT (€)'), h('th', {}, 'Remise'), h('th', { class: 'num' }, 'Total HT'), h('th', {}))),
        linesBody,
      )),
      addLineControls(),
    ),
    h('section', { class: 'card' }, h('h2', {}, 'Totaux'), totalsEl),
    settingsCard(),
    h('section', { class: 'card' }, h('h2', {}, 'Modalités de règlement'), paymentsEl),
    h('div', { class: 'savebar' }, statusEl, h('div', { class: 'actions' }, actions())),
  );
  renderLines();
}

render();
