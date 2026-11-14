# Giải thích code phần Trần Tuệ Khang

Tài liệu này giới hạn ở phần Catalog, Event Detail, checkout, recovery, preferences, carousel và cài đặt tài khoản. File được gắn kèm riêng là `frontend/pages/register.html`, nên phần đó được giải thích theo từng dòng. Các file còn lại được giải thích theo cụm lệnh/hàm để thấy mục đích, luồng gọi và quan hệ giữa HTML, CSS, JS, API và test.

## 1. Sơ đồ các phần phụ trách

| Nhóm | File chính | Vai trò |
| --- | --- | --- |
| Đăng nhập/đăng ký và carousel | [`index.html`](../frontend/index.html), [`register.html`](../frontend/pages/register.html), [`auth-event-carousel.js`](../frontend/js/auth-event-carousel.js), [`auth-entry.css`](../frontend/css/auth-entry.css) | Đặt các điểm DOM cho carousel, tải highlights công khai, điều khiển chuyển ảnh và bố cục ticket |
| Catalog | [`events.html`](../frontend/pages/events.html), [`events.js`](../frontend/js/events.js), [`events.css`](../frontend/css/events.css) | Lọc ngày, phân nhóm trạng thái, tạo thẻ sự kiện |
| Chi tiết sự kiện | [`event-detail.html`](../frontend/pages/event-detail.html), [`event-detail.js`](../frontend/js/event-detail.js), [`event-detail.css`](../frontend/css/event-detail.css) | Tải event/sessions, mô tả tình trạng bán và mở luồng booking |
| Booking | [`booking.html`](../frontend/pages/booking.html), [`booking.js`](../frontend/js/booking.js), [`booking.css`](../frontend/css/booking.css) | Form attendee, validation, tạm tính, state phục hồi và request idempotent |
| Payment/confirmation | [`payment.html`](../frontend/pages/payment.html), [`payment.js`](../frontend/js/payment.js), [`confirmation.html`](../frontend/pages/confirmation.html), [`confirmation.js`](../frontend/js/confirmation.js), [`payment.css`](../frontend/css/payment.css), [`confirmation.css`](../frontend/css/confirmation.css) | Gửi kết quả mô phỏng, đối chiếu server, hiển thị booking đã xác nhận hoặc chưa |
| Hồ sơ tài khoản | [`account-settings.html`](../frontend/pages/account-settings.html), [`account-page.js`](../frontend/js/account-page.js), [`auth.py`](../backend/app/api/auth.py), [`auth.py`](../backend/app/schemas/auth.py) | Menu tài khoản, sửa tên, giữ email chỉ đọc và cập nhật profile có xác thực |
| Dùng chung | [`api.js`](../frontend/js/api.js), [`config.js`](../frontend/js/config.js), [`auth.js`](../frontend/js/auth.js), [`site-preferences-init.js`](../frontend/js/site-preferences-init.js), [`site-preferences.js`](../frontend/js/site-preferences.js), [`flow-messages.js`](../frontend/js/flow-messages.js), [`booking-status.js`](../frontend/js/booking-status.js), [`common.css`](../frontend/css/common.css) | API, xác thực, ngôn ngữ/theme, lỗi và thành phần giao diện chung |
| Kiểm thử/tài liệu | [`account-page.test.cjs`](../frontend/tests/account-page.test.cjs), [`booking.test.cjs`](../frontend/tests/booking.test.cjs), [`site-preferences.test.cjs`](../frontend/tests/site-preferences.test.cjs), [`my-bookings.test.cjs`](../frontend/tests/my-bookings.test.cjs), [`demo.md`](./demo.md), [`api.md`](./api.md), [`requirements.md`](./requirements.md) | Regression cho account, checkout, preferences và checklist/hợp đồng API |

`auth-pages.js` xử lý form đăng ký/đăng nhập; `cancel-booking.js` được confirmation dùng để hiển thị nút hủy. Đây là phần tích hợp với các luồng lân cận, không phải trọng tâm giải thích checkout ở đây.

## 2. `register.html` — giải thích theo từng dòng

Nguồn: [`register.html`](../frontend/pages/register.html). Tệp hiện có 80 dòng; một số dòng gom nhiều thẻ ngắn để giữ HTML gọn.

