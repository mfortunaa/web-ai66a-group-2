import { adminLoginUrl, getCurrentUser, logout } from './auth.js?v=5';
import { apiRequest } from './api.js';
import { API_BASE_URL } from './config.js';
import { applyTranslations, getLanguage, initializeSitePreferences, translate } from './site-preferences.js?v=7';
import { localizeMessage } from './flow-messages.js';

initializeSitePreferences();
const endpoint = '/api/admin/events';
const refreshIntervalMs = 10_000;
const dates = ['starts_at', 'ends_at', 'sales_open_at', 'sales_close_at'];
const dateFormat = () => new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' });
const numberFormat = () => new Intl.NumberFormat(getLanguage() === 'en' ? 'en-US' : 'vi-VN');
const errors = {
  duplicate_slug: 'Mã sự kiện đã được sử dụng.',
  booked_session: 'Suất đã có đơn đặt vé. Hãy giữ suất và giờ diễn hiện tại.',
  capacity_below_sales: 'Sức chứa phải bằng hoặc lớn hơn số vé đã bán.',
  event_has_bookings: 'Sự kiện đã có đơn đặt vé hoặc vé đã bán nên không thể xóa.',
  session_changed: 'Lịch diễn đã thay đổi. Hãy tải lại danh sách trước khi sửa.',
  schedule_conflict: 'Giờ diễn bị trùng với một suất hiện có. Hãy kiểm tra lại lịch.',
  cover_required: 'Hãy tải ảnh bìa lên hoặc nhập đường dẫn ảnh.',
  cover_too_large: 'Ảnh bìa phải nhỏ hơn hoặc bằng 5 MB.',
  cover_format: 'Chọn ảnh JPG, PNG hoặc WebP tĩnh hợp lệ.',
  cover_dimensions: 'Ảnh bìa phải có tối đa 20 megapixel.',
};

const byId = (id) => document.getElementById(id);
const editor = byId('event-editor');
const form = byId('event-form');
const coverInput = byId('cover-file');
const coverUrlInput = form.elements.namedItem('image_url');
const coverPreview = byId('cover-preview');
const clearCoverButton = byId('clear-cover-file');
const sessionFields = byId('session-fields');
const deleteDialog = byId('delete-dialog');
const pageStatus = byId('page-status');
const addButton = byId('add-event');
const retryButton = byId('reload-events');
const eventList = byId('event-list');
const inventorySync = byId('inventory-sync');
const inventorySyncLabel = () => translate(
  'Số vé tự cập nhật mỗi 10 giây.',
  'Ticket inventory refreshes every 10 seconds.',
);
let events = [];
let listRevision = 0;
let refreshing = false;
let editingId = null;
let deletingId = null;
let coverPreviewUrl;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = localizeMessage(content);
  return node;
}

function action(label, callback, className) {
  const button = element('button', className, label);
  button.type = 'button';
  button.addEventListener('click', callback);
  return button;
}

function eventRequest(path = '', options = {}) {
  return apiRequest(endpoint + path, { ...options, loginRedirect: adminLoginUrl });
}

function errorText(error) {
  if (error.status === 403) return translate('Tài khoản hiện không có quyền quản trị.', 'This account does not have administrator access.');
  if (error.status === 404) return translate('Không tìm thấy sự kiện. Hãy tải lại danh sách.', 'Event not found. Please reload the list.');
  return localizeMessage(errors[error.code] || error.message);
}

function showStatus(message, isError = false) {
  pageStatus.textContent = localizeMessage(message);
  pageStatus.classList.toggle('error', isError);
}

