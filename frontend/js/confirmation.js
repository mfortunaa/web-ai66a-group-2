import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js';

const bookingId = new URLSearchParams(window.location.search).get('booking_id');
const message = document.querySelector('#page-message');
const content = document.querySelector('#confirmation-content');
const retryButton = document.querySelector('#retry');
const timeZone = 'Asia/Ho_Chi_Minh';
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'full', timeStyle: 'short', timeZone,
});
const statusLabels = {
  pending: 'Chờ thanh toán',
  payment_failed: 'Thanh toán thất bại · Chưa xác nhận',
  confirmed: 'Đã xác nhận',
};

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

function renderBooking(booking) {
  content.hidden = false;
  const confirmed = booking.status === 'confirmed';
  document.querySelector('#page-title').textContent =
    confirmed ? 'Đặt vé thành công' : 'Đặt vé chưa được xác nhận';
  setMessage(confirmed
    ? 'Đặt vé đã được máy chủ xác nhận.'
    : 'Thông tin dưới đây chưa phải vé đã xác nhận. Hoàn tất thanh toán mô phỏng để xác nhận đặt vé.',
  !confirmed);
  const status = document.querySelector('#booking-status');
  status.textContent = statusLabels[booking.status] || 'Trạng thái đang cập nhật';
  status.className = `status-pill${confirmed ? '' : ' unconfirmed'}`;

  document.querySelector('#event-title').textContent = booking.event_title;
  document.querySelector('#booking-reference').textContent = booking.reference;
  document.querySelector('#event-time').textContent =
    `${formatDateTime(booking.session_starts_at)} – ${formatDateTime(booking.session_ends_at)}`;
  document.querySelector('#booking-quantity').textContent = String(booking.quantity);
  document.querySelector('#attendee-name').textContent = booking.attendee_name;
  document.querySelector('#attendee-email').textContent = booking.attendee_email;
  document.querySelector('#attendee-phone').textContent = booking.attendee_phone;
  document.querySelector('#booking-total').textContent = formatPrice(booking.total_price_vnd);

  const paymentLink = document.querySelector('#payment-link');
  paymentLink.hidden = confirmed;
  paymentLink.href = `payment.html?booking_id=${encodeURIComponent(booking.id)}`;
}

async function loadBooking() {
  retryButton.hidden = true;
  content.hidden = true;
  if (!bookingId || !/^[1-9]\d*$/.test(bookingId)) {
    document.querySelector('#page-title').textContent = 'Không tìm thấy mã đặt vé';
    setMessage('Mã đặt vé không hợp lệ hoặc không được cung cấp.', true);
    return;
  }
  setMessage('Đang tải xác nhận từ máy chủ…');
  try {
    const booking = await apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}`);
    if (!booking || !Number.isSafeInteger(booking.id) || typeof booking.status !== 'string') {
      throw new Error('Dữ liệu đặt vé từ máy chủ không hợp lệ.');
    }
    renderBooking(booking);
  } catch (error) {
    document.querySelector('#page-title').textContent = 'Không thể tải đặt vé';
    setMessage(error.message || 'Không thể tải thông tin đặt vé.', true);
    retryButton.hidden = error.status === 401 || error.status === 404;
  }
}

retryButton.addEventListener('click', loadBooking);

async function start() {
  try {
    await requireAuth();
    await loadBooking();
  } catch (error) {
    setMessage(error.message || 'Không thể xác minh tài khoản.', true);
  }
}

start();
