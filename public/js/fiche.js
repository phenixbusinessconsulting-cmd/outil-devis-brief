import { api } from './api.js';
import {
  h, $, clear, initPage, toast, showError, parseEuros, centsToInput, params, download, confirmDialog, formatDateTime,
} from './ui.js';
import { formatEuros } from '/shared/pricing.js';

await initPage('clients');
const app = $('#app');

const [meta, catalog] = await Promise.all([api.get('/api/meta'), api.get('/api/catalog')]);
const label = (list, code) => list.find((x) => x.code === code)?.label ?? code;

const EMPTY = {
  raisonSociale: '', nomCommercial: '', secteur: '', anneeCreation: null, siret: '', formeJuridique: '', assurances: '',
  tvaIntracom: '', adresse: '', codePostal: '', ville: '', communes: [], rayonKm: null, motClePrincipal: '',
  motsClesSecond: [], longueTraine: [], concurrents: [], nbAvisGoogle: null, noteGoogle: null, temoignages: '',
  realisations: '', certifications: '', telephone: '', email: '', horaires: {}, reseaux: {}, lienGbp: '', tons: [],
  elementsLangage: '', couleursImposees: [], policesImposees: '', niveauAnimation: 'SOBRE', offerings: [], modules: [],
  references: [],
};

let state = structuredClone(EMPTY);
let quotes = [];
let dirty = false;
const statusEl = h('span', { class: 'status' });

function setDirty(v = true) {
  dirty = v;
  statusEl.textContent = v ? 'Modifications non enregistrées' : state.id ? `Enregistrée ${formatDateTime(state.updatedAt)}` : 'Nouvelle fiche';
  statusEl.classList.toggle('dirty', v);
}
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

/* ---------- Champs liés à l'état ---------- */

function field(text, key, { type = 'text', full = false, textarea = false, placeholder = '', required = false, obj = state, attrs = {} } = {}) {
  const value = obj[key] ?? '';
  const input = textarea
    ? h('textarea', { placeholder, ...attrs })
    : h('input', { type, placeholder, required, ...attrs });
  input.value = value;
  input.addEventListener('input', () => {
    obj[key] = type === 'number' ? (input.value === '' ? null : Number(input.value.replace(',', '.'))) : input.value;
    setDirty();
  });
  return h('label', { class: `field${full ? ' full' : ''}` }, text + (required ? ' *' : ''), input);
}

/** Liste « une valeur par ligne » dans un textarea. */
function linesField(text, key, placeholder) {
  const input = h('textarea', { placeholder, rows: 4 });
  input.value = (state[key] || []).join('\n');
  input.addEventListener('input', () => {
    state[key] = input.value.split('\n').map((s) => s.trim()).filter(Boolean);
    setDirty();
  });
  return h('label', { class: 'field' }, text, h('span', { class: 'small muted', style: 'font-weight:400' }, 'Une entrée par ligne'), input);
}

function checkbox(text, checked, onchange, attrs = {}) {
  const input = h('input', { type: 'checkbox', checked, ...attrs });
  input.addEventListener('change', () => {
    onchange(input.checked, input);
    setDirty();
  });
  return h('label', { class: 'check' }, input, text);
}

function section(id, title, ...content) {
  return h('section', { class: 'card', id }, h('h2', {}, title), ...content);
}

/* ---------- Listes répétables ---------- */

function repeatable(list, renderRow, makeEmpty, addLabel) {
  const container = h('div', { class: 'rows' });
  const render = () =>
    clear(
      container,
      list.map((item, i) =>
        renderRow(item, () => {
          list.splice(i, 1);
          setDirty();
          render();
        }),
      ),
    );
  render();
  const add = h('button', { class: 'btn small', type: 'button', onclick: () => { list.push(makeEmpty()); setDirty(); render(); container.lastElementChild?.querySelector('input')?.focus(); } }, `+ ${addLabel}`);
  return h('div', {}, container, h('div', { style: 'margin-top:0.6rem' }, add));
}

const removeBtn = (onRemove) => h('button', { class: 'btn danger icon', type: 'button', title: 'Supprimer la ligne', onclick: onRemove }, '✕');

/* ---------- Sections ---------- */

