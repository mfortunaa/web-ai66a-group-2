import { API_BASE_URL } from './config.js';

const TOKEN_KEY = 'eventy_access_token';
const frontendRoot = new URL('../', import.meta.url);
export const loginUrl = new URL('index.html', frontendRoot).href;
export const eventsUrl = new URL('pages/events.html', frontendRoot).href;

// The short-lived token belongs to this tab. Never store passwords or refresh tokens.
export function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
export function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }
export function logout() { clearToken(); window.location.replace(loginUrl); }

async function authRequest(path, options = {}) {
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
    throw error;
  }
  return data;
}

export function register(fullName, email, password) {
  return authRequest('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), password }),
  });
}

export async function login(email, password) {
  const result = await authRequest('/api/auth/token', {
    method: 'POST', body: new URLSearchParams({ username: email.trim(), password }),
  });
  sessionStorage.setItem(TOKEN_KEY, result.access_token);
  return result;
}

export async function getCurrentUser() {
  const token = getToken();
  if (!token) { const error = new Error('Vui lòng đăng nhập.'); error.status = 401; throw error; }
  try {
    return await authRequest('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
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
