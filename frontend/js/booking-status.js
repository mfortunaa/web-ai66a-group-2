const reasons = {
  sales_not_open: 'Sự kiện chưa mở bán. Vui lòng quay lại sau.',
  sales_closed: 'Đã đóng bán hoặc suất diễn đã bắt đầu.',
  tickets_unavailable: 'Không còn đủ vé cho đặt vé này.',
  event_unavailable: 'Sự kiện hoặc suất diễn không còn khả dụng.',
  already_confirmed: 'Đặt vé đã được xác nhận.',
  not_retryable: 'Đặt vé này không thể tiếp tục thanh toán.',
};
export function retryUnavailableMessage(reason) {
  return reasons[reason] || 'Hiện chưa thể thanh toán đặt vé này. Vui lòng kiểm tra lại sau.';
}