function sectionIdentite() {
  return section(
    'identite',
    'Identité',
    h(
      'div',
      { class: 'grid' },
      field('Raison sociale', 'raisonSociale', { required: true }),
      field('Nom commercial', 'nomCommercial'),
      field('Secteur d’activité', 'secteur', { placeholder: 'Plomberie, boulangerie…' }),
      field('Année de création', 'anneeCreation', { type: 'number', attrs: { min: 1800, max: 2100 } }),
      field('SIRET', 'siret', { attrs: { inputmode: 'numeric' } }),
      field('Forme juridique', 'formeJuridique', { placeholder: 'SARL, SAS, EI…' }),
      field('N° TVA intracommunautaire', 'tvaIntracom', { placeholder: 'FR…' }),
      field('Assurances à afficher', 'assurances', { full: true, textarea: true, placeholder: 'Décennale, RC Pro (assureur, n° de contrat, zone couverte)…' }),
    ),
  );
}

function sectionImplantation() {
  state.communes ||= [];
  const bulk = h('input', { type: 'text', placeholder: 'Ajouter plusieurs communes séparées par des virgules, puis Entrée' });
  let communesBlock;
  const renderCommunes = () =>
    repeatable(
      state.communes,
      (c, remove) =>
        h(
          'div',
          { class: 'row-item commune' },
          h('input', { type: 'text', value: c.nom, placeholder: 'Commune', oninput: (e) => { c.nom = e.target.value; setDirty(); } }),
          checkbox('Importante (page dédiée)', c.importante, (v) => (c.importante = v)),
          removeBtn(remove),
        ),
      () => ({ nom: '', importante: false }),
      'Commune',
    );
  communesBlock = renderCommunes();
  bulk.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    bulk.value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).forEach((nom) => state.communes.push({ nom, importante: false }));
    bulk.value = '';
    setDirty();
    const fresh = renderCommunes();
    communesBlock.replaceWith(fresh);
    communesBlock = fresh;
  });
  return section(
    'implantation',
    'Implantation',
    h(
      'div',
      { class: 'grid' },
      field('Adresse', 'adresse', { full: true }),
      field('Code postal', 'codePostal'),
      field('Ville principale', 'ville'),
      field('Rayon d’intervention (km)', 'rayonKm', { type: 'number', attrs: { min: 0 } }),
    ),
    h('h3', {}, 'Communes de la zone de chalandise'),
    h('p', { class: 'small muted' }, 'Les communes marquées « importantes » reçoivent chacune une page dans l’arborescence du brief.'),
    bulk,
    h('div', { style: 'margin-top:0.6rem' }, communesBlock),
  );
}

function sectionOffre() {
  state.offerings ||= [];
  const money = (o, key) => {
    const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: '€', value: centsToInput(o[key]) });
    input.addEventListener('input', () => { o[key] = parseEuros(input.value); setDirty(); });
    return input;
  };
  return section(
    'offre',
    'Offre',
    h('p', { class: 'small muted' }, 'Prestations ou gammes. Chacune reçoit une page dans l’arborescence du brief.'),
    repeatable(
      state.offerings,
      (o, remove) =>
        h(
          'div',
          { class: 'row-item offering' },
          h('label', { class: 'field' }, 'Nom', h('input', { type: 'text', value: o.name, oninput: (e) => { o.name = e.target.value; setDirty(); } })),
          h('label', { class: 'field' }, 'Description courte', h('input', { type: 'text', value: o.description, oninput: (e) => { o.description = e.target.value; setDirty(); } })),
          h('label', { class: 'field' }, 'Prix min', money(o, 'priceMin')),
          h('label', { class: 'field' }, 'Prix max', money(o, 'priceMax')),
          removeBtn(remove),
        ),
      () => ({ name: '', description: '', priceMin: null, priceMax: null }),
      'Prestation',
    ),
  );
}

