import { api } from './api.js';
import { h, $, clear, initPage, toast, showError, parseEuros, centsToInput, download, confirmDialog } from './ui.js';
import { formatEuros } from '/shared/pricing.js';

const me = await initPage('catalogue');
const app = $('#app');
if (me.role !== 'ADMIN') {
  clear(app, h('p', { class: 'alert danger' }, 'Accès réservé à l’administrateur.'));
  throw new Error('forbidden');
}
const meta = await api.get('/api/meta');
const label = (list, code) => list.find((x) => x.code === code)?.label ?? code;
let items = [];
const tableCard = h('div', { class: 'card' });

function editor(item = null) {
  const data = item ? { ...item } : { code: '', label: '', description: '', basePriceHT: 0, unit: 'FORFAIT', category: 'SITE', active: true, position: items.length };
  const input = (key, attrs = {}) => {
    const el = h('input', { type: 'text', value: data[key], ...attrs });
    el.addEventListener('input', () => (data[key] = el.value));
    return el;
  };
  const price = h('input', { type: 'text', inputmode: 'decimal', value: centsToInput(data.basePriceHT) });
  const select = (key, list) => {
    const el = h('select', {}, list.map((x) => h('option', { value: x.code }, x.label)));
    el.value = data[key];
    el.addEventListener('change', () => (data[key] = el.value));
    return el;
  };
  const desc = h('textarea', { rows: 3 });
  desc.value = data.description;
  desc.addEventListener('input', () => (data.description = desc.value));
  const active = h('input', { type: 'checkbox', checked: data.active });
  const position = h('input', { type: 'number', value: data.position });

  const dlg = h('dialog', {}, h('form', { method: 'dialog' },
    h('h2', {}, item ? 'Modifier la prestation' : 'Nouvelle prestation'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr' },
      h('label', { class: 'field full' }, 'Libellé', input('label', { required: true })),
      h('label', { class: 'field' }, 'Code (unique, stable)', input('code', { placeholder: 'contact.whatsapp', disabled: Boolean(item) })),
      h('label', { class: 'field' }, 'Prix de base HT (€)', price),
      h('label', { class: 'field' }, 'Unité', select('unit', meta.units)),
      h('label', { class: 'field' }, 'Catégorie', select('category', meta.categories)),
      h('label', { class: 'field full' }, 'Description commerciale', desc),
      h('label', { class: 'field' }, 'Ordre', position),
      h('label', { class: 'check', style: 'align-self:end' }, active, 'Active'),
    ),
    h('div', { class: 'actions', style: 'justify-content:flex-end;margin-top:1rem' },
      h('button', { class: 'btn', value: 'cancel' }, 'Annuler'),
      h('button', { class: 'btn primary', value: 'ok' }, 'Enregistrer'),
    ),
  ));
  dlg.addEventListener('close', async () => {
    dlg.remove();
    if (dlg.returnValue !== 'ok') return;
    try {
      const body = { ...data, basePriceHT: parseEuros(price.value) ?? 0, active: active.checked, position: Number(position.value) || 0 };
      if (item) await api.put(`/api/admin/catalog/${item.id}`, body);
      else await api.post('/api/admin/catalog', body);
      toast('Catalogue mis à jour');
      load();
    } catch (err) { showError(err); }
  });
  document.body.append(dlg);
  dlg.showModal();
}

async function remove(item) {
  const ok = await confirmDialog(`Supprimer « ${item.label} » ? Elle sera décochée de toutes les fiches ; les devis existants gardent leurs lignes. Pour la retirer sans rien perdre, désactivez-la plutôt.`, { danger: true, confirmLabel: 'Supprimer' });
  if (!ok) return;
  try {
    await api.del(`/api/admin/catalog/${item.id}`);
    load();
  } catch (err) { showError(err); }
}

function render() {
  clear(tableCard, meta.categories.map((cat) => {
    const list = items.filter((i) => i.category === cat.code);
    if (!list.length) return null;
    return h('div', { style: 'margin-bottom:1.25rem' },
      h('h3', {}, cat.label),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Libellé'), h('th', {}, 'Code'), h('th', { class: 'num' }, 'Prix HT'), h('th', {}, 'Unité'), h('th', {}, 'État'), h('th', {}))),
        h('tbody', {}, list.map((i) => h('tr', { class: i.active ? '' : 'inactive' },
          h('td', {}, h('strong', {}, i.label), i.description ? h('div', { class: 'small muted' }, i.description) : null),
          h('td', { class: 'small muted' }, i.code),
          h('td', { class: 'num' }, i.basePriceHT ? formatEuros(i.basePriceHT) : h('span', { class: 'badge option' }, 'à définir')),
          h('td', {}, label(meta.units, i.unit)),
          h('td', {}, i.active ? 'Active' : 'Inactive'),
          h('td', { class: 'nowrap right' },
            h('button', { class: 'btn small', onclick: () => editor(i) }, 'Modifier'), ' ',
            h('button', { class: 'btn small danger', onclick: () => remove(i) }, 'Supprimer'),
          ),
        ))),
      )),
    );
  }));
}

async function load() {
  items = await api.get('/api/catalog?all=1');
  render();
}

const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    const count = (Array.isArray(json) ? json : json.items || []).length;
    if (!(await confirmDialog(`Importer ${count} ligne(s) ? Les lignes de même code seront mises à jour, les autres créées.`, { confirmLabel: 'Importer' }))) return;
    const res = await api.post('/api/admin/catalog/import', json);
    toast(`${res.created} créée(s), ${res.updated} mise(s) à jour`);
    load();
  } catch (err) {
    showError(err instanceof SyntaxError ? new Error('Fichier JSON illisible') : err);
  }
});

clear(app,
  h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Catalogue de prestations'), h('p', { class: 'muted' }, 'Chaque ligne active apparaît comme case à cocher dans les fiches, et fournit son tarif au devis.')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => download('/api/admin/catalog/export') }, 'Exporter (JSON)'),
      h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Importer (JSON)'),
      h('button', { class: 'btn primary', onclick: () => editor() }, '+ Prestation'),
      fileInput,
    ),
  ),
  tableCard,
);
load().catch(showError);
