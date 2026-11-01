import { logout, requireAuth } from './auth.js';

document.querySelector('#logout').addEventListener('click', logout);
const retry = document.querySelector('#retry');
const message = document.querySelector('#page-message');

async function loadAccount() {
  retry.hidden = true;
  message.textContent = 'Đang kiểm tra tài khoản…';
  try {
    const user = await requireAuth();
    document.querySelector('#user-name').textContent = user.full_name;
    document.querySelector('#user-email').textContent = user.email;
    document.querySelector('#account-content').hidden = false;
    message.textContent = '';
  } catch (error) {
    message.textContent = error.message;
    retry.hidden = error.status === 401;
  }
}
retry.addEventListener('click', loadAccount);
await loadAccount();
