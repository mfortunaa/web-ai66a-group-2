// Change only this value if the backend runs on another host or port.
// The optional standalone frontend server uses 5500. Native FastAPI and
// Docker serve the frontend and API together, including custom mapped ports.
export const API_BASE_URL = window.location.port === '5500'
  ? 'http://127.0.0.1:8000'
  : window.location.origin;
