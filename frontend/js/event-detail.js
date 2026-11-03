import { API_BASE_URL } from './config.js';
import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js';

const params = new URLSearchParams(window.location.search);
const eventId = params.get('event_id');
const message = document.querySelector('#page-message');
const retryButton = document.querySelector('#retry');
const content = document.querySelector('#event-content');
const timeZone = 'Asia/Ho_Chi_Minh';

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'full', timeStyle: 'short', timeZone,
});
const statusLabels = {
  on_sale: 'Đang mở bán',
  coming_soon: 'Sắp mở bán',
  sold_out: 'Đã bán hết',
  closed: 'Đã đóng bán',
};
const unavailableMessages = {
  schedule_not_defined: 'Lịch sự kiện đang được cập nhật. Vé sẽ chưa thể đặt cho đến khi có lịch cụ thể.',
  coming_soon: 'Sự kiện chưa mở bán.',
  sold_out: 'Sự kiện đã bán hết vé.',
  closed: 'Thời gian mở bán đã kết thúc.',
  no_available_sessions: 'Hiện không còn suất diễn có thể đặt.',
};

document.querySelector('#logout').addEventListener('click', logout);

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Thời gian đang cập nhật' : dateTimeFormatter.format(date);
}

function setMessage(text, error = false) {
  message.textContent = text;
  message.className = `page-message${error ? ' error' : ''}`;
}

function formatPrice(value) {
  return `${Number(value).toLocaleString('vi-VN')} ₫`;
}

function imageUrl(path) {
  try {
    return new URL(path, `${API_BASE_URL}/`).href;
  } catch {
    return '';
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderSessions(sessions) {
  const section = document.querySelector('#sessions-section');
  const list = document.querySelector('#event-sessions');
  section.hidden = !sessions.length;
  list.replaceChildren(...sessions.map((session) => {
    const item = makeElement('li', 'session-item');
    const time = makeElement('span', 'session-time',
      `${formatDateTime(session.starts_at)} – ${formatDateTime(session.ends_at)}`);
    const availability = makeElement('span', 'session-availability',
      session.is_bookable
        ? `Còn ${session.available_tickets.toLocaleString('vi-VN')} vé`
        : session.available_tickets > 0 ? 'Chưa mở bán hoặc đã đóng' : 'Đã hết vé');
    item.append(time, availability);
    return item;
  }));
}

function renderEvent(event) {
  const image = document.querySelector('#event-image');
  const fallback = document.querySelector('#poster-fallback');
  image.src = imageUrl(event.image_url);
  image.alt = `Ảnh sự kiện ${event.title}`;
  image.addEventListener('error', () => {
    image.hidden = true;
    fallback.hidden = false;
  }, { once: true });

  const status = document.querySelector('#event-status');
  status.textContent = statusLabels[event.sale_status] || 'Đang cập nhật';
  status.classList.toggle('unavailable', event.sale_status === 'closed' || event.sale_status === 'sold_out');
  document.querySelector('#event-title').textContent = event.title;
  document.querySelector('#event-time').textContent =
    `${formatDateTime(event.starts_at)} – ${formatDateTime(event.ends_at)}`;
  document.querySelector('#event-venue').textContent = event.venue;
  document.querySelector('#event-address').textContent = event.address;
  document.querySelector('#event-price').textContent = formatPrice(event.ticket_price_vnd);
  document.querySelector('#event-description').textContent = event.description;
  document.querySelector('#event-availability').textContent =
    event.available_tickets > 0
      ? `Còn ${event.available_tickets.toLocaleString('vi-VN')} vé`
      : 'Chưa có vé khả dụng';

  const salesOpening = document.querySelector('#sales-opening');
  salesOpening.hidden = event.sale_status !== 'coming_soon';
  salesOpening.textContent = `Mở bán lúc ${formatDateTime(event.sales_open_at)} (giờ Việt Nam).`;

  const buyLink = document.querySelector('#buy-tickets');
  const isBookable = event.sale_status === 'on_sale' && event.is_bookable;
  buyLink.hidden = !isBookable;
  buyLink.href = `booking.html?event_id=${encodeURIComponent(event.id)}`;

  const bookingNote = document.querySelector('#booking-note');
  const reason = event.booking_unavailable_reason;
  bookingNote.hidden = isBookable || !reason;
  bookingNote.textContent = unavailableMessages[reason] || 'Sự kiện hiện chưa thể đặt vé.';

  renderSessions(event.sessions || []);
  content.hidden = false;
  setMessage('');
}

async function loadEvent() {
  retryButton.hidden = true;
  content.hidden = true;
  if (!eventId || !/^[1-9]\d*$/.test(eventId)) {
    setMessage('Mã sự kiện không hợp lệ hoặc không được cung cấp.', true);
    return;
  }

  setMessage('Đang tải thông tin sự kiện…');
  try {
    const event = await apiRequest(`/api/events/${encodeURIComponent(eventId)}`);
    if (!event || !Array.isArray(event.sessions)) {
      throw new Error('Dữ liệu sự kiện từ máy chủ không hợp lệ.');
    }
    renderEvent(event);
  } catch (error) {
    setMessage(error.message || 'Không thể tải thông tin sự kiện.', true);
    retryButton.hidden = error.status === 401 || error.status === 404;
  }
}

retryButton.addEventListener('click', loadEvent);

async function start() {
  setMessage('Đang kiểm tra đăng nhập…');
  try {
    await requireAuth();
    await loadEvent();
  } catch (error) {
    setMessage(error.message || 'Không thể xác minh tài khoản.', true);
    retryButton.hidden = error.status === 401;
  }
}

start();
