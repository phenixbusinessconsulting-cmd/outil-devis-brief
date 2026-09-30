// Outils d'interface communs : construction du DOM sans innerHTML (aucune
// donnée saisie n'est jamais interprétée comme du HTML), en-tête, messages.
import { api } from './api.js';

/** h('div', { class: 'x', onclick: fn }, enfant, 'texte', …) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = Boolean(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(message, type = '') {
  const el = h('div', { class: `toast ${type}`, role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3000);
}

export function showError(err) {
  console.error(err);
  toast(err.message || 'Erreur', 'error');
}

/** Euros saisis (« 1 500,50 ») → centimes ; vide → null. */
export function parseEuros(value) {
  const s = String(value ?? '').replace(/[\s €]/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Centimes → valeur d'un champ (« 1500,5 »). */
export function centsToInput(cents) {
  if (cents === null || cents === undefined) return '';
  return String(cents / 100).replace('.', ',');
}

export function parseNumber(value) {
  const n = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export const params = new URLSearchParams(location.search);

export function download(url) {
  const a = h('a', { href: url, download: '' });
  document.body.append(a);
  a.click();
  a.remove();
}

let currentUser = null;
export const user = () => currentUser;

/** En-tête commun ; renvoie l'utilisateur connecté. */
export async function initPage(active) {
  currentUser = await api.get('/api/auth/me');
  const links = [
    ['clients', '/clients', 'Fiches clients'],
    ['devis', '/devis-liste', 'Devis'],
  ];
  if (currentUser.role === 'ADMIN') {
    links.push(['catalogue', '/admin-catalogue', 'Catalogue'], ['parametres', '/admin-parametres', 'Paramètres'], ['utilisateurs', '/admin-utilisateurs', 'Utilisateurs']);
  }
  const logout = async (e) => {
    e.preventDefault();
    await api.post('/api/auth/logout');
    location.href = '/login';
  };
  document.body.prepend(
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, 'Phenix ', h('span', {}, '·'), ' Briefs & devis'),
      h('nav', {}, links.map(([key, href, label]) => h('a', { href, class: key === active ? 'active' : '' }, label))),
      h(
        'div',
        { class: 'user' },
        h('a', { href: '/compte', title: 'Mon compte' }, currentUser.displayName),
        h('a', { href: '#', onclick: logout }, 'Déconnexion'),
      ),
    ),
  );
  return currentUser;
}

export function confirmDialog(message, { confirmLabel = 'Confirmer', danger = false, typed = null } = {}) {
  return new Promise((resolve) => {
    const input = typed ? h('input', { type: 'text', placeholder: typed, autocomplete: 'off' }) : null;
    const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'submit' }, confirmLabel);
    const dlg = h(
      'dialog',
      {},
      h(
        'form',
        { method: 'dialog' },
        h('p', {}, message),
        typed && h('p', { class: 'small muted' }, 'Pour confirmer, tapez : ', h('strong', {}, typed)),
        input,
        h('div', { class: 'actions', style: 'justify-content:flex-end;margin-top:1rem' }, h('button', { class: 'btn', value: 'cancel', type: 'submit' }, 'Annuler'), ok),
      ),
    );
    ok.value = 'ok';
    dlg.addEventListener('close', () => {
      const confirmed = dlg.returnValue === 'ok' && (!typed || input.value.trim() === typed);
      dlg.remove();
      resolve(confirmed ? (typed ? input.value.trim() : true) : false);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function formatDateTime(d) {
  return d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d)) : '—';
}
