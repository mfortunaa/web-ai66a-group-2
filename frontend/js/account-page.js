import { apiRequest } from './api.js?v=3';
import { logout, requireAuth } from './auth.js?v=5';
import { initializeSitePreferences, translate as t } from './site-preferences.js?v=7';
import { localizeMessage } from './flow-messages.js';

initializeSitePreferences();
document.querySelector('#logout').addEventListener('click', logout);
const retry = document.querySelector('#retry');
const pageMessage = document.querySelector('#page-message');
const form = document.querySelector('#account-form');
const formMessage = document.querySelector('#form-message');
const nameInput = document.querySelector('#user-name');
const emailInput = document.querySelector('#user-email');
const birthDateInput = document.querySelector('#date-of-birth');
const phoneInput = document.querySelector('#phone-number');
const saveButton = document.querySelector('#save-profile');
let saving = false;

async function loadAccount() {
  retry.hidden = true;
  form.hidden = true;
  pageMessage.textContent = t('Đang tải thông tin tài khoản…', 'Loading account details…');
  try {
    const user = await requireAuth();
    nameInput.value = user.full_name;
    emailInput.value = user.email;
    birthDateInput.value = user.date_of_birth || '';
    phoneInput.value = user.phone_number || '';
    form.hidden = false;
    pageMessage.textContent = '';
  } catch (error) {
    pageMessage.textContent = localizeMessage(error.message);
    retry.hidden = error.status === 401;
  }
}

form.addEventListener('input', (event) => {
  event.target.removeAttribute('aria-invalid');
  formMessage.textContent = '';
  formMessage.classList.remove('success');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || !form.reportValidity()) return;
  const fullName = nameInput.value.trim();
  if (!fullName) {
    nameInput.setAttribute('aria-invalid', 'true');
    formMessage.textContent = t('Vui lòng nhập họ và tên.', 'Enter your full name.');
    nameInput.focus();
    return;
  }

  saving = true;
  saveButton.disabled = true;
  form.setAttribute('aria-busy', 'true');
  saveButton.textContent = t('Đang lưu…', 'Saving…');
  formMessage.textContent = '';
  formMessage.classList.remove('success');
  try {
    const user = await apiRequest('/api/auth/me', {
      method: 'PATCH',
      body: {
        full_name: fullName,
        date_of_birth: birthDateInput.value || null,
        phone_number: phoneInput.value.trim() || null,
      },
    });
    nameInput.value = user.full_name;
    birthDateInput.value = user.date_of_birth || '';
    phoneInput.value = user.phone_number || '';
    formMessage.textContent = t('Đã lưu thông tin tài khoản.', 'Account details saved.');
    formMessage.classList.add('success');
  } catch (error) {
    formMessage.textContent = localizeMessage(error.message);
  } finally {
    saving = false;
    saveButton.disabled = false;
    saveButton.textContent = t('Lưu thay đổi', 'Save changes');
    form.setAttribute('aria-busy', 'false');
  }
});

window.addEventListener('eventy:languagechange', () => {
  pageMessage.textContent = localizeMessage(pageMessage.textContent);
  formMessage.textContent = localizeMessage(formMessage.textContent);
  if (saving) saveButton.textContent = t('Đang lưu…', 'Saving…');
  else saveButton.textContent = t('Lưu thay đổi', 'Save changes');
});

retry.addEventListener('click', loadAccount);
await loadAccount();