function imageUrl(value) {
  try {
    const url = new URL(value, API_BASE_URL);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function refreshCover() {
  if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
  coverPreviewUrl = undefined;
  const file = coverInput.files[0];
  const message = file?.size > 5 * 1024 * 1024 ? errors.cover_too_large
    : file?.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? errors.cover_format
    : '';
  coverInput.setCustomValidity(message);
  byId('cover-status').textContent = localizeMessage(message);
  clearCoverButton.hidden = !file;
  coverUrlInput.disabled = Boolean(file);
  if (file && !message) coverPreviewUrl = URL.createObjectURL(file);
  const preview = file ? coverPreviewUrl : coverUrlInput.value.trim() && imageUrl(coverUrlInput.value.trim());
  coverPreview.hidden = !preview;
  if (preview) coverPreview.src = preview;
  else coverPreview.removeAttribute('src');
}

function renderEvents() {
  events.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id - b.id);
  byId('event-count').textContent = translate(`${numberFormat().format(events.length)} sự kiện`, `${numberFormat().format(events.length)} events`);
  byId('empty-events').hidden = events.length > 0;
  byId('event-rows').replaceChildren(...events.map((event) => {
    const row = element('li', 'event-row');
    row.dataset.eventId = event.id;
    const identity = element('div', 'event-identity');
    const cover = element('img', 'event-cover');
    cover.alt = '';
    cover.loading = 'lazy';
    cover.src = imageUrl(event.image_url);
    cover.addEventListener('error', () => cover.removeAttribute('src'), { once: true });
    const details = element('div');
    details.append(
      element('h3', 'event-name', event.title),
      element('div', 'event-meta', `${dateFormat().format(new Date(event.starts_at))} · ${event.venue}`),
    );
    identity.append(cover, details);

    const stock = element('div', 'event-stock');
    const capacityText = translate(
      `${numberFormat().format(event.tickets_sold)} / ${numberFormat().format(event.capacity)} vé đã bán`,
      `${numberFormat().format(event.tickets_sold)} / ${numberFormat().format(event.capacity)} tickets sold`,
    );
    const progress = element('progress');
    progress.max = event.capacity;
    progress.value = event.tickets_sold;
    progress.setAttribute('aria-label', capacityText);
    const remainingText = translate(`Còn ${numberFormat().format(event.available_tickets)} vé theo lịch`, `${numberFormat().format(event.available_tickets)} tickets remaining`);
    stock.append(element('span', '', capacityText), progress, element('span', 'event-remaining', remainingText));

    const actions = element('div', 'event-actions');
    const editButton = action(translate('Sửa', 'Edit'), () => openEditor(event));
    const deleteButton = action(translate('Xóa', 'Delete'), () => {
      deletingId = event.id;
      byId('delete-event-name').textContent = event.title;
      byId('delete-status').textContent = '';
      deleteDialog.showModal();
    }, 'delete-event');
    editButton.setAttribute('aria-label', translate(`Sửa ${event.title}`, `Edit ${event.title}`));
    deleteButton.setAttribute('aria-label', translate(`Xóa ${event.title}`, `Delete ${event.title}`));
    editButton.dataset.eventAction = 'edit';
    deleteButton.dataset.eventAction = 'delete';
    actions.append(editButton, deleteButton);
    row.append(identity, stock, actions);
    return row;
  }));
}

function setInventoryStatus(message) {
  const translated = localizeMessage(message);
  if (inventorySync.textContent !== translated) inventorySync.textContent = translated;
}

function fetchEvents() {
  return eventRequest('', { cache: 'no-store' });
}

async function refreshEvents() {
  if (eventList.hidden || document.hidden || editor.open || deleteDialog.open || refreshing) return;
  refreshing = true;
  const revision = listRevision;
  try {
    const { items } = await fetchEvents();
    setInventoryStatus(inventorySyncLabel());
    // Ignore a response started before a local edit or deletion.
    if (revision !== listRevision || editor.open || deleteDialog.open) return;
    if (JSON.stringify(items) === JSON.stringify(events)) return;
    const active = document.activeElement;
    const eventId = active.closest('[data-event-id]')?.dataset.eventId;
    const eventAction = active.dataset.eventAction;
    events = items;
    renderEvents();
    if (eventId && eventAction) {
      const replacement = eventList.querySelector(`[data-event-id="${eventId}"] [data-event-action="${eventAction}"]`);
      (replacement || addButton).focus({ preventScroll: true });
    }
  } catch (error) {
    if (error.status === 403) window.location.replace(adminLoginUrl);
    else if (error.status !== 401) setInventoryStatus('Chưa cập nhật được số vé. Đang thử lại…');
  } finally {
    refreshing = false;
  }
}

// Eventy stores UTC. The editor uses Vietnam time even on devices in other zones.
function vietnamInput(value) {
  return value ? new Date(Date.parse(value) + 7 * 3600 * 1000).toISOString().slice(0, 19) : '';
}

function fromVietnam(value) {
  return `${value}+07:00`;
}

function addSession(item = {}) {
  const row = byId('session-template').content.firstElementChild.cloneNode(true);
  applyTranslations(row);
  if (item.id) row.dataset.sessionId = item.id;
  const start = row.querySelector('[name="session_start"]');
  start.value = vietnamInput(item.starts_at);
  row.querySelector('[name="session_end"]').value = vietnamInput(item.ends_at);
  row.querySelector('[name="session_capacity"]').value = item.capacity ?? '';
  row.querySelector('.remove-session').addEventListener('click', () => {
    row.remove();
    byId('add-session').focus();
  });
  sessionFields.append(row);
  return start;
}

function openEditor(event) {
  form.reset();
  coverUrlInput.disabled = false;
  sessionFields.replaceChildren();
  editingId = event?.id ?? null;
  byId('editor-title').textContent = event ? translate('Sửa sự kiện', 'Edit event') : translate('Thêm sự kiện', 'Add event');
  byId('editor-status').textContent = '';
  if (event) {
    for (const key of new FormData(form).keys()) {
      if (key === 'cover') continue;
      form.elements.namedItem(key).value = dates.includes(key) ? vietnamInput(event[key]) : event[key];
    }
    event.sessions.forEach(addSession);
  } else {
    addSession();
  }
  refreshCover();
  editor.showModal();
  editor.querySelector('.editor-body').scrollTop = 0;
}

function eventPayload() {
  const data = Object.fromEntries(new FormData(form));
  for (const key of ['cover', 'session_start', 'session_end', 'session_capacity']) delete data[key];
  for (const key of dates) data[key] = fromVietnam(data[key]);
  data.capacity = Number(data.capacity);
  data.ticket_price_vnd = Number(data.ticket_price_vnd);
  data.sessions = Array.from(sessionFields.children, (row) => ({
    id: row.dataset.sessionId ? Number(row.dataset.sessionId) : null,
    starts_at: fromVietnam(row.querySelector('[name="session_start"]').value),
    ends_at: fromVietnam(row.querySelector('[name="session_end"]').value),
    capacity: Number(row.querySelector('[name="session_capacity"]').value),
  }));
  return data;
}

function validateSchedule(data) {
  if (!editingId && !data.sessions.length) return 'Hãy thêm ít nhất một suất diễn.';
  const starts = Date.parse(data.starts_at);
  const ends = Date.parse(data.ends_at);
  const opens = Date.parse(data.sales_open_at);
  const closes = Date.parse(data.sales_close_at);
  if (!(starts < ends)) return 'Sự kiện phải kết thúc sau khi bắt đầu.';
  if (!(opens < closes && closes <= ends)) return 'Đóng bán phải sau mở bán và trong thời gian sự kiện hoặc sớm hơn.';
  const sessionStarts = new Set();
  for (const item of data.sessions) {
    const start = Date.parse(item.starts_at);
    const end = Date.parse(item.ends_at);
    if (!(starts <= start && start < end && end <= ends)) return 'Mỗi suất phải nằm trong khung giờ sự kiện và kết thúc sau khi bắt đầu.';
    if (sessionStarts.has(start)) return 'Các suất diễn phải có giờ bắt đầu khác nhau.';
    if (item.capacity > data.capacity) return 'Sức chứa của một suất không thể vượt quá sức chứa sự kiện.';
    sessionStarts.add(start);
  }
  return '';
}

function bindDialog(dialog, statusId, save) {
  const dialogForm = dialog.querySelector('form');
  const submitButton = dialogForm.querySelector('button[type="submit"]');
  const status = byId(statusId);
  dialogForm.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => {
    if (submitButton.disabled) event.preventDefault();
  });
  dialogForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    const data = dialog === editor ? eventPayload() : null;
    status.textContent = data ? localizeMessage(validateSchedule(data)) : '';
    if (status.textContent) {
      status.scrollIntoView({ block: 'nearest' });
      return;
    }
    const activeControls = Array.from(dialogForm.elements).filter((control) => !control.disabled);
    activeControls.forEach((control) => { control.disabled = true; });
    dialogForm.setAttribute('aria-busy', 'true');
    try {
      const message = await save(data);
      dialog.close();
      renderEvents();
      showStatus(message);
    } catch (error) {
      status.textContent = errorText(error);
      status.scrollIntoView({ block: 'nearest' });
    } finally {
      activeControls.forEach((control) => { control.disabled = false; });
      dialogForm.removeAttribute('aria-busy');
      if (dialog.open) submitButton.focus();
      else addButton.focus();
    }
  });
}

