import { API_BASE_URL } from './config.js';
import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js';

const form = document.querySelector('#filters');
const message = document.querySelector('#page-message');
const retryButton = document.querySelector('#retry');
const sections = document.querySelector('#catalog-sections');
const emptyMessage = document.querySelector('#catalog-empty');
const formControls = form.querySelectorAll('input, select, button');
let retryAction = loadEvents;

const timeZone = 'Asia/Ho_Chi_Minh';
const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone,
});
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone,
});
const statusLabels = {
  on_sale: 'Đang mở bán',
  coming_soon: 'Sắp mở bán',
  sold_out: 'Đã bán hết',
  closed: 'Đã đóng bán',
};

document.querySelector('#logout').addEventListener('click', logout);

function formatDate(value, formatter = dateFormatter) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Thời gian đang cập nhật' : formatter.format(date);
}

function eventDate(event) {
  const start = formatDate(event.starts_at);
  const end = formatDate(event.ends_at);
  return start === end ? start : `${start} – ${end}`;
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

function createEventCard(event) {
  const card = makeElement('article', 'event-card');
  const poster = makeElement('figure', 'event-poster');
  const image = document.createElement('img');
  image.src = imageUrl(event.image_url);
  image.alt = `Ảnh sự kiện ${event.title}`;
  image.loading = 'lazy';
  const fallback = makeElement('span', 'poster-fallback', 'Chưa có ảnh sự kiện');
  fallback.hidden = true;
  image.addEventListener('error', () => {
    image.hidden = true;
    fallback.hidden = false;
  }, { once: true });
  poster.append(image, fallback);

  const content = makeElement('div', 'event-card-content');
  const heading = makeElement('div', 'event-card-heading');
  heading.append(
    makeElement('h3', '', event.title),
    makeElement('span', `status-pill${event.sale_status === 'on_sale' || event.sale_status === 'coming_soon' ? '' : ' unavailable'}`,
      statusLabels[event.sale_status] || 'Đang cập nhật'),
  );
  const date = makeElement('p', 'event-meta', `Thời gian: ${eventDate(event)}`);
  const description = makeElement('p', 'event-description', event.description);
  const price = makeElement('p', 'event-price', formatPrice(event.ticket_price_vnd));
  const detail = document.createElement('a');
  detail.className = 'event-card-link';
  detail.href = `event-detail.html?event_id=${encodeURIComponent(event.id)}`;
  detail.textContent = 'Xem chi tiết';
  content.append(heading, date, description, price, detail);
  card.append(poster, content);
  return card;
}

function updateSection(events, listId, countId, emptyId) {
  const list = document.querySelector(`#${listId}`);
  const empty = document.querySelector(`#${emptyId}`);
  const count = document.querySelector(`#${countId}`);
  list.replaceChildren(...events.map(createEventCard));
  count.textContent = String(events.length);
  empty.hidden = events.length > 0;
}

function setMessage(text, kind = '') {
  message.textContent = text;
  message.className = `page-message${kind ? ` ${kind}` : ''}`;
}

function setFormDisabled(disabled) {
  formControls.forEach((control) => {
    control.disabled = disabled;
  });
}

function updateCatalog(items) {
  const selectedStatus = form.elements.sale_status.value;
  const events = selectedStatus ? items.filter((event) => event.sale_status === selectedStatus) : items;
  const onSale = events.filter((event) => event.sale_status === 'on_sale');
  const comingSoon = events.filter((event) => event.sale_status === 'coming_soon');
  const unavailable = events.filter((event) => event.sale_status === 'sold_out' || event.sale_status === 'closed');

  updateSection(onSale, 'on-sale-events', 'on-sale-count', 'on-sale-empty');
  updateSection(comingSoon, 'coming-soon-events', 'coming-soon-count', 'coming-soon-empty');
  document.querySelector('#unavailable-events').replaceChildren(...unavailable.map(createEventCard));
  document.querySelector('#unavailable-count').textContent = String(unavailable.length);
  document.querySelector('#unavailable-section').hidden = unavailable.length === 0;
  document.querySelector('#on-sale-title').closest('section').hidden = selectedStatus !== '' && selectedStatus !== 'on_sale';
  document.querySelector('#coming-soon-title').closest('section').hidden = selectedStatus !== '' && selectedStatus !== 'coming_soon';
  sections.hidden = false;
  emptyMessage.hidden = events.length > 0;
  if (events.length === 0) sections.hidden = true;
}

async function loadEvents() {
  retryButton.hidden = true;
  emptyMessage.hidden = true;
  sections.hidden = true;
  setMessage('Đang tải danh sách sự kiện…');
  setFormDisabled(true);
  try {
    const data = await apiRequest('/api/events');
    if (!data || !Array.isArray(data.items)) {
      throw new Error('Dữ liệu sự kiện từ máy chủ không hợp lệ.');
    }
    updateCatalog(data.items);
    setMessage('');
  } catch (error) {
    setMessage(error.message || 'Không thể tải danh sách sự kiện.', 'error');
    retryButton.hidden = error.status === 401;
    retryAction = loadEvents;
  } finally {
    setFormDisabled(false);
  }
}

async function applyFilters() {
  const dateFrom = form.elements.date_from.value;
  const dateTo = form.elements.date_to.value;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    setMessage('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'error');
    retryButton.hidden = true;
    return;
  }

  const query = new URLSearchParams();
  if (dateFrom) query.set('date_from', dateFrom);
  if (dateTo) query.set('date_to', dateTo);
  retryButton.hidden = true;
  emptyMessage.hidden = true;
  sections.hidden = true;
  setMessage('Đang lọc sự kiện…');
  setFormDisabled(true);
  try {
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : '';
    const data = await apiRequest(`/api/events${suffix}`);
    if (!data || !Array.isArray(data.items)) {
      throw new Error('Dữ liệu sự kiện từ máy chủ không hợp lệ.');
    }
    updateCatalog(data.items);
    setMessage('');
  } catch (error) {
    setMessage(error.message || 'Không thể lọc danh sách sự kiện.', 'error');
    retryButton.hidden = error.status === 401;
    retryAction = applyFilters;
  } finally {
    setFormDisabled(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  applyFilters();
});
form.addEventListener('reset', () => {
  window.setTimeout(loadEvents, 0);
});
retryButton.addEventListener('click', () => retryAction());

async function start() {
  setMessage('Đang kiểm tra đăng nhập…');
  retryButton.hidden = true;
  try {
    await requireAuth();
    await loadEvents();
  } catch (error) {
    setMessage(error.message || 'Không thể xác minh tài khoản.', 'error');
    retryButton.hidden = error.status === 401;
    retryAction = start;
  }
}

start();