| Dòng | Giải thích |
| --- | --- |
| 1 | `<!doctype html>` khai báo tài liệu dùng chuẩn HTML5. |
| 2 | Mở tài liệu và đặt ngôn ngữ mặc định là tiếng Việt. |
| 3 | Bắt đầu phần metadata, CSS và JavaScript trong `<head>`. |
| 4 | Comment nhắc mục đích charset và viewport. |
| 5 | UTF-8 hiển thị tiếng Việt; viewport giúp layout dùng đúng chiều rộng trên mobile. |
| 6 | Comment mô tả tiêu đề trang. |
| 7 | Tiêu đề tab; cặp `data-i18n-*` cho phép đổi VI/EN. |
| 8 | Chạy bootstrap trước CSS để đặt theme/ngôn ngữ đã lưu, tránh nháy giao diện sáng. |
| 9 | Comment giới thiệu CSS nền tảng. |
| 10 | Nạp CSS form tài khoản và token dùng chung. |
| 11 | Nạp CSS riêng cho login/register; `?v=2` giúp trình duyệt nhận bản style mới. |
| 12 | Comment nói hai module bên dưới xử lý việc riêng. |
| 13 | Nạp controller đăng ký, validate, và gửi request tài khoản. |
| 14 | Nạp controller carousel; lỗi preview không làm hỏng form. |
| 15 | Đóng phần `<head>`. |
| 16 | Mở body; class chọn layout trang đăng ký và kiểu entry. |
| 17 | Comment về khung bố cục ngoài. |
| 18 | `auth-shell` chứa header, nội dung, footer. |
| 19 | Comment về logo/ngôn ngữ và các nút preference. |
| 20 | Header có link logo, mô tả VI/EN, nút đổi ngôn ngữ, nút Light/Dark. |
| 21 | Comment về phần nội dung chính. |
| 22 | Mở vùng chính để CSS chia cột. |
| 23 | Comment về khu vực form. |
| 24 | Mở form-panel; `aria-labelledby` nối vùng này với heading. |
| 25 | Tiêu đề và mô tả trang; `data-i18n-*` chứa hai ngôn ngữ cho cả hai câu. |
| 26 | Comment mô tả form và id mà JS dùng. |
| 27 | Mở form đăng ký; id và `aria-describedby` là điểm nối với controller/trạng thái lỗi. |
| 28 | Comment về trường tên. |
| 29 | Nhãn và input tên; `name` được đọc từ `FormData`, `autocomplete` hỗ trợ tự điền, giới hạn 100 ký tự. |
| 30 | Comment về email. |
| 31 | Email dùng kiểm tra định dạng HTML, `maxlength`, autocomplete username, và tắt gợi ý sửa chính tả. |
| 32 | Comment về mật khẩu. |
| 33 | Ô mật khẩu chỉ giữ mức tối thiểu 8 ký tự; nút hiện/ẩn dùng `aria-controls` để trỏ đúng input. |
| 34 | Comment giải thích trường nhập lại. |
| 35 | Ô xác nhận mật khẩu và nút hiện/ẩn riêng; input có `name` để JS so sánh với mật khẩu đầu. |
| 36 | Comment về vùng thông báo. |
| 37 | Chỗ controller chèn lỗi hoặc kết quả; `aria-live` báo thay đổi cho screen reader. |
| 38 | Nút submit có bản dịch VI/EN. |
| 39 | Đóng form. |
| 40 | Comment về link điều hướng. |
| 41 | Link về trang đăng nhập và các chữ có bản dịch; nhập liệu không bị thay khi đổi ngôn ngữ. |
| 42 | Ghi chú thương hiệu phía dưới form, cũng có hai bản dịch. |
| 43 | Comment về nội dung dự phòng khi tắt JavaScript. |
| 44 | `<noscript>` nhắc bật JavaScript để đăng ký. |
| 45 | Đóng vùng form. |
| 46 | Comment về giới thiệu/carousel. |
| 47 | Mở aside giới thiệu; tên vùng được nối với heading. |
| 48 | Tiêu đề giới thiệu có bản dịch hai ngôn ngữ. |
| 49 | Mô tả giới thiệu có bản dịch; dùng câu liên tục để helper dịch mà không làm mất thẻ con. |
| 50 | Comment về điểm neo của carousel. |
| 51 | Phần tử gốc carousel; selector `data-event-carousel` giúp JS tìm component, aria-label được dịch. |
| 52 | `<figure>` nhóm artwork với caption. |
| 53 | Khung ảnh/nút điều hướng. |
| 54 | Comment mô tả cách nạp ảnh. |
| 55 | Slot ảnh được JS gán URL; `hidden` tránh ảnh trống, `width`/`height` giữ tỷ lệ, `alt` rỗng vì ảnh chỉ trang trí. |
| 56 | Comment về các nút mũi tên. |
| 57 | Nút slide trước; hiện khi có nhiều event, aria-label có VI/EN. |
| 58 | SVG mũi tên trái, chỉ trang trí. |
| 59 | Đóng nút slide trước. |
| 60 | Nút slide kế tiếp, có selector và aria-label tương tự nút trước. |
| 61 | SVG mũi tên phải, chỉ trang trí. |
| 62 | Đóng nút slide kế tiếp. |
| 63 | Đóng khung artwork. |
| 64 | Comment mô tả caption. |
| 65 | Mở caption; `aria-live="off"` tránh đọc liên tục khi carousel tự xoay. |
| 66 | Bọc các dòng chữ caption. |
| 67 | Loại sự kiện/trải nghiệm; JS cập nhật theo slide hiện tại. |
| 68 | Tên event do API trả về và JS cập nhật. |
| 69 | Địa điểm do JS đặt sau khi tải event. |
| 70 | Đóng nhóm chữ caption. |
| 71 | SVG hình vé trang trí, không chứa dữ liệu nghiệp vụ. |
| 72 | Đóng caption. |
| 73 | Đóng figure. |
| 74 | Đóng gốc carousel. |
| 75 | Đóng aside giới thiệu. |
| 76 | Đóng vùng main. |
| 77 | Footer có slogan và dòng phụ, cả hai đều hỗ trợ VI/EN. |
| 78 | Đóng khung ngoài. |
| 79 | Đóng body. |
| 80 | Đóng tài liệu HTML. |

