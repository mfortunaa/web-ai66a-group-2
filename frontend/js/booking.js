import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js';

const params = new URLSearchParams(window.location.search);
const eventId = params.get('event_id');
const form = document.querySelector('#booking-form');
const layout = document.querySelector('#booking-layout');
const message = document.querySelector('#page-message');
const formMessage = document.querySelector('#form-message');
const sessionSelect = document.querySelector('#event-session');
const quantityInput = document.querySelector('#quantity');
const submitButton = document.querySelector('#submit-booking');
const retryButton = document.querySelector('#retry-booking');
const controls = [...form.querySelectorAll('input, select, button')];
const requestStorageKey = `eventy-booking-request:${eventId}`;
const timeZone = 'Asia/Ho_Chi_Minh';
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'full', timeStyle: 'short', timeZone,
});

let eventDetails;
let requestInFlight = false;
let retryingUnknownRequest = false;

document.querySelector('#logout').addEventListener('click', logout);

function setMessage(text, error = false) {
  message.textContent = text;
  message.className = `page-message${error ? ' error' : ''}`;
}

function setFormMessage(text) {
  formMessage.textContent = text;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Thời gian đang cập nhật' : dateTimeFormatter.format(date);
}

function formatPrice(value) {
  return `${Number(value).toLocaleString('vi-VN')} ₫`;
}

function setControlsDisabled(disabled) {
  controls.forEach((control) => {
    if (control !== retryButton) control.disabled = disabled;
  });
}

function setFieldError(field, error) {
  field.setAttribute('aria-invalid', String(error));
}

function readStoredRequest() {
  const saved = sessionStorage.getItem(requestStorageKey);
  if (!saved) return null;
  try {
    const request = JSON.parse(saved);
    if (request?.event_id === Number(eventId) && request.key
        && (request.booking_id || request.payload)) return request;
  } catch {
    throw new Error('Không thể đọc yêu cầu đặt vé đang lưu trong phiên này.');
  }
  throw new Error('Yêu cầu đặt vé đang lưu không hợp lệ. Không gửi một yêu cầu mới để tránh đặt trùng.');
}

function createRequestKey() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Trình duyệt này không hỗ trợ tạo mã đặt vé an toàn. Vui lòng cập nhật trình duyệt.');
  }
  return globalThis.crypto.randomUUID();
}

function sessionOptions(sessions) {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Chọn suất diễn';
  placeholder.disabled = true;
  placeholder.selected = true;
  const options = sessions.map((session) => {
    const option = document.createElement('option');
    option.value = String(session.id);
    option.textContent = `${formatDateTime(session.starts_at)} · Còn ${session.available_tickets.toLocaleString('vi-VN')} vé`;
    option.dataset.available = String(session.available_tickets);
    return option;
  });
  sessionSelect.replaceChildren(placeholder, ...options);
}

function selectedSession() {
  return eventDetails?.sessions.find((session) => String(session.id) === sessionSelect.value);
}

function updateEstimate() {
  const session = selectedSession();
  const available = session?.available_tickets || 0;
  quantityInput.max = String(available || 1);
  document.querySelector('#availability-help').textContent = session
    ? `Còn ${available.toLocaleString('vi-VN')} vé cho suất diễn này.`
    : 'Chọn suất diễn để xem số vé còn lại.';
  const quantity = Number(quantityInput.value);
  const amount = quantity * (eventDetails?.ticket_price_vnd || 0);
  document.querySelector('#estimated-total').textContent =
    Number.isSafeInteger(quantity) && quantity > 0 && Number.isSafeInteger(amount)
      ? formatPrice(amount) : '—';
}