function sectionModules() {
  // Catalogue actif + modules déjà cochés dont la ligne a depuis été désactivée.
  const items = [...catalog];
  (state.modules || []).forEach((m) => {
    if (m.catalogItem && !items.some((i) => i.id === m.catalogItemId)) items.push(m.catalogItem);
  });
  const byId = new Map((state.modules || []).map((m) => [m.catalogItemId, m]));

  const groups = meta.categories.map((cat) => {
    const catItems = items.filter((i) => i.category === cat.code);
    if (!catItems.length) return null;
    return h(
      'div',
      { class: 'module-group' },
      h('h3', {}, cat.label),
      catItems.map((item) => {
        const row = h('div', { class: 'module' });
        const precision = h('input', { type: 'text', placeholder: 'Précision (optionnel)' });
        const current = byId.get(item.id);
        precision.value = current?.precision || '';
        const optionBox = h('input', { type: 'checkbox', checked: current?.isOption });
        const sync = () => {
          const on = byId.has(item.id);
          row.classList.toggle('on', on);
          precision.disabled = !on;
          optionBox.disabled = !on;
        };
        const main = checkbox(item.label, Boolean(current), (checked) => {
          if (checked) byId.set(item.id, { catalogItemId: item.id, precision: precision.value, isOption: optionBox.checked });
          else byId.delete(item.id);
          state.modules = [...byId.values()];
          sync();
        });
        precision.addEventListener('input', () => {
          const m = byId.get(item.id);
          if (m) { m.precision = precision.value; setDirty(); }
        });
        optionBox.addEventListener('change', () => {
          const m = byId.get(item.id);
          if (m) { m.isOption = optionBox.checked; setDirty(); }
        });
        clear(
          row,
          h('div', {}, main, h('div', { class: 'price' }, item.basePriceHT ? `${formatEuros(item.basePriceHT)} HT / ${label(meta.units, item.unit).replace('Par ', '').toLowerCase()}` : 'Tarif à définir', item.active ? '' : ' · inactif')),
          precision,
          h('label', { class: 'check small' }, optionBox, 'À chiffrer en option'),
        );
        sync();
        return row;
      }),
    );
  });
  return section(
    'modules',
    'Modules et prestations complémentaires',
    h('p', { class: 'small muted' }, 'Cochés = inclus dans la prestation. « À chiffrer en option » = vendu en plus, chiffré à part sur le devis.'),
    groups,
  );
}

function sectionSeo() {
  state.concurrents ||= [];
  return section(
    'seo',
    'SEO',
    h('div', { class: 'grid two' }, field('Mot-clé principal', 'motClePrincipal', { placeholder: 'plombier' }), h('span')),
    h('div', { class: 'grid two', style: 'margin-top:0.9rem' }, linesField('Mots-clés secondaires', 'motsClesSecond', 'dépannage plomberie\nchauffagiste'), linesField('Expressions longue traîne', 'longueTraine', 'plombier urgence dimanche villeurbanne')),
    h('h3', {}, 'Concurrents identifiés'),
    repeatable(
      state.concurrents,
      (c, remove) =>
        h(
          'div',
          { class: 'row-item concurrent' },
          h('input', { type: 'text', value: c.nom, placeholder: 'Nom', oninput: (e) => { c.nom = e.target.value; setDirty(); } }),
          h('input', { type: 'url', value: c.url, placeholder: 'https://', oninput: (e) => { c.url = e.target.value; setDirty(); } }),
          removeBtn(remove),
        ),
      () => ({ nom: '', url: '' }),
      'Concurrent',
    ),
  );
}

function sectionPreuves() {
  return section(
    'preuves',
    'Preuves',
    h(
      'div',
      { class: 'grid' },
      field('Nombre d’avis Google', 'nbAvisGoogle', { type: 'number', attrs: { min: 0 } }),
      field('Note moyenne (sur 5)', 'noteGoogle', { type: 'number', attrs: { min: 0, max: 5, step: 0.1 } }),
      field('Témoignages clients', 'temoignages', { full: true, textarea: true }),
      field('Réalisations marquantes', 'realisations', { full: true, textarea: true }),
      field('Certifications et labels', 'certifications', { full: true, textarea: true, placeholder: 'RGE, Qualibat, Artisan d’art…' }),
    ),
  );
}