### Cụm chức năng trong file này

- **Dòng 27–45 — form đăng ký:** HTML định danh các trường, nhãn, ràng buộc cơ bản và vùng thông báo. Việc gửi form nằm trong [`auth-pages.js`](../frontend/js/auth-pages.js), không phải `register.html`.
- **Dòng 47–75 — carousel:** HTML tạo slot/selector và nút điều khiển. [`auth-event-carousel.js`](../frontend/js/auth-event-carousel.js) tải dữ liệu, cập nhật nội dung, bật mũi tên và lên lịch tự chuyển.
- **Dòng 7–14 — kết nối asset và logic:** preferences bootstrap chạy trước CSS; auth.css/auth-entry.css định dạng trang; auth-pages.js xử lý tài khoản; carousel JS xử lý preview sự kiện.

## 3. Các file JS — theo cụm lệnh/hàm

### API helper: `api.js`

- Imports lấy base URL và các hàm token/đăng nhập.
- `errorMessages` ánh xạ các HTTP status phổ biến sang thông báo mặc định.
- `ApiError` giữ `status` và `code` để trang có thể phân biệt lỗi xác định (ví dụ 422) với lỗi mạng chưa rõ kết quả.
- `getErrorDetails` đọc `detail` từ JSON server, chấp nhận detail dạng chuỗi hoặc object.
- `apiRequest` tạo `Headers`, gắn bearer token nếu chưa có Authorization; object body thường được JSON stringify; `FormData`, `URLSearchParams`, Blob và ArrayBuffer được giữ nguyên.
- Request dùng Fetch API. Lỗi fetch được biến thành `ApiError` mạng; response 204 thành `null`; JSON sai định dạng từ response thành công bị báo lỗi.
- Với HTTP error, helper lấy message/code; 401 xóa token và chuyển về trang đăng nhập; các lỗi khác được ném lên để trang gọi quyết định cách xử lý.
- Carousel không dùng helper này vì endpoint highlights công khai và trang đăng nhập chưa cần token; nó dùng fetch trực tiếp.

### Carousel: `auth-event-carousel.js`