function renderEvent(event, user) {
  eventDetails = event;
  document.querySelector('#event-title').textContent = event.title;
  document.querySelector('#event-time').textContent =
    `${formatDateTime(event.starts_at)} – ${formatDateTime(event.ends_at)}`;
  document.querySelector('#event-venue').textContent = event.venue;
  document.querySelector('#event-address').textContent = event.address;
  document.querySelector('#event-price').textContent = formatPrice(event.ticket_price_vnd);
  document.querySelector('#back-link').href = `event-detail.html?event_id=${encodeURIComponent(event.id)}`;

  const availableSessions = (event.sessions || []).filter((session) =>
    session.is_bookable && session.available_tickets > 0);
  sessionOptions(availableSessions);
  const nameInput = document.querySelector('#attendee-name');
  const emailInput = document.querySelector('#attendee-email');
  nameInput.value = user.full_name || '';
  emailInput.value = user.email || '';
  layout.hidden = false;

  const savedRequest = readStoredRequest();
  if (savedRequest && !savedRequest.booking_id) {
    if (!availableSessions.some((session) => session.id === savedRequest.payload.event_session_id)) {
      const option = document.createElement('option');
      option.value = String(savedRequest.payload.event_session_id);
      option.textContent = 'Suất diễn của yêu cầu đang được xác minh';
      option.dataset.available = '0';
      sessionSelect.append(option);
    }
    form.hidden = false;
    setMessage('Đang khôi phục yêu cầu đặt vé trước đó để có thể xác minh cùng mã yêu cầu.', true);
    restoreRequestIfNeeded();
    return;
  }

  const canBook = event.sale_status === 'on_sale' && event.is_bookable && availableSessions.length > 0;
  if (!canBook) {
    form.hidden = true;
    setMessage(event.booking_unavailable_reason === 'coming_soon'
      ? `Vé chưa mở bán. Mở bán lúc ${formatDateTime(event.sales_open_at)}.`
      : event.booking_unavailable_reason === 'sold_out'
        ? 'Sự kiện đã bán hết vé.'
        : 'Sự kiện hiện chưa có suất diễn có thể đặt.', true);
    return;
  }

  form.hidden = false;
  setMessage('');
  updateEstimate();
  restoreRequestIfNeeded();
}

function restoreRequestIfNeeded() {
  const request = readStoredRequest();
  if (!request) return;
  retryingUnknownRequest = true;
  document.querySelector('#event-session').value = String(request.payload.event_session_id);
  document.querySelector('#quantity').value = String(request.payload.quantity);
  document.querySelector('#attendee-name').value = request.payload.attendee_name;
  document.querySelector('#attendee-email').value = request.payload.attendee_email;
  document.querySelector('#attendee-phone').value = request.payload.attendee_phone;
  updateEstimate();
  setControlsDisabled(true);
  submitButton.hidden = true;
  retryButton.hidden = false;
  retryButton.disabled = false;
  setFormMessage('Kết quả yêu cầu trước chưa xác định. Hãy thử lại cùng thông tin để máy chủ kiểm tra mã idempotency; không thay đổi thông tin.');
}

function validateForm() {
  const session = selectedSession();
  const quantity = Number(quantityInput.value);
  const name = document.querySelector('#attendee-name');
  const email = document.querySelector('#attendee-email');
  const phone = document.querySelector('#attendee-phone');
  const errors = [];

  setFieldError(sessionSelect, !session);
  setFieldError(quantityInput, !Number.isSafeInteger(quantity) || quantity < 1
    || !session || quantity > session.available_tickets);
  setFieldError(name, name.value.trim().length < 2 || name.value.trim().length > 120);
  setFieldError(email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) || email.value.trim().length > 254);
  const phoneValue = phone.value.trim();
  const phoneDigits = phoneValue.match(/[0-9]/g)?.length || 0;
  setFieldError(phone, !/^\+?[0-9 .-]+$/.test(phoneValue) || phoneValue.length > 20
    || phoneDigits < 8 || phoneDigits > 15);

  if (!session) errors.push('Vui lòng chọn một suất diễn còn mở bán.');
  if (!Number.isSafeInteger(quantity) || quantity < 1) errors.push('Số lượng vé phải là số nguyên dương.');
  else if (session && quantity > session.available_tickets) errors.push('Số lượng vượt quá số vé còn lại của suất diễn.');
  if (name.value.trim().length < 2 || name.value.trim().length > 120) errors.push('Họ tên cần có từ 2 đến 120 ký tự.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) || email.value.trim().length > 254) errors.push('Vui lòng nhập email hợp lệ.');
  if (!/^\+?[0-9 .-]+$/.test(phoneValue) || phoneValue.length > 20 || phoneDigits < 8 || phoneDigits > 15) {
    errors.push('Số điện thoại cần có từ 8 đến 15 chữ số.');
  }

  setFormMessage(errors.join(' '));
  return errors.length === 0;
}

function getPayload() {
  return {
    event_session_id: Number(sessionSelect.value),
    quantity: Number(quantityInput.value),
    attendee_name: document.querySelector('#attendee-name').value.trim(),
    attendee_email: document.querySelector('#attendee-email').value.trim(),
    attendee_phone: document.querySelector('#attendee-phone').value.trim(),
  };
}

