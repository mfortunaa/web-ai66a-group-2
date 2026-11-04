import { eventsUrl, getCurrentUser, getToken, login, register } from './auth.js';

const form = document.querySelector('form');
const message = document.querySelector('#form-message');
const button = form.querySelector('button[type="submit"]');
const originalLabel = button.textContent;

document.querySelectorAll('.password-toggle').forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const input = document.getElementById(toggle.getAttribute('aria-controls'));
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    toggle.textContent = visible ? 'Ẩn' : 'Hiện';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', `${visible ? 'Ẩn' : 'Hiện'} ${input.id === 'confirm-password' ? 'mật khẩu nhập lại' : 'mật khẩu'}`);
  });
});

function showFieldError(fieldName, text) {
  const field = form.elements.namedItem(fieldName);
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', 'form-message');
  message.textContent = text;
  field.focus();
}

form.addEventListener('input', (event) => {
  if (event.target.matches('input')) {
    event.target.removeAttribute('aria-invalid');
    if (event.target.id === 'password' && form.id === 'register-form') {
      event.target.setAttribute('aria-describedby', 'password-hint');
    } else { event.target.removeAttribute('aria-describedby'); }
  }
});

if (getToken()) {
  getCurrentUser().then(() => window.location.replace(eventsUrl)).catch(() => {});
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  message.classList.remove('success');
  message.textContent = '';
  const data = new FormData(form);
  const password = data.get('password');
  const isRegistration = form.id === 'register-form';
  if (isRegistration) {
    if (!data.get('full_name').trim()) { showFieldError('full_name', 'Vui lòng nhập họ và tên.'); return; }
    if (password !== data.get('confirm_password')) { showFieldError('confirm_password', 'Mật khẩu nhập lại không khớp.'); return; }
    if (new TextEncoder().encode(password).length > 72 || password.includes('\0')) {
      showFieldError('password', 'Mật khẩu tối đa 72 byte UTF-8 và không chứa ký tự null.'); return;
    }
  }
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  button.textContent = isRegistration ? 'Đang tạo tài khoản…' : 'Đang đăng nhập…';
  try {
    if (isRegistration) {
      const result = await register(data.get('full_name'), data.get('email'), password);
      sessionStorage.setItem('eventy_verification_email', data.get('email').trim());
      window.location.replace(new URL(`verify-email.html?delivery=${result.verification_delivery}`, window.location.href));
    } else {
      await login(data.get('email'), password);
      window.location.replace(eventsUrl);
    }
  } catch (error) {
    if (error.code === 'email_not_verified') {
      sessionStorage.setItem('eventy_verification_email', data.get('email').trim());
      window.location.assign(new URL('pages/verify-email.html', window.location.href));
      return;
    }
    if (error.status === 409) showFieldError('email', error.message);
    else message.textContent = error.message;
    if (error.retryAfter) {
      const until = Date.now() + error.retryAfter * 1000;
      form.dataset.blockedUntil = until;
      const timer = setInterval(() => {
        const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        button.disabled = seconds > 0;
        button.textContent = seconds ? `Thử lại sau ${seconds}s` : originalLabel;
        if (!seconds) { delete form.dataset.blockedUntil; clearInterval(timer); }
      }, 250);
    }
  }
  finally {
    button.disabled = Boolean(form.dataset.blockedUntil); button.textContent = originalLabel;
    form.setAttribute('aria-busy', 'false');
  }
});
