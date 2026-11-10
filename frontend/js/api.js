import { API_BASE_URL } from './config.js';
import { clearToken, getToken, loginUrl } from './auth.js';

const errorMessages = {
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu được yêu cầu.',
  422: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
};

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function getErrorDetails(data) {
  const detail = data?.detail;
  if (typeof detail === 'string') return { message: detail };
  if (detail && typeof detail === 'object') {
    return {
      message: typeof detail.message === 'string' ? detail.message : undefined,
      code: typeof detail.code === 'string' ? detail.code : undefined,
    };
  }
  return {};
}

export async function apiRequest(path, options = {}) {
  const { body, headers: requestHeaders, loginRedirect = loginUrl, ...requestOptions } = options;
  const headers = new Headers(requestHeaders);
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let requestBody = body;
  if (body !== undefined && body !== null && typeof body === 'object'
      && !(body instanceof FormData) && !(body instanceof URLSearchParams)
      && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  } else if (body instanceof URLSearchParams && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
  }

  let response;
  try {
    response = await fetch(new URL(path, API_BASE_URL), {
      ...requestOptions,
      headers,
      body: requestBody,
    });
  } catch {
    throw new ApiError('Không thể kết nối máy chủ. Vui lòng thử lại sau.');
  }

  let data;
  try {
    data = response.status === 204 ? null : await response.json();
  } catch {
    if (response.ok) {
      throw new ApiError('Máy chủ trả về dữ liệu không hợp lệ.', { status: response.status });
    }
    data = null;
  }

  if (!response.ok) {
    const { message, code } = getErrorDetails(data);
    const error = new ApiError(message || errorMessages[response.status]
      || 'Đã xảy ra lỗi. Vui lòng thử lại.', { status: response.status, code });
    if (response.status === 401) {
      clearToken();
      window.location.replace(loginRedirect);
    }
    throw error;
  }

  return data;
}
