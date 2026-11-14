import { adminEventsUrl, eventsUrl, getCurrentUser, getToken, login, register, verifyEmailUrl } from './auth.js?v=5';
import { initializeSitePreferences, translate } from './site-preferences.js?v=7';
import { localizeMessage } from './flow-messages.js';

// Lấy các phần tử form chung; cùng controller này phục vụ register, login và admin login.
initializeSitePreferences();
const form = document.querySelector('form');
const message = document.querySelector('#form-message');
const button = form.querySelector('button[type="submit"]');
const adminOnly = form.id === 'admin-login-form';
const isRegistration = form.id === 'register-form';
let busy = false;

function updateSubmitLabel() {
  const until = Number(form.dataset.blockedUntil || 0);
  const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  if (seconds) button.textContent = `${translate('Thử lại sau', 'Try again in')} ${seconds}s`;
  else button.textContent = busy
    ? translate(isRegistration ? 'Đang tạo tài khoản…' : 'Đang đăng nhập…', isRegistration ? 'Creating account…' : 'Signing in…')
    : translate(isRegistration ? 'Tạo tài khoản' : 'Đăng nhập', isRegistration ? 'Create account' : 'Sign in');
}

function updatePasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((toggle) => {
    const input = document.getElementById(toggle.getAttribute('aria-controls'));
    const visible = input.type === 'text';
    const show = translate('Hiện', 'Show');
    const hide = translate('Ẩn', 'Hide');
    const label = input.id === 'confirm-password'
      ? translate('mật khẩu nhập lại', 'confirmation password')
      : translate('mật khẩu', 'password');
    toggle.textContent = visible ? hide : show;
    toggle.setAttribute('aria-label', `${visible ? hide : show} ${label}`);
  });
}

window.addEventListener('eventy:languagechange', () => {
  if (message.textContent) message.textContent = localizeMessage(message.textContent);
  updatePasswordToggles();
  updateSubmitLabel();
});
updatePasswordToggles();

// Nút cạnh mỗi password chỉ đổi kiểu input, không submit form.
document.querySelectorAll('.password-toggle').forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const input = document.getElementById(toggle.getAttribute('aria-controls'));
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    updatePasswordToggles();
  });
});

// Đánh dấu lỗi, nối thông báo với field và đưa focus đến chỗ cần sửa.
function showFieldError(fieldName, text) {
  const field = form.elements.namedItem(fieldName);
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', 'form-message');
  message.textContent = localizeMessage(text);
  field.focus();
}

// Khi người dùng sửa input, bỏ trạng thái lỗi cũ.
form.addEventListener('input', (event) => {
  if (event.target.matches('input')) {
    event.target.removeAttribute('aria-invalid');
    event.target.removeAttribute('aria-describedby');
  }
});

// Token hợp lệ thì chuyển tài khoản đã đăng nhập khỏi màn hình auth.
if (getToken()) {
  getCurrentUser().then((user) => {
    if (!adminOnly || user.role === 'admin') {
      window.location.replace(adminOnly ? adminEventsUrl : eventsUrl);
    }
  }).catch(() => {});
}

// Chặn submit mặc định để controller tự validate và gọi API.
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  message.classList.remove('success');
  message.textContent = '';
  const data = new FormData(form);
  const password = data.get('password');
  // Các kiểm tra riêng cho đăng ký trước khi gửi dữ liệu tới backend.
  if (isRegistration) {
    if (!data.get('full_name').trim()) { showFieldError('full_name', 'Vui lòng nhập họ và tên.'); return; }
    if (password !== data.get('confirm_password')) { showFieldError('confirm_password', 'Mật khẩu nhập lại không khớp.'); return; }
  }
  busy = true;
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  updateSubmitLabel();
  try {
    // Đăng ký lưu email cho bước xác thực, còn login đi thẳng vào trang phù hợp.
    if (isRegistration) {
      const result = await register(data.get('full_name'), data.get('email'), password);
      sessionStorage.setItem('eventy_verification_email', data.get('email').trim());
      window.location.replace(new URL(`verify-email.html?delivery=${result.verification_delivery}`, window.location.href));
    } else {
      await login(data.get('email'), password, { adminOnly });
      window.location.replace(adminOnly ? adminEventsUrl : eventsUrl);
    }
  } catch (error) {
    // Email chưa xác thực thì đưa người dùng sang trang nhập mã xác thực.
    if (error.code === 'email_not_verified') {
      sessionStorage.setItem('eventy_verification_email', data.get('email').trim());
      window.location.assign(verifyEmailUrl);
      return;
    }
    if (error.status === 409) showFieldError('email', error.message);
    else message.textContent = localizeMessage(error.message);
    // Nếu API trả Retry-After, khóa submit đến hết thời gian chờ.
    if (error.retryAfter) {
      const until = Date.now() + error.retryAfter * 1000;
      form.dataset.blockedUntil = until;
      const timer = setInterval(() => {
        const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        button.disabled = seconds > 0;
        if (seconds) button.textContent = `${translate('Thử lại sau', 'Try again in')} ${seconds}s`;
        else updateSubmitLabel();
        if (!seconds) { delete form.dataset.blockedUntil; clearInterval(timer); }
      }, 250);
    }
  }
  finally {
    // Luôn khôi phục trạng thái nút/form, trừ khi server còn yêu cầu chờ.
    busy = false;
    button.disabled = Boolean(form.dataset.blockedUntil);
    updateSubmitLabel();
    form.setAttribute('aria-busy', 'false');
  }
});