- `rotationDelay = 6_000`: khoảng thời gian 6 giây.
- `coverUrl` chuẩn hóa URL ảnh và chỉ chấp nhận http/https; URL sai trả chuỗi rỗng để tránh gán src lỗi.
- `loadCarousel` lấy các node trong markup bằng class/data attribute, sau đó gọi `/api/events/highlights` với `credentials: 'omit'`.
- Response phải thành công và là array. Lỗi/array rỗng chỉ cập nhật title placeholder rồi return, không chạm form đăng ký/đăng nhập.
- `playing`, `inView`, `hovering`, `current` là state của carousel. `prefers-reduced-motion` tắt auto-rotate ban đầu; `IntersectionObserver` chỉ cho chạy khi vùng carousel nhìn thấy đủ 25%.
- `render` chèn title, venue, category bằng `textContent`; URL ảnh hợp lệ mới được gán. Khi chuyển item, animation trước bị cancel; animation mới chỉ chạy khi không bật reduced-motion.
- `move` cộng/trừ index và dùng modulo để chuyển vòng từ cuối về đầu.
- `schedule` xóa timer cũ; chỉ tạo timer mới nếu đang chạy, hiện trong viewport, không hover và document không hidden.
- `stopRotation` khóa auto-rotate và bật aria-live thông báo lịch sự hơn sau khi người dùng thao tác.
- Với từ hai event trở lên, JS hiện mũi tên và gắn click handler; focus bằng bàn phím cũng dừng auto-rotate. Hover chỉ tạm dừng cho mouse; pointerleave lên lịch chạy lại.
- Listener visibility/reduced-motion cập nhật việc lên lịch; cuối cùng script chỉ chạy nếu trang thực sự có `[data-event-carousel]`.

### Catalog: `events.js`

- Imports API/auth/preferences; lấy form lọc, message, retry, danh sách và controls bằng selector tương ứng trong `events.html`.
- `catalogItems` giữ mảng dữ liệu hiện tại để dựng lại UI khi đổi ngôn ngữ mà không gọi lại API.
- `getStatusLabel`, `formatDate`, `formatPrice` chuyển trạng thái/ngày/giá theo VI/EN; thời gian dùng `Asia/Ho_Chi_Minh`.
- `imageUrl` nối URL ảnh tương đối với base URL API; `makeElement` và `createEventCard` tạo DOM bằng API DOM và `textContent` (không nhét event text vào HTML string).
- `createEventCard` render ảnh poster, fallback khi ảnh lỗi, tên, status badge, ngày, mô tả, giá và link chứa `event_id`.
- `updateSection` thay children, ghi số lượng và hiện empty message khi section rỗng.
- `updateCatalog` áp dụng status đang chọn ở phía client, phân thành on-sale / coming-soon / unavailable; ẩn section không liên quan và hiển thị empty state nếu không khớp.
- `loadEvents` tải danh sách mặc định, hiện loading, khóa controls trong lúc chờ, kiểm tra shape `items`, cập nhật UI, xử lý lỗi và luôn mở lại controls trong `finally`.
- `applyFilters` kiểm tra `date_from <= date_to`, tạo query chỉ gồm ngày rồi tải lại kết quả. Status được lọc ở `updateCatalog`; đây là điểm quan trọng khi giải thích vì backend filter contract chỉ nhận on_sale/coming_soon.
- Submit form gọi `preventDefault` rồi lọc; reset đợi browser reset input xong mới tải lại toàn bộ; retry gọi lại đúng hành động vừa lỗi.
- `start` xác thực trước rồi tải catalog; lỗi xác thực không cố tiếp tục gọi API event.

### Chi tiết sự kiện: `event-detail.js`

- Đọc `event_id` từ query string; giữ các node cần render và cache `currentEvent`.
- Khởi tạo site preferences; đổi ngôn ngữ thì gọi `renderEvent(currentEvent)` để cập nhật nội dung mà không tải lại dữ liệu.
- `getDateTimeFormatters`, `formatDateTime`, `formatDateTimeRange` định dạng UTC server trả về theo locale và múi giờ Việt Nam; lỗi ngày thì dùng fallback.
- `getStatusLabel` đổi trạng thái mở bán thành nhãn VI/EN.
- `getUnavailableMessage` đổi `booking_unavailable_reason` thành lý do dễ hiểu (chưa có lịch, coming soon, hết vé, đóng bán hoặc không có suất dùng được).
- `renderSessions` render giờ diễn và tình trạng vé từng suất; session không bookable không bị giả làm suất mua được.
- `renderEvent` cập nhật poster, trạng thái, tên, giờ, địa điểm, giá, mô tả và số vé. Nút mua chỉ hiện nếu `sale_status === 'on_sale' && is_bookable`; link chuyển `event.id` sang booking page.
- `loadEvent` xác minh ID là số nguyên dương dạng chuỗi, gọi GET event, kiểm tra mảng sessions và render. 401/404 không đưa ra retry vô ích.
- `start` gọi `requireAuth` trước `loadEvent`; retry trên trang gọi lại `loadEvent`.