async function loadEvents() {
  retryButton.hidden = true;
  showStatus('Đang kiểm tra phiên đăng nhập…');
  try {
    const user = await getCurrentUser();
    if (user.role !== 'admin') {
      window.location.replace(adminLoginUrl);
      return;
    }
    byId('admin-account').hidden = false;
    showStatus('Đang tải danh sách sự kiện…');
    ({ items: events } = await fetchEvents());
    renderEvents();
    eventList.hidden = false;
    addButton.hidden = false;
    showStatus('');
  } catch (error) {
    if (error.status === 401) {
      window.location.replace(adminLoginUrl);
      return;
    }
    showStatus(errorText(error), true);
    retryButton.hidden = false;
  }
}

byId('logout').addEventListener('click', () => logout({ redirect: adminLoginUrl }));
retryButton.addEventListener('click', loadEvents);
addButton.addEventListener('click', () => openEditor());
byId('add-session').addEventListener('click', () => addSession().focus());
coverInput.addEventListener('change', refreshCover);
coverUrlInput.addEventListener('change', refreshCover);
coverPreview.addEventListener('error', () => { coverPreview.hidden = true; });
clearCoverButton.addEventListener('click', () => {
  coverInput.value = '';
  refreshCover();
  coverInput.focus();
});
editor.addEventListener('close', () => {
  if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
  coverPreviewUrl = undefined;
  refreshEvents();
});
deleteDialog.addEventListener('close', refreshEvents);
document.addEventListener('visibilitychange', refreshEvents);
window.setInterval(refreshEvents, refreshIntervalMs);

