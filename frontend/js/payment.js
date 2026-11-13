import { translate as t, getLanguage, initializeSitePreferences } from './site-preferences.js?v=7';
import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js?v=5';
import { retryUnavailableMessage } from './booking-status.js';
import { localizeMessage } from './flow-messages.js';

initializeSitePreferences();

const params = new URLSearchParams(window.location.search);
const bookingId = params.get('booking_id');
const message = document.querySelector('#page-message');
const content = document.querySelector('#payment-content');
const actions = document.querySelector('#payment-actions');
const result = document.querySelector('#payment-result');
const successButton = document.querySelector('#simulate-success');
const failureButton = document.querySelector('#simulate-failure');
const checkButton = document.querySelector('#check-status');
const timeZone = 'Asia/Ho_Chi_Minh';
const dateTimeFormatter = { format: date => new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-GB' : 'vi-VN', {
  dateStyle: 'full', timeStyle: 'short', timeZone,
}).format(date) };
let paymentInFlight = false;
let displayedBooking;
let displayedNotice = '';

document.querySelector('#logout').addEventListener('click', logout);

function setMessage(text, error = false) {
  message.textContent = text;
  message.className = `page-message${error ? ' error' : ''}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t("Thời gian đang cập nhật", "Time to be confirmed") : dateTimeFormatter.format(date);
}

function formatPrice(value) {
  return `${Number(value).toLocaleString(getLanguage() === 'en' ? 'en-GB' : 'vi-VN')} ₫`;
}

function isValidBooking(booking) {
  return booking && Number.isSafeInteger(booking.id) && typeof booking.status === 'string';
}

function navigateToConfirmation(id) {
  window.location.replace(`confirmation.html?booking_id=${encodeURIComponent(id)}`);
}

function renderBooking(booking, notice = '') {
  displayedBooking = booking;
  displayedNotice = notice;
  content.hidden = false;
  setMessage('');
  result.textContent = localizeMessage(notice);
  result.className = `payment-result${notice ? ' error' : ''}`;
  document.querySelector('#event-title').textContent = booking.event_title;
  document.querySelector('#booking-reference').textContent = booking.reference;
  document.querySelector('#event-time').textContent =
    `${formatDateTime(booking.session_starts_at)} – ${formatDateTime(booking.session_ends_at)}`;
  document.querySelector('#booking-quantity').textContent = String(booking.quantity);
  document.querySelector('#attendee-name').textContent = booking.attendee_name;
  document.querySelector('#booking-total').textContent = formatPrice(booking.total_price_vnd);

  const status = document.querySelector('#booking-status');
  if (booking.status === 'payment_failed') {
    status.textContent = t("Thanh toán mô phỏng thất bại", "Simulated payment failed");
    status.className = 'status-pill failed';
    actions.hidden = false;
    document.querySelector('#simulate-failure').hidden = true;
    document.querySelector('#confirmation-link').hidden = true;
  } else if (booking.status === 'confirmed') {
    status.textContent = t("Đã xác nhận", "Confirmed");
    status.className = 'status-pill confirmed';
    actions.hidden = true;
    document.querySelector('#confirmation-link').hidden = false;
    document.querySelector('#confirmation-link').href =
      `confirmation.html?booking_id=${encodeURIComponent(booking.id)}`;
  } else {
    status.textContent = t("Chờ thanh toán mô phỏng", "Awaiting simulated payment");
    status.className = 'status-pill';
    actions.hidden = false;
    document.querySelector('#simulate-failure').hidden = false;
    document.querySelector('#confirmation-link').hidden = true;
  }
  if (booking.status !== 'confirmed' && booking.can_retry_payment !== true) {
    actions.hidden = true;
    result.textContent = retryUnavailableMessage(booking.retry_unavailable_reason);
    result.className = 'payment-result error';
    checkButton.hidden = false;
  }
  if (booking.status === 'cancelled') status.textContent = t('Đã hủy', 'Cancelled');
}

function setActionButtonsDisabled(disabled) {
  successButton.disabled = disabled;
  failureButton.disabled = disabled;
}

async function loadBooking({ reconciliationMessage = '' } = {}) {
  if (!bookingId || !/^[1-9]\d*$/.test(bookingId)) {
    content.hidden = true;
    setMessage(t("Mã đặt vé không hợp lệ hoặc không được cung cấp.", "Booking ID is missing or invalid."), true);
    checkButton.hidden = true;
    return null;
  }
  checkButton.hidden = true;
  setMessage(reconciliationMessage || t("Đang tải đặt vé từ máy chủ…", "Loading booking from server…"));
  try {
    const booking = await apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}`);
    if (!isValidBooking(booking)) throw new Error(t("Dữ liệu đặt vé từ máy chủ không hợp lệ.", "Invalid booking data from server."));
    if (booking.status === 'confirmed') {
      navigateToConfirmation(booking.id);
      return booking;
    }
    renderBooking(booking, reconciliationMessage);
    return booking;
  } catch (error) {
    content.hidden = true;
    setMessage(localizeMessage(error.message) || t("Không thể tải đặt vé.", "Unable to load booking."), true);
    checkButton.hidden = error.status === 401 || error.status === 404;
    return null;
  }
}

