// Change only this value if the backend runs on another host or port.
export const API_BASE_URL = window.location.port === '8000'
  ? window.location.origin
  : 'http://127.0.0.1:8000';
