import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js';
import { retryUnavailableMessage } from './booking-status.js';

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
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'full', timeStyle: 'short', timeZone,
});
let paymentInFlight = false;

document.querySelector('#logout').addEventListener('click', logout);

function setMessage(text, error = false) {
  message.textContent = text;
  message.className = `page-message${error ? ' error' : ''}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Thời gian đang cập nhật' : dateTimeFormatter.format(date);
}

function formatPrice(value) {
  return `${Number(value).toLocaleString('vi-VN')} ₫`;
}

function isValidBooking(booking) {
  return booking && Number.isSafeInteger(booking.id) && typeof booking.status === 'string';
}

function navigateToConfirmation(id) {
  window.location.replace(`confirmation.html?booking_id=${encodeURIComponent(id)}`);
}

function renderBooking(booking, notice = '') {
  content.hidden = false;
  setMessage('');
  result.textContent = notice;
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
    status.textContent = 'Thanh toán mô phỏng thất bại';
    status.className = 'status-pill failed';
    actions.hidden = false;
    document.querySelector('#simulate-failure').hidden = true;
    document.querySelector('#confirmation-link').hidden = true;
  } else if (booking.status === 'confirmed') {
    status.textContent = 'Đã xác nhận';
    status.className = 'status-pill confirmed';
    actions.hidden = true;
    document.querySelector('#confirmation-link').hidden = false;
    document.querySelector('#confirmation-link').href =
      `confirmation.html?booking_id=${encodeURIComponent(booking.id)}`;
  } else {
    status.textContent = 'Chờ thanh toán mô phỏng';
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
}

function setActionButtonsDisabled(disabled) {
  successButton.disabled = disabled;
  failureButton.disabled = disabled;
}

async function loadBooking({ reconciliationMessage = '' } = {}) {
  if (!bookingId || !/^[1-9]\d*$/.test(bookingId)) {
    content.hidden = true;
    setMessage('Mã đặt vé không hợp lệ hoặc không được cung cấp.', true);
    checkButton.hidden = true;
    return null;
  }
  checkButton.hidden = true;
  setMessage(reconciliationMessage || 'Đang tải đặt vé từ máy chủ…');
  try {
    const booking = await apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}`);
    if (!isValidBooking(booking)) throw new Error('Dữ liệu đặt vé từ máy chủ không hợp lệ.');
    if (booking.status === 'confirmed') {
      navigateToConfirmation(booking.id);
      return booking;
    }
    renderBooking(booking, reconciliationMessage);
    return booking;
  } catch (error) {
    content.hidden = true;
    setMessage(error.message || 'Không thể tải đặt vé.', true);
    checkButton.hidden = error.status === 401 || error.status === 404;
    return null;
  }
}

async function reconcilePayment(error) {
  setActionButtonsDisabled(false);
  const booking = await loadBooking({
    reconciliationMessage: `Chưa thể xác nhận kết quả thao tác (${error.message}). Đã kiểm tra lại trạng thái từ máy chủ.`,
  });
  if (!booking) {
    setMessage('Chưa xác định được kết quả thanh toán. Vui lòng kiểm tra trạng thái đặt vé trước khi thử lại.', true);
    checkButton.hidden = false;
  }
}

async function simulatePayment(outcome) {
  if (paymentInFlight) return;
  paymentInFlight = true;
  setActionButtonsDisabled(true);
  result.className = 'payment-result';
  result.textContent = 'Đang gửi kết quả thanh toán mô phỏng…';
  try {
    const booking = await apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}/simulate-payment`, {
      method: 'POST',
      body: { outcome },
    });
    if (!isValidBooking(booking)) throw new Error('Máy chủ trả về trạng thái đặt vé không hợp lệ.');
    if (booking.status === 'confirmed') {
      navigateToConfirmation(booking.id);
      return;
    }
    if (booking.status === 'payment_failed') {
      renderBooking(booking, 'Thanh toán mô phỏng thất bại. Đặt vé chưa được xác nhận và vé chưa bị trừ.');
      return;
    }
    renderBooking(booking, 'Máy chủ chưa xác nhận thanh toán. Bạn có thể thử lại khi trạng thái vẫn đang chờ.');
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
    setMessage(error.message || 'Không thể xác minh tài khoản.', true);
  }
}

start();
