import { api } from './api.js';
import { h, $, clear, initPage, toast, showError } from './ui.js';

const me = await initPage('');
const current = h('input', { type: 'password', autocomplete: 'current-password', required: true });
const next = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 10 });
const confirm = h('input', { type: 'password', autocomplete: 'new-password', required: true });

clear($('#app'),
  h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Mon compte'), h('p', { class: 'muted' }, `${me.displayName} · ${me.username} · ${me.role === 'ADMIN' ? 'Administrateur' : 'Commercial'}`))),
  h('form', {
    class: 'card', style: 'max-width:480px',
    onsubmit: async (e) => {
      e.preventDefault();
      if (next.value !== confirm.value) return showError(new Error('Les deux saisies diffèrent'));
      try {
        await api.post('/api/auth/password', { current: current.value, next: next.value });
        e.target.reset();
        toast('Mot de passe modifié ; vos autres sessions ont été fermées');
      } catch (err) { showError(err); }
    },
  },
    h('h2', {}, 'Changer de mot de passe'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' },
      h('label', { class: 'field' }, 'Mot de passe actuel', current),
      h('label', { class: 'field' }, 'Nouveau mot de passe (10 caractères minimum)', next),
      h('label', { class: 'field' }, 'Confirmer', confirm),
      h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer'),
    ),
  ),
);
