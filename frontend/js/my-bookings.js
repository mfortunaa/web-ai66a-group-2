import { translate as t, getLanguage, initializeSitePreferences } from './site-preferences.js?v=7';
import { apiRequest } from './api.js?v=3';
import { logout, requireAuth } from './auth.js?v=5';
import { retryUnavailableMessage } from './booking-status.js';
import { localizeMessage } from './flow-messages.js';
import { createCancelButton } from './cancel-booking.js';

initializeSitePreferences();

const message = document.querySelector('#page-message');
const retry = document.querySelector('#retry');
const content = document.querySelector('#bookings-content');
const empty = document.querySelector('#bookings-empty');
const statusTabs = document.querySelector('#status-tabs');
const periodTabs = document.querySelector('#period-tabs');
const previous = document.querySelector('#previous-page');
const next = document.querySelector('#next-page');
const limit = 10;
let offset = 0;
let loading = false;
let reloadFilters = false;
let authenticated = false;
let statusFilter = 'all';
let periodFilter = 'upcoming';
const dateTime = { format: date => new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-GB' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date) };
const money = { format: value => new Intl.NumberFormat(getLanguage() === 'en' ? 'en-GB' : 'vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value) };
let displayedPage;
const labels = { cancelled: t('Đã hủy', 'Cancelled'), confirmed: t("Đã xác nhận", "Confirmed"), pending: t("Chờ thanh toán", "Awaiting payment"), payment_failed: t("Thanh toán thất bại", "Payment failed") };

function updateFilterButtons() {
  for (const button of statusTabs.children) {
    button.setAttribute('aria-pressed', String(button.dataset.bookingStatus === statusFilter));
  }
  for (const button of periodTabs.children) {
    button.setAttribute('aria-pressed', String(button.dataset.bookingPeriod === periodFilter));
  }
}

function attachFilterButtons(container, getValue, currentValue, setValue) {
  for (const button of container.children) {
    button.addEventListener('click', () => {
      const value = getValue(button);
      if (!value || value === currentValue()) return;
      setValue(value);
      offset = 0;
      updateFilterButtons();
      if (loading) {
        reloadFilters = true;
        return;
      }
      return loadPage();
    });
  }
}

function renderEmptyState() {
  document.querySelector('#empty-title').textContent = periodFilter === 'upcoming'
    ? t('Chưa có vé cho suất sắp hoặc đang diễn ra.', 'No bookings for upcoming or ongoing performances.')
    : t('Chưa có vé đã kết thúc.', 'No past bookings.');
  document.querySelector('#empty-description').textContent = t(
    'Thử đổi bộ lọc hoặc chọn “Mua vé ngay” để tìm một trải nghiệm mới.',
    'Try another filter, or choose “Book tickets” to find a new experience.',
  );
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function link(text, href, className = '') {
  const element = node('a', className, text);
  element.href = href;
  return element;
}
function row(booking) {
  const item = node('li', 'booking-row');
  const info = node('div', 'booking-info');
  info.append(node('span', `booking-status ${booking.status}`, localizeMessage(labels[booking.status])),
    node('h2', '', booking.event_title),
    node('p', '', `${dateTime.format(new Date(booking.session_starts_at))} – ${dateTime.format(new Date(booking.session_ends_at))}`),
    node('p', '', booking.venue),
    node('p', 'booking-reference', `${booking.reference} · ${booking.quantity} ${t('vé', 'tickets')}`),
    node('p', 'booking-created', `${t('Đặt ngày', 'Booked on')} ${dateTime.format(new Date(booking.created_at))}`));
  const actions = node('div', 'booking-actions');
  actions.append(node('strong', 'booking-total', money.format(booking.total_price_vnd)));
  const id = encodeURIComponent(booking.id);
  if (booking.status === 'confirmed') {
    actions.append(link(t("Xem vé đã xác nhận", "View confirmed tickets"), `confirmation.html?booking_id=${id}`, 'button-primary'));
  } else {
    if (booking.can_retry_payment === true) {
      actions.append(link(booking.status === 'payment_failed' ? t("Thử thanh toán lại", "Retry payment") : t("Tiếp tục thanh toán", "Continue to payment"), `payment.html?booking_id=${id}`, 'button-primary'));
    } else {
      actions.append(node('p', 'booking-unavailable', retryUnavailableMessage(booking.retry_unavailable_reason)));
    }
    actions.append(link(t("Chi tiết đặt vé", "Booking details"), `confirmation.html?booking_id=${id}`));
  }
  if (booking.status !== 'cancelled') actions.append(createCancelButton(booking, () => loadPage(offset)));
  item.append(info, actions);
  return item;
}
function validPage(data) {
  return data && Array.isArray(data.items) && data.items.length <= limit && Number.isSafeInteger(data.total) && data.total >= 0
    && data.items.every(b => Number.isSafeInteger(b.id) && b.id > 0 && Object.hasOwn(labels, b.status)
      && typeof b.can_retry_payment === 'boolean' && Number.isSafeInteger(b.total_price_vnd)
      && ['session_starts_at', 'session_ends_at', 'created_at'].every(key => Number.isFinite(Date.parse(b[key]))));
}
async function loadPage(target = offset) {
  if (loading) return;
  loading = true;
  retry.hidden = true;
  content.hidden = empty.hidden = true;
  content.setAttribute('aria-busy', 'true');
  previous.disabled = next.disabled = true;
  message.className = 'page-message';
  message.textContent = t("Đang tải đặt vé…", "Loading bookings…");
  try {
    if (!authenticated) { await requireAuth(); authenticated = true; }
    if (reloadFilters) return;
    const params = new URLSearchParams({ limit: String(limit), offset: String(target), period: periodFilter });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    const data = await apiRequest(`/api/bookings?${params}`);
    if (reloadFilters) return;
    if (!validPage(data)) throw new Error(t("Dữ liệu đặt vé không hợp lệ. Vui lòng thử lại.", "Invalid booking data. Please try again."));
    offset = target;
    displayedPage = data;
    renderPageText();
    document.querySelector('#page-range').textContent = data.items.length ? `${offset + 1}–${offset + data.items.length} / ${data.total}` : `0 / ${data.total}`;
    previous.disabled = offset === 0;
    next.disabled = offset + limit >= data.total || offset + limit > 10000;
    document.querySelector('#pagination').hidden = data.total <= limit && offset === 0;
    empty.hidden = data.total !== 0;
    content.hidden = data.total === 0;
    renderEmptyState();
    message.textContent = data.total > 0 && !data.items.length ? t("Trang này không còn đặt vé. Chọn Trang trước để xem lại.", "No bookings remain on this page. Choose Previous page.") : '';
  } catch (error) {
    if (error.status === 401) reloadFilters = false;
    if (reloadFilters) return;
    message.textContent = localizeMessage(error.message) || t("Không thể tải đặt vé. Vui lòng thử lại.", "Unable to load bookings. Please try again.");
    message.className = 'page-message error';
    retry.hidden = error.status === 401;
    // Retain the requested page when retrying a transient error.
    retry.onclick = () => loadPage(target);
  } finally {
    loading = false;
    if (reloadFilters) {
      reloadFilters = false;
      await loadPage(0);
    } else {
      content.setAttribute('aria-busy', 'false');
    }
  }
}
function renderPageText() {
  if (!displayedPage) return;
  document.querySelector('#bookings-list').replaceChildren(...displayedPage.items.map(row));
  document.querySelector('#bookings-count').textContent = `${displayedPage.total} ${t('vé · Mới nhất trước', 'tickets · Newest first')}`;
}
window.addEventListener('eventy:languagechange', () => {
  renderPageText();
  renderEmptyState();
  message.textContent = localizeMessage(message.textContent);
});
previous.addEventListener('click', () => loadPage(Math.max(0, offset - limit)));
next.addEventListener('click', () => loadPage(offset + limit));
attachFilterButtons(statusTabs, button => button.dataset.bookingStatus, () => statusFilter, value => { statusFilter = value; });
attachFilterButtons(periodTabs, button => button.dataset.bookingPeriod, () => periodFilter, value => { periodFilter = value; });
updateFilterButtons();
document.querySelector('#logout').addEventListener('click', logout);
// Also refresh after returning from payment via browser Back (including bfcache).
window.addEventListener('pageshow', event => { if (event.persisted) loadPage(); });
loadPage();
