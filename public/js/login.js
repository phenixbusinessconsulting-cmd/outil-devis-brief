import { api } from './api.js';

const form = document.getElementById('login');
const error = document.getElementById('error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.classList.add('hidden');
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api.post('/api/auth/login', {
      username: form.username.value,
      password: form.password.value,
    });
    const next = new URLSearchParams(location.search).get('next');
    // Redirection interne uniquement.
    location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/clients';
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('hidden');
    button.disabled = false;
  }
});
