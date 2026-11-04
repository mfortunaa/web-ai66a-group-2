import { API_BASE_URL } from './config.js';
import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js';
import { getLanguage, initializeSitePreferences, translate } from './site-preferences.js';

const params = new URLSearchParams(window.location.search);
const eventId = params.get('event_id');
const message = document.querySelector('#page-message');
const retryButton = document.querySelector('#retry');
const content = document.querySelector('#event-content');
const timeZone = 'Asia/Ho_Chi_Minh';
let currentEvent;

initializeSitePreferences();
document.querySelector('#logout').addEventListener('click', logout);
window.addEventListener('eventy:languagechange', () => {
  if (currentEvent) renderEvent(currentEvent);
});

function getDateTimeFormatters() {
  const locale = getLanguage() === 'en' ? 'en-GB' : 'vi-VN';
  return {
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
    }),
    date: new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone,
    }),
  };
}

function getStatusLabel(status) {
  const labels = {
    on_sale: translate('Đang mở bán', 'On sale'),
    coming_soon: translate('Sắp mở bán', 'Coming soon'),
    sold_out: translate('Đã bán hết', 'Sold out'),
    closed: translate('Đã đóng bán', 'Closed'),
  };
  return labels[status] || translate('Đang cập nhật', 'Updating');
}

function getUnavailableMessage(reason) {
  const messages = {
    schedule_not_defined: translate(
      'Lịch sự kiện đang được cập nhật. Vé sẽ chưa thể đặt cho đến khi có lịch cụ thể.',
      'The event schedule is being updated. Tickets will be available when a schedule is set.',
    ),
    coming_soon: translate('Sự kiện chưa mở bán.', 'Tickets are not on sale yet.'),
    sold_out: translate('Sự kiện đã bán hết vé.', 'This event is sold out.'),
    closed: translate('Thời gian mở bán đã kết thúc.', 'Ticket sales have ended.'),
    no_available_sessions: translate('Hiện không còn suất diễn có thể đặt.', 'No bookable sessions are currently available.'),
  };
  return messages[reason] || translate('Sự kiện hiện chưa thể đặt vé.', 'Tickets are currently unavailable.');
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate('Thời gian đang cập nhật', 'Time to be announced');
  const { time, date: dateFormat } = getDateTimeFormatters();
  const formattedDate = dateFormat.format(date);
  return getLanguage() === 'en'
    ? `${time.format(date)}, ${formattedDate}`
    : `${time.format(date)}, ngày ${formattedDate}`;
}