function sectionContact() {
  state.horaires ||= {};
  state.reseaux ||= {};
  const rows = meta.days.map((day) => {
    const hd = (state.horaires[day] ||= { ferme: false, plages: '' });
    const plages = h('input', { type: 'text', value: hd.plages, placeholder: '9h-12h, 14h-18h', disabled: hd.ferme });
    plages.addEventListener('input', () => { hd.plages = plages.value; setDirty(); });
    return h(
      'tr',
      {},
      h('td', { style: 'text-transform:capitalize;font-weight:600' }, day),
      h('td', {}, checkbox('Fermé', hd.ferme, (v) => { hd.ferme = v; plages.disabled = v; })),
      h('td', { style: 'width:60%' }, plages),
    );
  });
  const copyDown = h('button', {
    class: 'btn small', type: 'button',
    onclick: () => {
      const src = state.horaires.lundi;
      ['mardi', 'mercredi', 'jeudi', 'vendredi'].forEach((d) => (state.horaires[d] = { ...src }));
      setDirty();
      const fresh = sectionContact();
      $('#contact').replaceWith(fresh);
    },
  }, 'Recopier le lundi jusqu’au vendredi');
  return section(
    'contact',
    'Contact',
    h(
      'div',
      { class: 'grid' },
      field('Téléphone', 'telephone', { type: 'tel' }),
      field('E-mail', 'email', { type: 'email' }),
      field('Fiche Google Business Profile', 'lienGbp', { type: 'url', placeholder: 'https://g.page/…' }),
      field('Instagram', 'instagram', { type: 'url', obj: state.reseaux }),
      field('Facebook', 'facebook', { type: 'url', obj: state.reseaux }),
      field('TikTok', 'tiktok', { type: 'url', obj: state.reseaux }),
      field('LinkedIn', 'linkedin', { type: 'url', obj: state.reseaux }),
    ),
    h('h3', {}, 'Horaires'),
    h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, rows))),
    h('div', { style: 'margin-top:0.6rem' }, copyDown),
  );
}

function sectionTon() {
  state.tons ||= [];
  const boxes = [];
  const sync = () => boxes.forEach((b) => (b.disabled = !b.checked && state.tons.length >= 3));
  const checks = meta.tones.map((t) =>
    checkbox(t.label, state.tons.includes(t.code), (checked, input) => {
      if (!boxes.includes(input)) boxes.push(input);
      state.tons = checked ? [...state.tons, t.code] : state.tons.filter((x) => x !== t.code);
      sync();
    }),
  );
  checks.forEach((c) => boxes.push(c.querySelector('input')));
  sync();
  return section(
    'ton',
    'Ton et style',
    h('p', { class: 'small muted' }, 'Jusqu’à trois choix.'),
    h('div', { class: 'checks' }, checks),
    h('div', { class: 'grid', style: 'margin-top:0.9rem' }, field('Éléments de langage', 'elementsLangage', { full: true, textarea: true, placeholder: 'Tutoiement ou vouvoiement, expressions à employer ou à éviter, promesse…' })),
  );
}

/* ---------- Direction artistique ---------- */

