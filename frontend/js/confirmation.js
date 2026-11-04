import { translate as t, getLanguage, initializeSitePreferences } from './site-preferences.js';
import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js';
import { retryUnavailableMessage } from './booking-status.js';
import { localizeMessage } from './flow-messages.js';

initializeSitePreferences();

const bookingId = new URLSearchParams(window.location.search).get('booking_id');
let displayedBooking;
const message = document.querySelector('#page-message');
const content = document.querySelector('#confirmation-content');
const retryButton = document.querySelector('#retry');
const timeZone = 'Asia/Ho_Chi_Minh';
const dateTimeFormatter = { format: date => new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-GB' : 'vi-VN', {
  dateStyle: 'full', timeStyle: 'short', timeZone,
}).format(date) };
const statusLabels = {
  pending: t("Chờ thanh toán", "Awaiting payment"),
  payment_failed: t("Thanh toán thất bại · Chưa xác nhận", "Payment failed · Unconfirmed"),
  confirmed: t("Đã xác nhận", "Confirmed"),
};

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

function renderBooking(booking) {
  displayedBooking = booking;
  content.hidden = false;
  const confirmed = booking.status === 'confirmed';
  document.querySelector('#page-title').textContent =
    confirmed ? t("Đặt vé thành công", "Booking confirmed") : t("Đặt vé chưa được xác nhận", "Booking not confirmed");
  setMessage(confirmed
    ? t("Đặt vé đã được máy chủ xác nhận.", "The server has confirmed this booking.")
    : t("Thông tin dưới đây chưa phải vé đã xác nhận. Hoàn tất thanh toán mô phỏng để xác nhận đặt vé.", "This is not a confirmed ticket. Complete simulated payment to confirm the booking."),
  !confirmed);
  const status = document.querySelector('#booking-status');
  status.textContent = localizeMessage(statusLabels[booking.status]) || t("Trạng thái đang cập nhật", "Status to be confirmed");
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
  paymentLink.hidden = confirmed || booking.can_retry_payment !== true;
  paymentLink.href = `payment.html?booking_id=${encodeURIComponent(booking.id)}`;
  if (!confirmed && booking.can_retry_payment !== true) {
    setMessage(retryUnavailableMessage(booking.retry_unavailable_reason), true);
  }
}

async function loadBooking() {
  retryButton.hidden = true;
  content.hidden = true;
  if (!bookingId || !/^[1-9]\d*$/.test(bookingId)) {
    document.querySelector('#page-title').textContent = t("Không tìm thấy mã đặt vé", "Booking ID not found");
    setMessage(t("Mã đặt vé không hợp lệ hoặc không được cung cấp.", "Booking ID is missing or invalid."), true);
    return;
  }
  setMessage(t("Đang tải xác nhận từ máy chủ…", "Loading confirmation from server…"));
  try {
    const booking = await apiRequest(`/api/bookings/${encodeURIComponent(bookingId)}`);
    if (!booking || !Number.isSafeInteger(booking.id) || typeof booking.status !== 'string') {
      throw new Error(t("Dữ liệu đặt vé từ máy chủ không hợp lệ.", "Invalid booking data from server."));
    }
    renderBooking(booking);
  } catch (error) {
    document.querySelector('#page-title').textContent = t("Không thể tải đặt vé", "Unable to load booking");
    setMessage(localizeMessage(error.message) || t("Không thể tải thông tin đặt vé.", "Unable to load booking details."), true);
    retryButton.hidden = error.status === 401 || error.status === 404;
  }
}

retryButton.addEventListener('click', loadBooking);

async function start() {
  try {
    await requireAuth();
    await loadBooking();
  } catch (error) {
    setMessage(localizeMessage(error.message) || t("Không thể xác minh tài khoản.", "Unable to verify account."), true);
  }
}

window.addEventListener('eventy:languagechange', () => {
  if (displayedBooking && !content.hidden) renderBooking(displayedBooking);
  else {
    message.textContent = localizeMessage(message.textContent);
    document.querySelector('#page-title').textContent = localizeMessage(document.querySelector('#page-title').textContent);
  }
});
start();
