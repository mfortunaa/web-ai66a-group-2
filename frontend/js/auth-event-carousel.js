import { API_BASE_URL } from './config.js';
import { translate } from './site-preferences.js?v=7';
import { localizeMessage } from './flow-messages.js';

// Thời gian giữa hai lần tự chuyển slide.
const rotationDelay = 6_000;

// Chỉ cho phép URL ảnh http/https; ảnh sai định dạng sẽ được bỏ qua.
function coverUrl(value) {
  try {
    const url = new URL(value, API_BASE_URL);
    return value && ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

// Tải dữ liệu carousel và nối hành vi vào các node được khai báo trong HTML.
async function loadCarousel(carousel) {
  const ticket = carousel.querySelector('.event-ticket');
  const caption = ticket.querySelector('figcaption');
  const image = carousel.querySelector('[data-event-cover]');
  const title = carousel.querySelector('[data-event-title]');
  const venue = carousel.querySelector('[data-event-venue]');
  const category = carousel.querySelector('[data-event-category]');

  let events;
  window.addEventListener('eventy:languagechange', () => {
    if (Array.isArray(events) && events.length) render();
    else if (title.textContent) title.textContent = localizeMessage(title.textContent);
  });
  try {
    // Endpoint public nên không gửi thông tin xác thực của người dùng.
    const response = await fetch(new URL('/api/events/highlights', API_BASE_URL), { credentials: 'omit' });
    if (!response.ok) throw new Error('Could not load event highlights');
    events = await response.json();
    if (!Array.isArray(events)) throw new Error('Invalid event highlights');
  } catch {
    // Lỗi preview chỉ thay nội dung carousel, không ảnh hưởng form auth.
    title.textContent = localizeMessage('Tạm thời chưa tải được lịch sự kiện.');
    return;
  }
  if (!events.length) {
    title.textContent = localizeMessage('Chưa có sự kiện để giới thiệu.');
    return;
  }

  // Các cờ này quyết định liệu timer có được phép tự chạy hay không.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !reducedMotion.matches;
  let inView = !('IntersectionObserver' in window);
  let hovering = false;
  let current = 0;
  let timer;
  let animation;

  // Chỉ hiện ảnh sau khi tải thành công; ảnh lỗi được ẩn.
  image.addEventListener('load', () => { image.hidden = false; });
  image.addEventListener('error', () => { image.hidden = true; });

  // Cập nhật nội dung slide hiện tại và chạy chuyển động nhẹ nếu được phép.
  function render(direction = 0) {
    const event = events[current];
    title.textContent = event.title;
    venue.textContent = event.venue;
    category.textContent = event.is_past
      ? translate('Sự kiện đã diễn ra', 'Past event')
      : translate('Một trải nghiệm cùng Eventy', 'An Eventy experience');

    const src = coverUrl(event.image_url);
    if (src !== image.getAttribute('src')) {
      image.hidden = true;
      if (src) image.src = src;
      else image.removeAttribute('src');
    }

    animation?.cancel();
    if (direction && !reducedMotion.matches) {
      animation = ticket.animate(
        [{ opacity: .7, transform: `translateX(${direction * 8}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 240, easing: 'ease-out' },
      );
    }
  }

  // Dịch chuyển index theo vòng tròn để slide cuối nối về slide đầu.
  function move(direction) {
    current = (current + direction + events.length) % events.length;
    render(direction);
  }

  // Xóa timer cũ; chỉ lên lịch khi tab/slide đang ở trạng thái phù hợp.
  function schedule() {
    window.clearTimeout(timer);
    if (!playing || !inView || hovering || document.hidden) return;
    timer = window.setTimeout(() => {
      move(1);
      schedule();
    }, rotationDelay);
  }

  // Người dùng tương tác thì dừng auto-rotate và bật thông báo lịch sự.
  function stopRotation() {
    playing = false;
    caption.setAttribute('aria-live', 'polite');
    schedule();
  }

  render();
  // Một slide thì không cần nút điều hướng hay listener carousel.
  if (events.length === 1) return;
  for (const [selector, direction] of [['[data-carousel-prev]', -1], ['[data-carousel-next]', 1]]) {
    const arrow = carousel.querySelector(selector);
    arrow.hidden = false;
    arrow.addEventListener('click', () => {
      stopRotation();
      move(direction);
    });
  }
  // Focus bằng bàn phím cũng dừng tự chạy để tránh thay nội dung dưới focus.
  carousel.addEventListener('focusin', (event) => {
    if (event.target.matches(':focus-visible')) stopRotation();
  });
  // Hover chuột tạm dừng timer; rời vùng carousel thì có thể chạy lại.
  carousel.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return;
    hovering = true;
    schedule();
  });
  carousel.addEventListener('pointerleave', () => {
    hovering = false;
    schedule();
  });
  // Không xoay nội dung nền khi người dùng chuyển tab hoặc yêu cầu giảm chuyển động.
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', (event) => {
    if (event.matches) stopRotation();
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.intersectionRatio >= .25;
      schedule();
    }, { threshold: .25 });
    observer.observe(ticket);
  }
  schedule();
}

// Script dùng chung cho login/register; trang khác không có node này thì không chạy.
const carousel = document.querySelector('[data-event-carousel]');
if (carousel) loadCarousel(carousel);
