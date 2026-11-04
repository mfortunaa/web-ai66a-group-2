import { translate as t } from './site-preferences.js';
import { localizeMessage } from './flow-messages.js';
const reasons = {
  cancelled: t('Đặt vé đã hủy. Không hoàn tiền và không thể thanh toán lại.', 'This booking is cancelled. No refund is issued and payment cannot be resumed.'),
  sales_not_open: t("Sự kiện chưa mở bán. Vui lòng quay lại sau.", "Sales have not opened. Please check back later."),
  sales_closed: t("Đã đóng bán hoặc suất diễn đã bắt đầu.", "Sales have closed or the performance has started."),
  tickets_unavailable: t("Không còn đủ vé cho đặt vé này.", "Not enough tickets remain for this booking."),
  event_unavailable: t("Sự kiện hoặc suất diễn không còn khả dụng.", "The event or performance is no longer available."),
  already_confirmed: t("Đặt vé đã được xác nhận.", "This booking is already confirmed."),
  not_retryable: t("Đặt vé này không thể tiếp tục thanh toán.", "Payment cannot be resumed for this booking."),
};
export function retryUnavailableMessage(reason) {
  return localizeMessage(reasons[reason] || t("Hiện chưa thể thanh toán đặt vé này. Vui lòng kiểm tra lại sau.", "Payment is currently unavailable. Please check back later."));
}