function colorsEditor() {
  state.couleursImposees ||= [];
  const wrap = h('div', { class: 'swatches' });
  const picker = h('input', { type: 'color', value: '#1d3a5f', style: 'width:44px;height:34px;padding:2px' });
  const hex = h('input', { type: 'text', placeholder: '#1d3a5f', style: 'width:110px' });
  picker.addEventListener('input', () => (hex.value = picker.value));
  const render = () =>
    clear(
      wrap,
      state.couleursImposees.map((c, i) =>
        h('span', { class: 'swatch' }, h('i', { style: `background:${c}` }), c, h('button', { class: 'btn icon small', type: 'button', title: 'Retirer', onclick: () => { state.couleursImposees.splice(i, 1); setDirty(); render(); } }, '✕')),
      ),
      picker,
      hex,
      h('button', {
        class: 'btn small', type: 'button',
        onclick: () => {
          let v = hex.value.trim() || picker.value;
          if (!v.startsWith('#')) v = `#${v}`;
          if (!/^#[0-9a-f]{6}$/i.test(v)) return toast('Format attendu : #RRGGBB', 'error');
          state.couleursImposees.push(v.toLowerCase());
          hex.value = '';
          setDirty();
          render();
        },
      }, '+ Ajouter'),
    );
  render();
  return wrap;
}

function levelPicker(ref) {
  const wrap = h('div', { class: 'level', role: 'radiogroup', 'aria-label': 'Niveau d’inspiration' });
  const render = () =>
    clear(
      wrap,
      [1, 2, 3, 4, 5].map((n) =>
        h('button', { type: 'button', class: n <= ref.inspirationLevel ? 'on' : '', title: `${n}/5`, onclick: () => { ref.inspirationLevel = n; setDirty(); render(); } }, n),
      ),
    );
  render();
  return wrap;
}

function screenshotsBlock(ref) {
  const grid = h('div', { class: 'shots' });
  const render = () =>
    clear(
      grid,
      (ref.screenshots || []).map((s) => {
        const caption = h('input', { type: 'text', value: s.caption, placeholder: 'Légende' });
        caption.addEventListener('change', async () => {
          try {
            await api.patch(`/api/screenshots/${s.id}`, { caption: caption.value });
            s.caption = caption.value;
            toast('Légende enregistrée');
          } catch (err) { showError(err); }
        });
        return h(
          'figure',
          { class: 'shot', style: 'margin:0' },
          h('a', { href: `/api/files/${s.storedName}`, target: '_blank', rel: 'noopener' }, h('img', { src: `/api/files/${s.storedName}`, alt: s.caption || s.originalName, loading: 'lazy' })),
          h('div', { class: 'shot-body' }, caption, h('button', {
            class: 'btn danger icon small', type: 'button', title: 'Supprimer la capture',
            onclick: async () => {
              if (!(await confirmDialog('Supprimer cette capture ?', { danger: true, confirmLabel: 'Supprimer' }))) return;
              try {
                await api.del(`/api/screenshots/${s.id}`);
                ref.screenshots = ref.screenshots.filter((x) => x.id !== s.id);
                render();
              } catch (err) { showError(err); }
            },
          }, '✕')),
          h('figcaption', { class: 'small muted', style: 'padding:0 0.4rem 0.4rem' }, `${Math.round(s.sizeBytes / 1024)} Ko`),
        );
      }),
    );
  render();

  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
  const zone = h('div', { class: 'dropzone', tabindex: 0, role: 'button' }, 'Déposez des captures ici ou cliquez pour choisir (plusieurs possibles)');
  const upload = async (files) => {
    if (!files.length) return;
    try {
      if (!ref.id) {
        // La référence doit exister en base : on enregistre la fiche d'abord.
        const idx = state.references.indexOf(ref);
        await save({ silent: true });
        ref = state.references[idx];
        if (!ref?.id) throw new Error('Renseignez l’URL de la référence avant d’ajouter des captures');
      }
      zone.textContent = `Envoi et compression de ${files.length} fichier(s)…`;
      const fd = new FormData();
      [...files].forEach((f) => { fd.append('files', f); fd.append('captions', ''); });
      const created = await api.upload(`/api/references/${ref.id}/screenshots`, fd);
      ref.screenshots = [...(ref.screenshots || []), ...created];
      renderAll();
      toast(`${created.length} capture(s) ajoutée(s)`);
    } catch (err) {
      showError(err);
      zone.textContent = 'Déposez des captures ici ou cliquez pour choisir (plusieurs possibles)';
    }
  };
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && fileInput.click());
  fileInput.addEventListener('change', () => upload(fileInput.files));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); upload(e.dataTransfer.files); });
  return h('div', {}, grid, h('div', { style: 'margin-top:0.6rem' }, zone, fileInput));
}

