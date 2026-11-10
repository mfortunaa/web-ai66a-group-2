import { API_BASE_URL } from './config.js';

const TOKEN_KEY = 'eventy_access_token';
const frontendRoot = new URL('../', import.meta.url);
export const loginUrl = new URL('index.html', frontendRoot).href;
export const eventsUrl = new URL('pages/events.html', frontendRoot).href;
export const adminLoginUrl = new URL('pages/admin-login.html', frontendRoot).href;
export const adminEventsUrl = new URL('pages/admin-events.html', frontendRoot).href;
export const verifyEmailUrl = new URL('pages/verify-email.html', frontendRoot).href;

// The short-lived token belongs to this tab. Never store passwords or refresh tokens.
export function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
export function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }
export function logout({ redirect = loginUrl } = {}) { clearToken(); window.location.replace(redirect); }

export async function authRequest(path, options = {}) {
  let response;
  try { response = await fetch(`${API_BASE_URL}${path}`, options); }
  catch { throw new Error('Không thể kết nối máy chủ. Vui lòng thử lại sau.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages = {
      401: 'Email hoặc mật khẩu không chính xác, hoặc phiên đăng nhập đã hết hạn.',
      409: 'Email này đã được đăng ký.',
      422: 'Thông tin chưa hợp lệ. Kiểm tra email, họ tên và mật khẩu (8 ký tự, tối đa 72 byte).',
    };
    const error = new Error(messages[response.status] || 'Có lỗi xảy ra. Vui lòng thử lại.');
    error.status = response.status;
    error.code = data.detail?.code;
    error.retryAfter = Number(response.headers.get('Retry-After') || data.detail?.retry_after || 0);
    const codes = {
      email_not_verified: 'Vui lòng xác thực email trước khi đăng nhập.',
      invalid_challenge: 'Mã không hợp lệ, đã hết hạn hoặc đã sử dụng. Vui lòng yêu cầu mã mới.',
      delivery_failed: 'Chưa gửi được email. Vui lòng thử gửi lại sau 60 giây.',
      rate_limited: 'Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.',
    };
    if (codes[error.code]) error.message = codes[error.code];
    throw error;
  }
  return data;
}

export function postAuth(action, data) {
  return authRequest(`/api/auth/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}

export function register(fullName, email, password) {
  return authRequest('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), password }),
  });
}

export async function login(email, password, { adminOnly = false } = {}) {
  const result = await authRequest('/api/auth/token', {
    method: 'POST', body: new URLSearchParams({ username: email.trim(), password }),
  });
  if (adminOnly && (await fetchProfile(result.access_token)).role !== 'admin') {
    throw new Error('Tài khoản này chưa được cấp quyền quản trị.');
  }
  sessionStorage.setItem(TOKEN_KEY, result.access_token);
  return result;
}

function fetchProfile(token) {
  return authRequest('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
}

export async function getCurrentUser() {
  const token = getToken();
  if (!token) { const error = new Error('Vui lòng đăng nhập.'); error.status = 401; throw error; }
  try {
    return await fetchProfile(token);
  } catch (error) {
    if (error.status === 401) clearToken();
    throw error;
  }
}

export async function requireAuth() {
  try { return await getCurrentUser(); }
  catch (error) {
    if (error.status === 401) window.location.replace(loginUrl);
    throw error;
  }
}
