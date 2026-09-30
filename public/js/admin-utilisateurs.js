import { api } from './api.js';
import { h, $, clear, initPage, toast, showError, formatDateTime } from './ui.js';

const me = await initPage('utilisateurs');
const app = $('#app');
if (me.role !== 'ADMIN') {
  clear(app, h('p', { class: 'alert danger' }, 'Accès réservé à l’administrateur.'));
  throw new Error('forbidden');
}
const ROLES = { ADMIN: 'Administrateur', COMMERCIAL: 'Commercial' };
const listCard = h('div', { class: 'card' });

function editor(user = null) {
  const username = h('input', { type: 'text', value: user?.username || '', disabled: Boolean(user), autocomplete: 'off' });
  const displayName = h('input', { type: 'text', value: user?.displayName || '' });
  const role = h('select', {}, Object.entries(ROLES).map(([k, v]) => h('option', { value: k }, v)));
  role.value = user?.role || 'COMMERCIAL';
  const password = h('input', { type: 'password', autocomplete: 'new-password', placeholder: user ? 'Laisser vide pour ne pas changer' : '10 caractères minimum' });
  const active = h('input', { type: 'checkbox', checked: user ? user.active : true });
  const dlg = h('dialog', {}, h('form', { method: 'dialog' },
    h('h2', {}, user ? `Modifier ${user.username}` : 'Nouvel utilisateur'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' },
      h('label', { class: 'field' }, 'Identifiant', username),
      h('label', { class: 'field' }, 'Nom affiché', displayName),
      h('label', { class: 'field' }, 'Rôle', role),
      h('label', { class: 'field' }, user ? 'Nouveau mot de passe' : 'Mot de passe', password),
      user ? h('label', { class: 'check' }, active, 'Compte actif') : null,
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
      const body = { displayName: displayName.value, role: role.value, password: password.value || undefined, active: active.checked };
      if (user) await api.put(`/api/admin/users/${user.id}`, body);
      else await api.post('/api/admin/users', { ...body, username: username.value });
      toast('Utilisateur enregistré');
      load();
    } catch (err) { showError(err); }
  });
  document.body.append(dlg);
  dlg.showModal();
}

async function load() {
  const users = await api.get('/api/admin/users');
  clear(listCard, h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Identifiant'), h('th', {}, 'Nom'), h('th', {}, 'Rôle'), h('th', {}, 'Dernière connexion'), h('th', {}, 'État'), h('th', {}))),
    h('tbody', {}, users.map((u) => h('tr', { class: u.active ? '' : 'inactive' },
      h('td', {}, h('strong', {}, u.username)),
      h('td', {}, u.displayName),
      h('td', {}, ROLES[u.role]),
      h('td', {}, formatDateTime(u.lastLoginAt)),
      h('td', {}, u.active ? 'Actif' : 'Désactivé'),
      h('td', { class: 'right' }, h('button', { class: 'btn small', onclick: () => editor(u) }, 'Modifier')),
    ))),
  )));
}

clear(app,
  h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Utilisateurs'), h('p', { class: 'muted' }, 'Les commerciaux accèdent aux fiches et aux devis ; les administrateurs, en plus, au catalogue et aux paramètres.')),
    h('button', { class: 'btn primary', onclick: () => editor() }, '+ Utilisateur'),
  ),
  listCard,
);
load().catch(showError);