function sectionDirection() {
  state.references ||= [];
  const refs = h('div', { class: 'rows' });
  const renderRefs = () =>
    clear(
      refs,
      state.references.map((ref, i) => {
        ref.elements ||= [];
        ref.inspirationLevel ||= 3;
        const origin = h('select', {}, meta.origins.map((o) => h('option', { value: o.code }, o.label)));
        origin.value = ref.origin || 'TIERS';
        origin.addEventListener('change', () => { ref.origin = origin.value; setDirty(); });
        return h(
          'div',
          { class: 'reference' },
          h('div', { class: 'reference-head' }, h('strong', {}, `Référence ${i + 1}`), h('button', {
            class: 'btn danger small', type: 'button',
            onclick: async () => {
              if (ref.screenshots?.length && !(await confirmDialog(`Retirer cette référence et ses ${ref.screenshots.length} capture(s) à l’enregistrement ?`, { danger: true, confirmLabel: 'Retirer' }))) return;
              state.references.splice(i, 1);
              setDirty();
              renderRefs();
            },
          }, 'Retirer')),
          h(
            'div',
            { class: 'grid two' },
            field('URL', 'url', { type: 'url', obj: ref, placeholder: 'https://', required: true }),
            h('label', { class: 'field' }, 'Origine', origin),
          ),
          h('h3', {}, 'Éléments retenus'),
          h('div', { class: 'checks' }, meta.referenceElements.map((el) =>
            checkbox(el.label, ref.elements.includes(el.code), (checked) => {
              ref.elements = checked ? [...ref.elements, el.code] : ref.elements.filter((x) => x !== el.code);
            }),
          )),
          h(
            'div',
            { class: 'grid two', style: 'margin-top:0.9rem' },
            field('Ce qui plaît', 'likes', { textarea: true, obj: ref }),
            field('À ne pas reprendre', 'avoid', { textarea: true, obj: ref }),
          ),
          h('div', { class: 'actions', style: 'margin-top:0.75rem' }, h('span', { class: 'small muted', style: 'font-weight:600' }, 'Niveau d’inspiration'), levelPicker(ref)),
          h('h3', {}, 'Captures d’écran'),
          screenshotsBlock(ref),
        );
      }),
    );
  renderRefs();

  const anim = h('select', {}, meta.animationLevels.map((a) => h('option', { value: a.code }, a.label)));
  anim.value = state.niveauAnimation || 'SOBRE';
  anim.addEventListener('change', () => { state.niveauAnimation = anim.value; setDirty(); });

  return section(
    'direction',
    'Références visuelles et direction artistique',
    h('h3', { style: 'margin-top:0' }, 'Couleurs imposées'),
    colorsEditor(),
    h('div', { class: 'grid two', style: 'margin-top:0.9rem' }, field('Polices imposées', 'policesImposees', { placeholder: 'Montserrat pour les titres, Inter pour le texte' }), h('label', { class: 'field' }, 'Niveau d’animation', anim)),
    h('h3', {}, 'Sites de référence'),
    refs,
    h('div', { style: 'margin-top:0.6rem' }, h('button', {
      class: 'btn small', type: 'button',
      onclick: () => {
        state.references.push({ url: '', origin: 'TIERS', elements: [], likes: '', avoid: '', inspirationLevel: 3, screenshots: [] });
        setDirty();
        renderRefs();
      },
    }, '+ Référence')),
  );
}

/* ---------- Devis et exports ---------- */

const STATUS = { BROUILLON: 'Brouillon', EMIS: 'Émis', SIGNE: 'Signé', REFUSE: 'Refusé' };

function sectionExports() {
  if (!state.id) {
    return section('exports', 'Brief et devis', h('p', { class: 'muted' }, 'Enregistrez la fiche pour générer le brief et les devis.'));
  }
  const guard = async (fn) => {
    try {
      if (dirty) await save({ silent: true });
    } catch {
      return;
    }
    fn();
  };
  return section(
    'exports',
    'Brief et devis',
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => guard(() => download(`/api/clients/${state.id}/brief.md`)) }, 'Brief Markdown (.md)'),
      h('button', { class: 'btn', type: 'button', onclick: () => guard(() => download(`/api/clients/${state.id}/dossier.zip`)) }, 'Dossier complet (.zip)'),
      h('button', {
        class: 'btn accent', type: 'button',
        onclick: () => guard(async () => {
          try {
            const q = await api.post(`/api/quotes/from-client/${state.id}`);
            location.href = `/devis?id=${q.id}`;
          } catch (err) { showError(err); }
        }),
      }, 'Générer un devis depuis les modules'),
    ),
    quotes.length
      ? h('div', { class: 'table-wrap', style: 'margin-top:1rem' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Devis'), h('th', {}, 'Statut'), h('th', { class: 'num' }, 'Ponctuel'), h('th', { class: 'num' }, 'Mensuel'), h('th', {}, 'Créé le'))),
          h('tbody', {}, quotes.map((q) => h('tr', { class: 'clickable', onclick: () => (location.href = `/devis?id=${q.id}`) },
            h('td', {}, h('strong', {}, q.number || `Brouillon #${q.id}`)),
            h('td', {}, h('span', { class: `badge ${q.status}` }, STATUS[q.status])),
            h('td', { class: 'num' }, formatEuros(q.oneOffDue)),
            h('td', { class: 'num' }, q.recurringDue ? `${formatEuros(q.recurringDue)} / mois` : '—'),
            h('td', {}, formatDateTime(q.createdAt)),
          ))),
        ))
      : h('p', { class: 'small muted', style: 'margin-top:1rem' }, 'Aucun devis pour cette fiche.'),
  );
}