async function reconcilePayment(error) {
  setActionButtonsDisabled(false);
  const booking = await loadBooking({
    reconciliationMessage: t(`Chưa thể xác nhận kết quả thao tác (${error.message}). Đã kiểm tra lại trạng thái từ máy chủ.`, `Could not confirm the action (${localizeMessage(error.message)}). Booking status was checked again with the server.`),
  });
  if (!booking) {
    setMessage(t("Chưa xác định được kết quả thanh toán. Vui lòng kiểm tra trạng thái đặt vé trước khi thử lại.", "Payment outcome is unknown. Check booking status before trying again."), true);
    checkButton.hidden = false;
  }
}

async function simulatePayment(outcome) {
  if (paymentInFlight) return;
  paymentInFlight = true;
  setActionButtonsDisabled(true);
  result.className = 'payment-result';
  result.textContent = t("Đang gửi kết quả thanh toán mô phỏng…", "Submitting simulated payment…");
  try {
    const booking = await apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}/simulate-payment`, {
      method: 'POST',
      body: { outcome },
    });
    if (!isValidBooking(booking)) throw new Error(t("Máy chủ trả về trạng thái đặt vé không hợp lệ.", "Invalid booking status from server."));
    if (booking.status === 'confirmed') {
      navigateToConfirmation(booking.id);
      return;
    }
    if (booking.status === 'payment_failed') {
      renderBooking(booking, t("Thanh toán mô phỏng thất bại. Đặt vé chưa được xác nhận và vé chưa bị trừ.", "Simulated payment failed. The booking is unconfirmed and no tickets were deducted."));
      return;
    }
    renderBooking(booking, t("Máy chủ chưa xác nhận thanh toán. Bạn có thể thử lại khi trạng thái vẫn đang chờ.", "Payment is not confirmed. You can retry while the booking is still pending."));
  } catch (error) {
    await reconcilePayment(error);
  } finally {
    paymentInFlight = false;
    setActionButtonsDisabled(false);
  }
}

successButton.addEventListener('click', () => simulatePayment('success'));
failureButton.addEventListener('click', () => simulatePayment('failure'));
checkButton.addEventListener('click', () => loadBooking());

async function start() {
  try {
    await requireAuth();
    await loadBooking();
  } catch (error) {
    setMessage(localizeMessage(error.message) || t("Không thể xác minh tài khoản.", "Unable to verify account."), true);
  }
}

window.addEventListener('eventy:languagechange', () => {
  const currentMessage = localizeMessage(message.textContent);
  if (displayedBooking && !content.hidden) renderBooking(displayedBooking, displayedNotice);
  message.textContent = currentMessage;
  if (paymentInFlight) result.textContent = t('Đang gửi kết quả thanh toán mô phỏng…', 'Submitting simulated payment…');
});
start();
