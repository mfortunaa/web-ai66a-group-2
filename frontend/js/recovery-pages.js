import { postAuth, loginUrl } from './auth.js?v=5';
import { initializeSitePreferences, translate } from './site-preferences.js?v=7';
import { localizeMessage } from './flow-messages.js';

initializeSitePreferences();
const form = document.querySelector('form');
const message = document.querySelector('#form-message');
const submit = form.querySelector('[type="submit"]');
const resend = document.querySelector('#resend');
const action = form.dataset.action;
const email = form.elements.namedItem('email');
if (email) email.value = sessionStorage.getItem('eventy_verification_email') || '';
// Read once from the fragment, then remove it from the address/history.
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
if (location.hash) history.replaceState(null, '', location.pathname);
let busy = false;
let blockedUntil = 0;
let resendUntil = action === 'verify-email' && location.search ? Date.now() + 60000 : 0;
let complete = false;
const label = () => translate(
  action === 'verify-email' ? 'Xác thực email' : action === 'forgot-password' ? 'Gửi liên kết' : 'Đổi mật khẩu',
  action === 'verify-email' ? 'Verify email' : action === 'forgot-password' ? 'Send link' : 'Change password',
);

function setMessage(text) {
  message.textContent = localizeMessage(text);
}

function controls() {
  const remaining = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
  submit.disabled = busy || complete || remaining > 0;
  submit.textContent = busy ? translate('Đang xử lý…', 'Working…')
    : remaining ? `${translate('Thử lại sau', 'Try again in')} ${remaining}s` : label();
  if (resend) {
    const seconds = Math.max(remaining, Math.ceil((resendUntil - Date.now()) / 1000));
    resend.disabled = busy || complete || seconds > 0;
    resend.textContent = seconds > 0
      ? `${translate('Gửi lại sau', 'Resend in')} ${seconds}s`
      : translate('Gửi lại mã', 'Resend code');
  }
}
setInterval(controls, 250);
controls();
if (new URLSearchParams(location.search).get('delivery') === 'retry') {
  setMessage('Đã tạo tài khoản nhưng chưa gửi được email. Vui lòng thử gửi lại mã sau 60 giây.');
}
if (action === 'reset-password' && !token) {
  setMessage('Thiếu liên kết đặt lại mật khẩu. Vui lòng yêu cầu email mới.');
  complete = true; controls();
}

window.addEventListener('eventy:languagechange', () => {
  const hadLoginLink = Boolean(message.querySelector('a'));
  if (message.textContent) setMessage(message.textContent);
  if (hadLoginLink) {
    const link = document.createElement('a');
    link.href = loginUrl;
    link.textContent = translate(' Đăng nhập', ' Sign in');
    message.append(link);
  }
  controls();
});

async function send(isResend = false) {
  if (busy || complete || blockedUntil > Date.now()) return;
  if (!isResend && !form.reportValidity()) return;
  if (isResend && !email.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  if (action === 'reset-password' && data.password !== data.confirm_password) {
    setMessage('Mật khẩu nhập lại không khớp.'); form.elements.confirm_password.focus(); return;
  }
  if (email) sessionStorage.setItem('eventy_verification_email', data.email.trim());
  busy = true; controls(); form.setAttribute('aria-busy', 'true');
  message.classList.remove('success'); message.textContent = '';
  try {
    await postAuth(isResend ? 'resend-verification' : action,
      action === 'reset-password' ? { token, password: data.password } : isResend ? { email: data.email } : data);
    message.classList.add('success');
    if (isResend) { resendUntil = Date.now() + 60000; setMessage('Nếu tài khoản cần xác thực, mã mới sẽ đến hộp thư. Hãy kiểm tra cả thư rác.'); }
    else if (action === 'forgot-password') { setMessage('Nếu email đủ điều kiện, bạn sẽ nhận được liên kết đặt lại mật khẩu. Kiểm tra hộp thư hoặc thử lại sau.'); blockedUntil = Date.now() + 60000; }
    else {
      complete = true;
      setMessage(action === 'verify-email' ? 'Email đã được xác thực. Bạn có thể đăng nhập.' : 'Đã đổi mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.');
      const link = document.createElement('a'); link.href = loginUrl; link.textContent = translate(' Đăng nhập', ' Sign in'); message.append(link);
    }
  } catch (error) {
    setMessage(error.message);
    if (error.retryAfter) blockedUntil = Date.now() + error.retryAfter * 1000;
    if (isResend && error.code === 'delivery_failed') resendUntil = Date.now() + 60000;
  } finally { busy = false; form.setAttribute('aria-busy', 'false'); controls(); }
}
form.addEventListener('submit', event => { event.preventDefault(); send(); });
resend?.addEventListener('click', () => send(true));