### Booking: `booking.js`

- Imports translation, shared API, auth và localization lỗi; `initializeSitePreferences` gắn controls ngôn ngữ/theme.
- Đọc `event_id` từ URL; lấy form/layout/messages/session/quantity/buttons theo id trong `booking.html`.
- `requestStorageKey` được đặt sau khi xác thực user thành `eventy-booking-request:<user.id>:<eventId>`. Không dùng chung slot giữa các user hoặc event.
- `readStoredRequest` parse JSON và yêu cầu user_id, event_id, key cùng payload hoặc booking_id phải khớp. JSON hỏng hoặc record không hợp lệ sẽ báo lỗi thay vì lặng lẽ tạo request mới.
- `createRequestKey` dùng `crypto.randomUUID`; nếu browser không hỗ trợ thì dừng gửi để không gửi request không có dedupe key.
- `sessionOptions` tạo placeholder và các option session; `selectedSession` tìm session theo giá trị select.
- `updateEstimate` lấy số vé còn của session, cập nhật max/help, nhân quantity với ticket price. Chỉ hiển thị số tiền nếu quantity và tổng là safe integer; đây là ước tính UI, không được gửi lên server.
- `renderEvent` render summary, giữ event details, lọc session đang mở và còn vé, điền tên/email mặc định theo user, rồi xử lý trường hợp có request cũ hoặc event không bookable.
- Nếu record cũ là request chưa có booking_id, form được khôi phục để retry cùng payload; nếu booking đã tạo, trang hiển thị lựa chọn tiếp tục booking.
- `restoreRequestIfNeeded` điền lại đúng session/quantity/attendee, khóa sửa dữ liệu và chỉ bật nút retry cùng yêu cầu.
- `validateForm` đánh dấu `aria-invalid`, kiểm tra session, số lượng, tên, email và phone; gom lỗi thành một message. Server vẫn phải validate lại vì frontend có thể bị bypass hoặc tồn kho thay đổi.
- `getPayload` chỉ gửi `event_session_id`, `quantity` và attendee fields; không gửi giá hoặc tổng.
- `submitBooking` ngăn gửi đồng thời bằng `requestInFlight`; với submit mới thì validate; trước cả retry cũng gọi lại `requireAuth` rồi so sánh user ID để không gửi state sau khi đổi tài khoản.
- `sendBooking` lấy payload hiện tại hoặc đã lưu. Request mới sinh key, lưu payload trước khi network call, rồi POST với `Idempotency-Key`.
- Khi server trả booking id hợp lệ, lưu record rút gọn (chỉ user/event/key/booking_id), rồi chuyển đến payment page.
- Khi response thiếu booking id hoặc lỗi có kết quả chưa chắc chắn, giữ state và yêu cầu retry cùng key. Với 404/409/422 thì xóa state, mở khóa form để người dùng sửa.
- `loadPage` kiểm tra event id, xác thực user, đổi key theo user/event, khôi phục booking nếu đã có ID hoặc tải event và render.
- Event handlers cập nhật ước tính khi đổi session/quantity, gỡ `aria-invalid` khi nhập lại, xử lý submit/retry/load và chủ động xóa state nếu user chọn bắt đầu lượt đặt mới.
- Handler `eventy:languagechange` dịch message và thay nhãn/options/thời gian/giá; không reset hay gán lại input người dùng. `loadPage()` cuối file khởi chạy controller.

### Payment: `payment.js`

