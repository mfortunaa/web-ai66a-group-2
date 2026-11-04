import { translate as t, getLanguage, initializeSitePreferences } from './site-preferences.js';
import { apiRequest } from './api.js';
import { logout, requireAuth } from './auth.js';
import { localizeMessage } from './flow-messages.js';

initializeSitePreferences();

const params = new URLSearchParams(window.location.search);
const eventId = params.get('event_id');
const form = document.querySelector('#booking-form');
const layout = document.querySelector('#booking-layout');
const message = document.querySelector('#page-message');
const formMessage = document.querySelector('#form-message');
const sessionSelect = document.querySelector('#event-session');
const quantityInput = document.querySelector('#quantity');
const submitButton = document.querySelector('#submit-booking');
submitButton.textContent = t('Tiếp tục thanh toán', 'Continue to payment');
const retryButton = document.querySelector('#retry-booking');
const controls = [...form.querySelectorAll('input, select, button')];
let requestStorageKey;
let currentUser;
const timeZone = 'Asia/Ho_Chi_Minh';
const dateTimeFormatter = { format: date => new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-GB' : 'vi-VN', {
  dateStyle: 'full', timeStyle: 'short', timeZone,
}).format(date) };

let eventDetails;
let requestInFlight = false;

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
  return Number.isNaN(date.getTime()) ? t("Thời gian đang cập nhật", "Time to be confirmed") : dateTimeFormatter.format(date);
}

function formatPrice(value) {
  return `${Number(value).toLocaleString(getLanguage() === 'en' ? 'en-GB' : 'vi-VN')} ₫`;
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
    if (request?.user_id === currentUser.id && request.event_id === Number(eventId) && request.key
        && (request.booking_id || request.payload)) return request;
  } catch {
    throw new Error(t("Không thể đọc yêu cầu đặt vé đang lưu trong phiên này.", "Unable to read the saved booking request."));
  }
  throw new Error(t("Yêu cầu đặt vé đang lưu không hợp lệ. Không gửi một yêu cầu mới để tránh đặt trùng.", "The saved request is invalid. Do not send a new request to avoid duplicates."));
}

function createRequestKey() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(t("Trình duyệt này không hỗ trợ tạo mã đặt vé an toàn. Vui lòng cập nhật trình duyệt.", "Your browser cannot generate a secure request key. Please update your browser."));
  }
  return globalThis.crypto.randomUUID();
}

function sessionOptions(sessions) {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t("Chọn suất diễn", "Choose a performance");
  placeholder.disabled = true;
  placeholder.selected = true;
  const options = sessions.map((session) => {
    const option = document.createElement('option');
    option.value = String(session.id);
    option.textContent = sessionLabel(session);
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
    ? t(`Còn ${available.toLocaleString('vi-VN')} vé cho suất diễn này.`, `${available.toLocaleString('en-GB')} tickets left for this performance.`)
    : t("Chọn suất diễn để xem số vé còn lại.", "Choose a performance to see remaining tickets.");
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
      option.textContent = t("Suất diễn của yêu cầu đang được xác minh", "Performance from the request being checked");
      option.dataset.available = '0';
      sessionSelect.append(option);
    }
    form.hidden = false;
    setMessage(t("Đang khôi phục yêu cầu đặt vé trước đó để có thể xác minh cùng mã yêu cầu.", "Restoring the previous request to check using the same request key."), true);
    restoreRequestIfNeeded();
    return;
  }

  const canBook = event.sale_status === 'on_sale' && event.is_bookable && availableSessions.length > 0;
  if (!canBook) {
    form.hidden = true;
    setMessage(event.booking_unavailable_reason === 'coming_soon'
      ? `${t('Vé chưa mở bán. Mở bán lúc', 'Sales open at')} ${formatDateTime(event.sales_open_at)}.`
      : event.booking_unavailable_reason === 'sold_out'
        ? t("Sự kiện đã bán hết vé.", "This event is sold out.")
        : t("Sự kiện hiện chưa có suất diễn có thể đặt.", "No performances are currently available to book."), true);
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
  setFormMessage(t("Kết quả yêu cầu trước chưa xác định. Hãy thử lại cùng thông tin để máy chủ kiểm tra mã idempotency; không thay đổi thông tin.", "The previous outcome is unknown. Retry the same details so the server can check the request key; do not change the details."));
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

  if (!session) errors.push(t("Vui lòng chọn một suất diễn còn mở bán.", "Choose a performance that is on sale."));
  if (!Number.isSafeInteger(quantity) || quantity < 1) errors.push(t("Số lượng vé phải là số nguyên dương.", "Ticket quantity must be a positive integer."));
  else if (session && quantity > session.available_tickets) errors.push(t("Số lượng vượt quá số vé còn lại của suất diễn.", "Quantity exceeds the remaining tickets."));
  if (name.value.trim().length < 2 || name.value.trim().length > 120) errors.push(t("Họ tên cần có từ 2 đến 120 ký tự.", "Full name must contain 2–120 characters."));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) || email.value.trim().length > 254) errors.push(t("Vui lòng nhập email hợp lệ.", "Enter a valid email address."));
  if (!/^\+?[0-9 .-]+$/.test(phoneValue) || phoneValue.length > 20 || phoneDigits < 8 || phoneDigits > 15) {
    errors.push(t("Số điện thoại cần có từ 8 đến 15 chữ số.", "Phone number must contain 8–15 digits."));
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
  requestInFlight = true;
  try {
    // Recheck ownership before sending a stored payload, including after browser Back.
    const user = await requireAuth();
    if (user.id !== currentUser.id) {
      await loadPage();
      return;
    }
    await sendBooking(retryUnknown);
  } catch (error) {
    setFormMessage(localizeMessage(error.message) || t("Không thể xác minh tài khoản.", "Unable to verify account."));
  } finally {
    requestInFlight = false;
  }
}

