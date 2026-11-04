import { API_BASE_URL } from './config.js';
import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js';
import { getLanguage, initializeSitePreferences, translate } from './site-preferences.js';

const form = document.querySelector('#filters');
const message = document.querySelector('#page-message');
const retryButton = document.querySelector('#retry');
const sections = document.querySelector('#catalog-sections');
const emptyMessage = document.querySelector('#catalog-empty');
const formControls = form.querySelectorAll('input, select, button');
let retryAction = loadEvents;
let catalogItems = [];

const timeZone = 'Asia/Ho_Chi_Minh';
initializeSitePreferences();
document.querySelector('#logout').addEventListener('click', logout);
window.addEventListener('eventy:languagechange', () => {
  if (catalogItems.length) updateCatalog(catalogItems);
});

function getStatusLabel(status) {
  const labels = {
    on_sale: translate('Đang mở bán', 'On sale'),
    coming_soon: translate('Sắp mở bán', 'Coming soon'),
    sold_out: translate('Đã bán hết', 'Sold out'),
    closed: translate('Đã đóng bán', 'Closed'),
  };
  return labels[status] || translate('Đang cập nhật', 'Updating');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate('Thời gian đang cập nhật', 'Time to be announced');
  const locale = getLanguage() === 'en' ? 'en-GB' : 'vi-VN';
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone,
  });
  return formatter.format(date);
}

function eventDate(event) {
  const start = formatDate(event.starts_at);
  const end = formatDate(event.ends_at);
  return start === end ? start : `${start} – ${end}`;
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

function createEventCard(event) {
  const card = makeElement('article', 'event-card');
  const poster = makeElement('figure', 'event-poster');
  const image = document.createElement('img');
  image.src = imageUrl(event.image_url);
  image.alt = translate(`Ảnh sự kiện ${event.title}`, `Event poster: ${event.title}`);
  image.loading = 'lazy';
  const fallback = makeElement('span', 'poster-fallback', translate('Chưa có ảnh sự kiện', 'No event image'));
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
        getStatusLabel(event.sale_status)),
  );
      const date = makeElement('p', 'event-meta', `${translate('Thời gian', 'Time')}: ${eventDate(event)}`);
  const description = makeElement('p', 'event-description', event.description);
  const price = makeElement('p', 'event-price', formatPrice(event.ticket_price_vnd));
  const detail = document.createElement('a');
  detail.className = 'event-card-link';
  detail.href = `event-detail.html?event_id=${encodeURIComponent(event.id)}`;
  detail.textContent = translate('Xem chi tiết', 'View details');
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
  setMessage(translate('Đang tải danh sách sự kiện…', 'Loading events…'));
  setFormDisabled(true);
  try {
    const data = await apiRequest('/api/events');
    if (!data || !Array.isArray(data.items)) {
      throw new Error(translate('Dữ liệu sự kiện từ máy chủ không hợp lệ.', 'The event data from the server is invalid.'));
    }
    catalogItems = data.items;
    updateCatalog(catalogItems);
    setMessage('');
  } catch (error) {
    setMessage(error.message || translate('Không thể tải danh sách sự kiện.', 'Could not load events.'), 'error');
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
    setMessage(translate('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'The start date must be on or before the end date.'), 'error');
    retryButton.hidden = true;
    return;
  }

  const query = new URLSearchParams();
  if (dateFrom) query.set('date_from', dateFrom);
  if (dateTo) query.set('date_to', dateTo);
  retryButton.hidden = true;
  emptyMessage.hidden = true;
  sections.hidden = true;
  setMessage(translate('Đang lọc sự kiện…', 'Filtering events…'));
  setFormDisabled(true);
  try {
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : '';
    const data = await apiRequest(`/api/events${suffix}`);
    if (!data || !Array.isArray(data.items)) {
      throw new Error(translate('Dữ liệu sự kiện từ máy chủ không hợp lệ.', 'The event data from the server is invalid.'));
    }
    catalogItems = data.items;
    updateCatalog(catalogItems);
    setMessage('');
  } catch (error) {
    setMessage(error.message || translate('Không thể lọc danh sách sự kiện.', 'Could not filter events.'), 'error');
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
  setMessage(translate('Đang kiểm tra đăng nhập…', 'Checking sign-in…'));
  retryButton.hidden = true;
  try {
    await requireAuth();
    await loadEvents();
  } catch (error) {
    setMessage(error.message || translate('Không thể xác minh tài khoản.', 'Could not verify your account.'), 'error');
    retryButton.hidden = error.status === 401;
    retryAction = start;
  }
}

start();
