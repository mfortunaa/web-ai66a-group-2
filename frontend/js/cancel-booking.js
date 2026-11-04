import { apiRequest } from './api.js';
import { translate as t } from './site-preferences.js';
import { localizeMessage } from './flow-messages.js';

export function createCancelButton(booking, onCancelled) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'button-secondary cancel-booking';
  button.textContent = t('Hủy đặt vé', 'Cancel booking');
  button.addEventListener('click', () => openCancellation(booking, onCancelled));
  return button;
}

function openCancellation(booking, onCancelled) {
  if (document.querySelector('#cancel-booking-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'cancel-booking-dialog'; dialog.className = 'cancel-dialog';
  dialog.setAttribute('aria-labelledby', 'cancel-dialog-title');
  dialog.setAttribute('aria-describedby', 'cancel-dialog-warning');
  const title = document.createElement('h2'); title.id = 'cancel-dialog-title';
  title.textContent = t('Bạn có muốn hủy đặt vé?', 'Cancel this booking?');
  const reference = document.createElement('p');
  reference.textContent = `${booking.reference} · ${booking.event_title}`;
  const warning = document.createElement('p'); warning.id = 'cancel-dialog-warning'; warning.className = 'cancel-warning';
  warning.textContent = t('Hủy đặt vé không được hoàn tiền. Vé đã hủy không thể sử dụng hoặc thanh toán lại.', 'Cancellation is non-refundable. Cancelled tickets cannot be used or paid again.');
  const error = document.createElement('p'); error.setAttribute('role', 'alert');
  const actions = document.createElement('div'); actions.className = 'cancel-dialog-actions';
  const keep = document.createElement('button'); keep.type = 'button'; keep.className = 'button-secondary';
  keep.textContent = t('Giữ đặt vé', 'Keep booking'); keep.autofocus = true;
  const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'cancel-confirm';
  confirm.textContent = t('Xác nhận hủy', 'Confirm cancellation');
  let busy = false;
  keep.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  confirm.addEventListener('click', async () => {
    if (busy) return;
    busy = true; keep.disabled = confirm.disabled = true;
    dialog.setAttribute('aria-busy', 'true'); confirm.textContent = t('Đang hủy…', 'Cancelling…'); error.textContent = '';
    try {
      const result = await apiRequest(`/api/bookings/${encodeURIComponent(booking.id)}/cancel`, { method: 'POST' });
      onCancelled(result); dialog.close();
      const heading = document.querySelector('h1'); heading?.setAttribute('tabindex', '-1'); heading?.focus();
    } catch (failure) {
      error.textContent = localizeMessage(failure.message) || t('Không thể hủy đặt vé. Vui lòng thử lại.', 'Unable to cancel booking. Please try again.');
    } finally {
      busy = false; keep.disabled = confirm.disabled = false;
      dialog.setAttribute('aria-busy', 'false'); confirm.textContent = t('Xác nhận hủy', 'Confirm cancellation');
    }
  });
  actions.append(keep, confirm); dialog.append(title, reference, warning, error, actions);
  document.body.append(dialog); dialog.showModal();
}