async function sendBooking(retryUnknown) {
  const payload = retryUnknown ? readStoredRequest()?.payload : getPayload();
  if (!payload) {
    setFormMessage(t("Không tìm thấy yêu cầu cần thử lại. Vui lòng kiểm tra thông tin và gửi lại.", "No request was found to retry. Check your details and submit again."));
    retryButton.hidden = true;
    submitButton.hidden = false;
    setControlsDisabled(false);
    return;
  }

  let request = retryUnknown ? readStoredRequest() : null;
  try {
    if (!request) {
      request = { user_id: currentUser.id, event_id: Number(eventId), key: createRequestKey(), payload };
      sessionStorage.setItem(requestStorageKey, JSON.stringify(request));
    }
  } catch (error) {
    setFormMessage(localizeMessage(error.message) || t("Không thể lưu yêu cầu đặt vé trong phiên trình duyệt.", "Unable to save the request in this browser session."));
    return;
  }

  setControlsDisabled(true);
  retryButton.hidden = true;
  submitButton.hidden = false;
  submitButton.textContent = t("Đang tạo đặt vé…", "Creating booking…");
  try {
    const booking = await apiRequest('/api/bookings', {
      method: 'POST',
      headers: { 'Idempotency-Key': request.key },
      body: request.payload,
    });
    if (!booking?.id) {
      setControlsDisabled(true);
      submitButton.hidden = true;
      retryButton.hidden = false;
      retryButton.disabled = false;
      setFormMessage(t("Máy chủ chưa trả về mã đặt vé. Hãy thử lại cùng yêu cầu để xác minh, không tạo yêu cầu mới.", "The server did not return a booking ID. Retry the same request; do not create a new request."));
      return;
    }
    sessionStorage.setItem(requestStorageKey, JSON.stringify({
      user_id: request.user_id,
      event_id: request.event_id,
      key: request.key,
      booking_id: booking.id,
    }));
    window.location.assign(`payment.html?booking_id=${encodeURIComponent(booking.id)}`);
  } catch (error) {
    // These responses definitively reject this payload. Auth, throttling and
    // transport errors do not establish the outcome of an earlier attempt.
    if (![404, 409, 422].includes(error.status)) {
      setControlsDisabled(true);
      submitButton.hidden = true;
      retryButton.hidden = false;
      retryButton.disabled = false;
      setFormMessage(t(`Chưa thể xác định kết quả đặt vé: ${error.message} Dùng nút thử lại để kiểm tra cùng yêu cầu.`, `Booking outcome is unknown: ${localizeMessage(error.message)} Retry to check the same request.`));
    } else {
      sessionStorage.removeItem(requestStorageKey);
      setMessage('');
      setControlsDisabled(false);
      submitButton.hidden = false;
      retryButton.hidden = true;
      setFormMessage(localizeMessage(error.message) || t("Không thể tạo đặt vé.", "Unable to create booking."));
    }
  } finally {
    submitButton.textContent = t("Tiếp tục thanh toán", "Continue to payment");
  }
}

async function loadPage() {
  document.querySelector('#retry-load').hidden = true;
  if (!eventId || !/^[1-9]\d*$/.test(eventId)) {
    setMessage(t("Mã sự kiện không hợp lệ hoặc không được cung cấp.", "Event ID is missing or invalid."), true);
    return;
  }
  setMessage(t("Đang tải sự kiện…", "Loading event…"));
  try {
    const user = await requireAuth();
    if (currentUser && currentUser.id !== user.id) form.reset();
    currentUser = user;
    requestStorageKey = `eventy-booking-request:${user.id}:${eventId}`;
    layout.hidden = true;
    document.querySelector('#existing-booking').hidden = true;
    setControlsDisabled(false);
    submitButton.hidden = false;
    retryButton.hidden = true;
    setFormMessage('');
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
      throw new Error(t("Dữ liệu sự kiện từ máy chủ không hợp lệ.", "Invalid event data from server."));
    }
    renderEvent(event, user);
  } catch (error) {
    setMessage(localizeMessage(error.message) || t("Không thể tải sự kiện.", "Unable to load event."), true);
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

function sessionLabel(session) {
  return `${formatDateTime(session.starts_at)} · ${t('Còn', 'Remaining:')} ${session.available_tickets.toLocaleString(getLanguage() === 'en' ? 'en-GB' : 'vi-VN')} ${t('vé', 'tickets')}`;
}
window.addEventListener('eventy:languagechange', () => {
  message.textContent = localizeMessage(message.textContent);
  formMessage.textContent = localizeMessage(formMessage.textContent);
  submitButton.textContent = requestInFlight ? t('Đang tạo đặt vé…', 'Creating booking…') : t('Tiếp tục thanh toán', 'Continue to payment');
  if (!eventDetails) return;
  document.querySelector('#event-time').textContent = `${formatDateTime(eventDetails.starts_at)} – ${formatDateTime(eventDetails.ends_at)}`;
  document.querySelector('#event-price').textContent = formatPrice(eventDetails.ticket_price_vnd);
  for (const option of sessionSelect.options) {
    const session = eventDetails.sessions.find(item => String(item.id) === option.value);
    option.textContent = session ? sessionLabel(session) : option.value ? t('Suất diễn của yêu cầu đang được xác minh', 'Performance from the request being checked') : t('Chọn suất diễn', 'Choose a performance');
  }
  updateEstimate();
});
loadPage();