function sectionDanger() {
  if (!state.id) return null;
  return section(
    'rgpd',
    'Suppression définitive (RGPD)',
    h('p', { class: 'small muted' }, 'Supprime la fiche, ses devis et ses captures d’écran. Irréversible (hors sauvegardes, effacées au bout de 30 jours).'),
    h('button', {
      class: 'btn danger', type: 'button',
      onclick: async () => {
        const typed = await confirmDialog('Supprimer définitivement cette fiche client ?', { danger: true, confirmLabel: 'Supprimer définitivement', typed: state.raisonSociale });
        if (!typed) return;
        try {
          await api.del(`/api/clients/${state.id}`, { confirm: typed });
          dirty = false;
          location.href = '/clients';
        } catch (err) { showError(err); }
      },
    }, 'Supprimer définitivement'),
  );
}

/* ---------- Rendu et enregistrement ---------- */

const NAV = [
  ['identite', 'Identité'], ['implantation', 'Implantation'], ['offre', 'Offre'], ['modules', 'Modules'], ['seo', 'SEO'],
  ['preuves', 'Preuves'], ['contact', 'Contact'], ['ton', 'Ton et style'], ['direction', 'Direction artistique'], ['exports', 'Brief et devis'],
];

function renderAll() {
  const title = state.id ? state.nomCommercial || state.raisonSociale : 'Nouvelle fiche client';
  document.title = `${title} — Briefs & devis`;
  clear(
    app,
    h('div', { class: 'page-head' }, h('div', {}, h('a', { href: '/clients', class: 'small' }, '← Fiches clients'), h('h1', {}, title))),
    h(
      'div',
      { class: 'fiche-layout' },
      h('nav', { class: 'fiche-nav' }, NAV.map(([id, text]) => h('a', { href: `#${id}` }, text))),
      h(
        'form',
        { novalidate: true, onsubmit: (e) => { e.preventDefault(); save().catch(() => {}); } },
        sectionIdentite(), sectionImplantation(), sectionOffre(), sectionModules(), sectionSeo(), sectionPreuves(),
        sectionContact(), sectionTon(), sectionDirection(), sectionExports(), sectionDanger(),
      ),
    ),
    h('div', { class: 'savebar' }, statusEl, h('button', { class: 'btn primary', type: 'button', onclick: () => save().catch(() => {}) }, 'Enregistrer')),
  );
  setDirty(dirty);
}

async function save({ silent = false } = {}) {
  if (!state.raisonSociale?.trim()) {
    toast('La raison sociale est obligatoire', 'error');
    $('#identite input')?.focus();
    throw new Error('Raison sociale manquante');
  }
  try {
    const saved = state.id ? await api.put(`/api/clients/${state.id}`, state) : await api.post('/api/clients', state);
    const isNew = !state.id;
    state = saved;
    dirty = false;
    if (isNew) history.replaceState(null, '', `/fiche?id=${saved.id}`);
    quotes = await api.get(`/api/quotes?clientId=${saved.id}`);
    const y = window.scrollY;
    renderAll();
    window.scrollTo(0, y);
    if (!silent) toast('Fiche enregistrée');
  } catch (err) {
    showError(err);
    throw err;
  }
}

try {
  if (params.get('id')) {
    state = await api.get(`/api/clients/${params.get('id')}`);
    quotes = await api.get(`/api/quotes?clientId=${state.id}`);
  }
  renderAll();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
} catch (err) {
  showError(err);
}