- Imports API/auth/preferences và hàm hiển thị lý do retry không khả dụng.
- Đọc `booking_id`, lấy các vùng UI, định dạng giờ/giá, cờ `paymentInFlight` chống gửi đồng thời.
- `isValidBooking` kiểm tra tối thiểu ID và status; `navigateToConfirmation` dùng `location.replace`, tránh Back quay lại thao tác payment cũ.
- `renderBooking` render snapshot server, status badge và actions. `payment_failed` không cho chọn failure lần nữa nhưng vẫn có thể retry success; `confirmed` ẩn actions; `can_retry_payment` từ server có thể khóa thao tác và hiện nguyên nhân.
- `loadBooking` kiểm tra booking ID, gọi GET booking. Nếu confirmed thì chuyển trang; nếu chưa thì render status; lỗi tải thì ẩn nội dung cũ và bật nút kiểm tra lại phù hợp.
- `simulatePayment(outcome)` khóa nút, POST kết quả mô phỏng và chỉ chuyển trang khi response confirmed. Nếu POST gặp lỗi, gọi `reconcilePayment`.
- `reconcilePayment` gọi lại GET booking; nếu trạng thái vẫn chưa xác định được thì hiện nút check status và không tuyên bố thành công.
- `start` xác thực user rồi mới tải booking; listener nút gọi success/failure hoặc kiểm tra lại. Khi đổi ngôn ngữ, render lại từ dữ liệu cache.

### Confirmation: `confirmation.js`

- Lấy booking id, message, content, retry và bộ format date/price; khai báo nhãn status.
- `renderBooking` cache booking, cập nhật nút cancel nếu booking chưa cancelled, sau đó render title/message/status và thông tin đặt vé từ server.
- `payment-link` chỉ hiện với booking chưa confirmed và server cho phép retry. Trạng thái cancelled được diễn giải riêng.
- `loadBooking` kiểm tra id rồi GET booking; kiểm tra shape response trước khi render. Lỗi tải hiển thị retry thay vì giả lập dữ liệu.
- `start` xác thực trước khi tải. Đổi ngôn ngữ thì render lại từ `displayedBooking` (không gửi lại thông tin form).

### Preferences và thông báo

- [`site-preferences-init.js`](../frontend/js/site-preferences-init.js): đọc localStorage sớm, đặt `documentElement.dataset.theme` và `lang`; nếu storage không truy cập được, dùng light/VI.
- [`site-preferences.js`](../frontend/js/site-preferences.js): `readPreference`/`savePreference` bọc thao tác storage; `getLanguage`/`translate` cung cấp ngôn ngữ hiện hành; `applyTranslations` đổi text và aria-label, kể cả trong DOM con vừa được tạo; `applyTheme` đổi dataset và nhãn nút. Các trang login, register, recovery, quản trị, catalog và checkout đều dùng chung hai nút này. Giá trị đang nhập không bị dựng lại khi đổi ngôn ngữ. `syncSavedPreferences` cập nhật khi pageshow/focus/storage event.
- [`auth-pages.js`](../frontend/js/auth-pages.js), [`recovery-pages.js`](../frontend/js/recovery-pages.js) và [`admin-events.js`](../frontend/js/admin-events.js) khởi tạo preferences cho các trang tài khoản, xác thực email/khôi phục mật khẩu và quản trị; các message phát sinh khi submit hoặc tải dữ liệu cũng được đổi ngôn ngữ.
- [`auth-entry.css`](../frontend/css/auth-entry.css) có màu nền riêng cho login/register, nên khai báo override tối riêng để Dark mode không bị nền sáng của trang ghi đè.
- [`flow-messages.js`](../frontend/js/flow-messages.js): dictionary message VI↔EN; exact match dịch một message, còn lỗi ghép thì thay các đoạn đã biết theo thứ tự dài trước ngắn để tránh thay cụm con trước.
- [`booking-status.js`](../frontend/js/booking-status.js): map retry-unavailable reason từ server thành message hai ngôn ngữ.
- [`config.js`](../frontend/js/config.js): nếu frontend chạy port 5500 thì gọi backend 127.0.0.1:8000; nếu được FastAPI/Docker serve cùng origin thì dùng `window.location.origin`.

## 4. HTML/CSS các trang khác: hiểu theo cụm

### HTML