async function submitBooking(retryUnknown = false) {
  if (requestInFlight || (!retryUnknown && !validateForm())) return;
  const payload = retryUnknown ? readStoredRequest()?.payload : getPayload();
  if (!payload) {
    setFormMessage('Không tìm thấy yêu cầu cần thử lại. Vui lòng kiểm tra thông tin và gửi lại.');
    retryButton.hidden = true;
    submitButton.hidden = false;
    setControlsDisabled(false);
    retryingUnknownRequest = false;
    return;
  }

  let request = retryUnknown ? readStoredRequest() : null;
  try {
    if (!request) {
      request = { event_id: Number(eventId), key: createRequestKey(), payload };
      sessionStorage.setItem(requestStorageKey, JSON.stringify(request));
    }
  } catch (error) {
    setFormMessage(error.message || 'Không thể lưu yêu cầu đặt vé trong phiên trình duyệt.');
    return;
  }

  requestInFlight = true;
  setControlsDisabled(true);
  retryButton.hidden = true;
  submitButton.hidden = false;
  submitButton.textContent = 'Đang tạo đặt vé…';
  try {
    const booking = await apiRequest('/api/bookings', {
      method: 'POST',
      headers: { 'Idempotency-Key': request.key },
      body: request.payload,
    });
    if (!booking?.id) {
      retryingUnknownRequest = true;
      setControlsDisabled(true);
      submitButton.hidden = true;
      retryButton.hidden = false;
      retryButton.disabled = false;
      setFormMessage('Máy chủ chưa trả về mã đặt vé. Hãy thử lại cùng yêu cầu để xác minh, không tạo yêu cầu mới.');
      return;
    }
    sessionStorage.setItem(requestStorageKey, JSON.stringify({
      event_id: request.event_id,
      key: request.key,
      booking_id: booking.id,
    }));
    window.location.assign(`payment.html?booking_id=${encodeURIComponent(booking.id)}`);
  } catch (error) {
    if (retryingUnknownRequest || !error.status || error.status < 400 || error.status >= 500) {
      retryingUnknownRequest = true;
      setControlsDisabled(true);
      submitButton.hidden = true;
      retryButton.hidden = false;
      retryButton.disabled = false;
      setFormMessage(`Chưa thể xác định kết quả đặt vé: ${error.message} Dùng nút thử lại để kiểm tra cùng yêu cầu.`);
    } else {
      sessionStorage.removeItem(requestStorageKey);
      retryingUnknownRequest = false;
      setControlsDisabled(false);
      submitButton.hidden = false;
      retryButton.hidden = true;
      setFormMessage(error.message || 'Không thể tạo đặt vé.');
    }
  } finally {
    requestInFlight = false;
    submitButton.textContent = 'Tiếp tục thanh toán';
  }
}

async function loadPage() {
  document.querySelector('#retry-load').hidden = true;
  if (!eventId || !/^[1-9]\d*$/.test(eventId)) {
    setMessage('Mã sự kiện không hợp lệ hoặc không được cung cấp.', true);
    return;
  }
  setMessage('Đang tải sự kiện…');
  try {
    const user = await requireAuth();
    const savedRequest = readStoredRequest();
    if (savedRequest?.booking_id) {
      document.querySelector('#existing-booking').hidden = false;
      document.querySelector('#open-existing-booking').href =
        `payment.html?booking_id=${encodeURIComponent(savedRequest.booking_id)}`;
      setMessage('');
      return;
    }
    const event = await apiRequest(`/api/events/${encodeURIComponent(eventId)}`);
    if (!event || !Array.isArray(event.sessions)) {
      throw new Error('Dữ liệu sự kiện từ máy chủ không hợp lệ.');
    }
    renderEvent(event, user);
  } catch (error) {
    setMessage(error.message || 'Không thể tải sự kiện.', true);
    document.querySelector('#retry-load').hidden = error.status === 401 || error.status === 404;
  }
}

sessionSelect.addEventListener('change', updateEstimate);
quantityInput.addEventListener('input', updateEstimate);
form.addEventListener('input', (event) => {
  if (event.target instanceof HTMLElement) setFieldError(event.target, false);
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  submitBooking(false);
});
retryButton.addEventListener('click', () => submitBooking(true));
document.querySelector('#retry-load').addEventListener('click', loadPage);
document.querySelector('#start-new-booking').addEventListener('click', () => {
  sessionStorage.removeItem(requestStorageKey);
  document.querySelector('#existing-booking').hidden = true;
  loadPage();
});

loadPage();