function formatDateTimeRange(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${formatDateTime(startValue)} – ${formatDateTime(endValue)}`;
  }

  const { time, date } = getDateTimeFormatters();
  const startDate = date.format(start);
  const endDate = date.format(end);
  if (startDate === endDate) {
    const dateLabel = getLanguage() === 'en' ? startDate : `ngày ${startDate}`;
    return `${time.format(start)} – ${time.format(end)}, ${dateLabel}`;
  }
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

function setMessage(text, error = false) {
  message.textContent = text;
  message.className = `page-message${error ? ' error' : ''}`;
}

function formatPrice(value) {
  const locale = getLanguage() === 'en' ? 'en-US' : 'vi-VN';
  return `${Number(value).toLocaleString(locale)} ₫`;
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
      `${translate('Thời gian', 'Time')}: ${formatDateTimeRange(session.starts_at, session.ends_at)}`);
    const ticketCount = session.available_tickets.toLocaleString(getLanguage() === 'en' ? 'en-US' : 'vi-VN');
    const availability = makeElement('span', 'session-availability',
      session.is_bookable
        ? translate(`Còn ${ticketCount} vé`, `${ticketCount} tickets left`)
        : session.available_tickets > 0
          ? translate('Chưa mở bán hoặc đã đóng', 'Not on sale or sales have ended')
          : translate('Đã hết vé', 'Sold out'));
    item.append(time, availability);
    return item;
  }));
}

function renderEvent(event) {
  const image = document.querySelector('#event-image');
  const fallback = document.querySelector('#poster-fallback');
  image.src = imageUrl(event.image_url);
  image.alt = translate(`Ảnh sự kiện ${event.title}`, `Event poster: ${event.title}`);
  image.addEventListener('error', () => {
    image.hidden = true;
    fallback.hidden = false;
  }, { once: true });

  const status = document.querySelector('#event-status');
  status.textContent = getStatusLabel(event.sale_status);
  status.classList.toggle('unavailable', event.sale_status === 'closed' || event.sale_status === 'sold_out');
  document.querySelector('#event-title').textContent = event.title;
  document.querySelector('#event-time').textContent =
    `${translate('Thời gian', 'Time')}: ${formatDateTimeRange(event.starts_at, event.ends_at)}`;
  document.querySelector('#event-venue').textContent = `${translate('Địa điểm', 'Venue')}: ${event.venue}`;
  document.querySelector('#event-address').textContent = `${translate('Địa chỉ', 'Address')}: ${event.address}`;
  document.querySelector('#event-price').textContent = formatPrice(event.ticket_price_vnd);
  document.querySelector('#event-description').textContent = event.description;
  document.querySelector('#event-availability').textContent =
    event.available_tickets > 0
      ? translate(
        `Còn ${event.available_tickets.toLocaleString('vi-VN')} vé`,
        `${event.available_tickets.toLocaleString('en-US')} tickets left`,
      )
      : translate('Chưa có vé khả dụng', 'No tickets currently available');

  const salesOpening = document.querySelector('#sales-opening');
  salesOpening.hidden = event.sale_status !== 'coming_soon';
  salesOpening.textContent = translate(
    `Mở bán lúc ${formatDateTime(event.sales_open_at)} (giờ Việt Nam).`,
    `Sales start: ${formatDateTime(event.sales_open_at)} (Vietnam time).`,
  );

  const buyLink = document.querySelector('#buy-tickets');
  const isBookable = event.sale_status === 'on_sale' && event.is_bookable;
  buyLink.hidden = !isBookable;
  buyLink.href = `booking.html?event_id=${encodeURIComponent(event.id)}`;

  const bookingNote = document.querySelector('#booking-note');
  const reason = event.booking_unavailable_reason;
  bookingNote.hidden = isBookable || !reason;
  bookingNote.textContent = getUnavailableMessage(reason);

  renderSessions(event.sessions || []);
  content.hidden = false;
  setMessage('');
}

async function loadEvent() {
  retryButton.hidden = true;
  content.hidden = true;
  if (!eventId || !/^[1-9]\d*$/.test(eventId)) {
    setMessage(translate('Mã sự kiện không hợp lệ hoặc không được cung cấp.', 'The event ID is invalid or missing.'), true);
    return;
  }

  setMessage(translate('Đang tải thông tin sự kiện…', 'Loading event details…'));
  try {
    const event = await apiRequest(`/api/events/${encodeURIComponent(eventId)}`);
    if (!event || !Array.isArray(event.sessions)) {
      throw new Error(translate('Dữ liệu sự kiện từ máy chủ không hợp lệ.', 'The event data from the server is invalid.'));
    }
    currentEvent = event;
    renderEvent(event);
  } catch (error) {
    setMessage(error.message || translate('Không thể tải thông tin sự kiện.', 'Could not load event details.'), true);
    retryButton.hidden = error.status === 401 || error.status === 404;
  }
}

retryButton.addEventListener('click', loadEvent);

async function start() {
  setMessage(translate('Đang kiểm tra đăng nhập…', 'Checking sign-in…'));
  try {
    await requireAuth();
    await loadEvent();
  } catch (error) {
    setMessage(error.message || translate('Không thể xác minh tài khoản.', 'Could not verify your account.'), true);
    retryButton.hidden = error.status === 401;
  }
}

start();