- [`events.html`](../frontend/pages/events.html): `<head>` nạp bootstrap theme trước CSS, rồi nạp common/events CSS và module events.js. Trong body, header chứa navigation/preferences/logout; form có `date_from`, `date_to`, `sale_status`; các id như `catalog-sections`, `on-sale-events`, `unavailable-events` là điểm render của JS; footer là nội dung tĩnh.
- [`event-detail.html`](../frontend/pages/event-detail.html): vùng `event-content` ban đầu hidden, JS mở sau khi tải. Các id của poster/status/title/venue/price/note/sessions được `event-detail.js` cập nhật. Nút `buy-tickets` ban đầu hidden để tránh cho mua trước khi biết trạng thái.
- [`booking.html`](../frontend/pages/booking.html): có layout tóm tắt và form riêng; form `novalidate` vì JS muốn gom lỗi riêng và đánh dấu aria; IDs/field names là contract giữa JS và DOM/API.
- [`payment.html`](../frontend/pages/payment.html): warning nói rõ payment mô phỏng; content ban đầu hidden; hai nút success/failure gửi outcome, `check-status` dùng khi cần đối chiếu lại.
- [`confirmation.html`](../frontend/pages/confirmation.html): nội dung booking ban đầu hidden; retry chỉ hiện khi tải thất bại; summary có các trường do server trả.
- [`index.html`](../frontend/index.html) chia hai cột tương tự register: một phía là login form, phía kia tái sử dụng markup carousel qua cùng các `data-*` attributes. Hai nút preferences trong header dùng cùng lựa chọn đã lưu với mọi trang khác.

### CSS

- [`common.css`](../frontend/css/common.css): `:root` định nghĩa design tokens Light; `:root[data-theme='dark']` override các token; selectors `[hidden]`, focus, button, header/footer giúp mọi trang dùng chung; media query thu gọn header/footer trên mobile; reduced-motion giảm transition.
- [`auth.css`](../frontend/css/auth.css): lưới form/intro cho account pages, input, password toggle, message và breakpoint mobile.
- [`auth-entry.css`](../frontend/css/auth-entry.css): tinh chỉnh riêng cho login/register, ticket art/caption/arrows và responsive layout. Nó cùng tồn tại với auth.css, không phải stylesheet của checkout.
- [`events.css`](../frontend/css/events.css): grid lọc 4 cột → 2 cột → 1 cột; card poster 16:9, status, text và price.
- [`event-detail.css`](../frontend/css/event-detail.css): desktop poster-summary hai cột; mobile chuyển poster lên trước summary; sessions chuyển 2 cột xuống 1 cột.
- [`booking.css`](../frontend/css/booking.css): desktop summary/form hai cột, mobile một cột; field lỗi dùng `aria-invalid=true`; tổng tiền nằm trong panel riêng.
- [`payment.css`](../frontend/css/payment.css), [`confirmation.css`](../frontend/css/confirmation.css): card/summary và trạng thái success/failure/unconfirmed; trên mobile summary đổi thành một cột.

CSS chủ yếu định hình; logic nghiệp vụ nằm ở JS/server. Ví dụ màu tối được đổi bằng tokens trong `common.css`, còn JS chỉ đặt `data-theme="dark"`.

## 5. Backend contract cần nhớ khi demo

- [`GET /api/events/highlights`](../backend/app/api/events.py) là public; catalog và detail cần đăng nhập.
- [`GET /api/events`](../backend/app/api/events.py) trả `items`, date filters được xử lý server; detail trả `sessions[]`, `is_bookable` và `booking_unavailable_reason`.
- [`POST /api/bookings`](../backend/app/api/bookings.py) nhận payload đã validate cùng `Idempotency-Key`; backend tạo price snapshot, không tin giá client gửi.
- [`GET /api/bookings/{id}`](../backend/app/api/bookings.py) chỉ trả booking thuộc user hiện tại.
- [`POST /api/bookings/{id}/simulate-payment`](../backend/app/api/bookings.py) dùng state server; service transaction kiểm tra lại bán vé và tồn kho trước khi confirm.

## 6. Tests và cách đọc kết quả

- [`booking.test.cjs`](../frontend/tests/booking.test.cjs) chạy controller thật trong VM với DOM/API giả lập. Test các response 404/409/422 mở khóa sửa; lỗi network/401/403/429/500 giữ state/key; đổi user không gửi payload cũ; double retry chỉ tạo một request.
- [`site-preferences.test.cjs`](../frontend/tests/site-preferences.test.cjs) kiểm tra bootstrap trước paint, toggle và lưu language/theme, đồng bộ pageshow/storage/focus, dịch chuỗi lỗi ghép.
- [`my-bookings.test.cjs`](../frontend/tests/my-bookings.test.cjs) thuộc luồng lân cận; test trạng thái, retry path, empty state, pagination và lỗi tải.
- Lệnh chạy toàn bộ frontend test theo checklist là `node --test frontend/tests/*.test.cjs`. `demo.md` cũng liệt kê các tình huống thực hành gồm network loss, sold out, expired auth và switch account.