bindDialog(editor, 'editor-status', async (data) => {
  const existing = editingId !== null;
  const file = coverInput.files[0];
  let body = data;
  let path = existing ? `/${editingId}` : '';
  if (file) {
    body = new FormData();
    body.append('event', JSON.stringify(data));
    body.append('cover', file);
    path += '/with-cover';
  }
  const saved = await eventRequest(path, {
    method: existing ? 'PUT' : 'POST', body,
  });
  listRevision += 1;
  events = [...events.filter((event) => event.id !== saved.id), saved];
  return existing ? 'Đã lưu thay đổi.' : 'Đã thêm sự kiện.';
});
bindDialog(deleteDialog, 'delete-status', async () => {
  await eventRequest(`/${deletingId}`, { method: 'DELETE' });
  listRevision += 1;
  events = events.filter((event) => event.id !== deletingId);
  return 'Đã xóa sự kiện.';
});

window.addEventListener('eventy:languagechange', () => {
  pageStatus.textContent = localizeMessage(pageStatus.textContent);
  inventorySync.textContent = localizeMessage(inventorySync.textContent);
  byId('cover-status').textContent = localizeMessage(byId('cover-status').textContent);
  byId('editor-status').textContent = localizeMessage(byId('editor-status').textContent);
  byId('delete-status').textContent = localizeMessage(byId('delete-status').textContent);
  if (editor.open) {
    byId('editor-title').textContent = editingId === null
      ? translate('Thêm sự kiện', 'Add event')
      : translate('Sửa sự kiện', 'Edit event');
  }
  renderEvents();
});

loadEvents();