## 7. Những câu chốt khi trình bày

1. **Frontend không chốt giá:** tổng ở form là estimate; server lấy giá gốc, kiểm tra và lưu snapshot.
2. **Không coi timeout là thất bại/thành công:** booking retry dùng nguyên key/payload; payment lỗi thì GET trạng thái server trước.
3. **`user_id` trong storage chỉ phân vùng UI:** API token và ownership check mới là ranh giới bảo vệ dữ liệu.
4. **`event_id` xác định event, `event_session_id` xác định suất:** tồn kho/giờ diễn gắn với từng session.
5. **Status/availability chỉ là ảnh chụp:** backend kiểm tra lại ở thời điểm tạo booking và thanh toán.
6. **Đổi ngôn ngữ không reset form:** handler dịch nội dung/option và tính lại estimate từ input hiện tại.
7. **Payment là mô phỏng:** không nhập thẻ/ngân hàng; chỉ trạng thái confirmed do server trả mới được gọi là vé đã xác nhận.

## 8. Tài khoản, mật khẩu, giờ suất diễn và giao diện

- Header các trang đã đăng nhập bỏ liên kết **Sự kiện** riêng; logo vẫn dẫn về danh mục. Menu tài khoản dạng icon gọn, gom **Vé của tôi**, **Cài đặt tài khoản**, **Đăng xuất** và đóng khi bấm ra ngoài hoặc nhấn Escape.
- [`my-bookings.html`](../frontend/pages/my-bookings.html) chia danh sách theo trạng thái và thời gian; [`my-bookings.js`](../frontend/js/my-bookings.js) gửi bộ lọc tới API để tổng số và phân trang được tính trên toàn bộ lịch sử. Giao diện một cột, không có sidebar/breadcrumb và giữ empty state **Mua vé ngay**.
- [`account-settings.html`](../frontend/pages/account-settings.html) cho sửa tên, ngày sinh và số điện thoại tùy chọn; email chỉ đọc. [`account-page.js`](../frontend/js/account-page.js) gửi các trường hồ sơ được phép tới `PATCH /api/auth/me`; [`UserProfileUpdate`](../backend/app/schemas/auth.py) từ chối email và field lạ.
- [`auth.py`](../backend/app/api/auth.py) chỉ cho phép người đã đăng nhập cập nhật hồ sơ. Tên được trim, ngày sinh tương lai và số điện thoại không hợp lệ bị từ chối; ngày sinh/số điện thoại có thể để trống hoặc xóa.
- Đăng ký/đặt lại mật khẩu giữ mức tối thiểu 8 ký tự nhưng bỏ tối đa 72 byte. [`security.py`](../backend/app/core/security.py) tạo hash Argon2id mới, vẫn kiểm tra hash bcrypt cũ và tự nâng hash đó sau lần đăng nhập thành công.
- [`formatSessionRange`](../frontend/js/booking.js) hiển thị giờ bắt đầu–kết thúc 24 giờ theo `Asia/Ho_Chi_Minh`; cùng giá trị được dùng cho dropdown suất diễn và tóm tắt đặt vé. Khi đổi ngôn ngữ, dropdown và tóm tắt được dựng lại từ suất đã chọn, không reset form.
- Footer dùng chung có địa chỉ **Hanoi Centre** mở trên bản đồ, email `contact@eventy.com` mở bằng ứng dụng email và các liên kết đặt vé/tài khoản. Theme icon chỉ có một biểu tượng: Light hiện trăng để chuyển sang Dark, Dark hiện mặt trời để chuyển sang Light.
- [`site-preferences.js`](../frontend/js/site-preferences.js) giữ biểu tượng mặt trời/mặt trăng và gắn nhãn truy cập cho nút theme. Chuyển cảnh dùng View Transitions nếu có, fallback fade nếu không; `prefers-reduced-motion` tắt hoạt ảnh.
- Kiểm tra tập trung: [`account-page.test.cjs`](../frontend/tests/account-page.test.cjs) xác nhận request chỉ chứa tên/email giữ nguyên; [`test_auth.py`](../backend/tests/test_auth.py) kiểm tra API profile, mật khẩu dài và nâng bcrypt cũ; booking/preferences tests kiểm tra giờ VI/EN và fade.
