import { API_BASE_URL } from './config.js';

const rotationDelay = 6_000;

function coverUrl(value) {
  try {
    const url = new URL(value, API_BASE_URL);
    return value && ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

async function loadCarousel(carousel) {
  const ticket = carousel.querySelector('.event-ticket');
  const caption = ticket.querySelector('figcaption');
  const image = carousel.querySelector('[data-event-cover]');
  const title = carousel.querySelector('[data-event-title]');
  const venue = carousel.querySelector('[data-event-venue]');
  const category = carousel.querySelector('[data-event-category]');

  let events;
  try {
    const response = await fetch(new URL('/api/events/highlights', API_BASE_URL), { credentials: 'omit' });
    if (!response.ok) throw new Error('Could not load event highlights');
    events = await response.json();
    if (!Array.isArray(events)) throw new Error('Invalid event highlights');
  } catch {
    title.textContent = 'Tạm thời chưa tải được lịch sự kiện.';
    return;
  }
  if (!events.length) {
    title.textContent = 'Chưa có sự kiện để giới thiệu.';
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !reducedMotion.matches;
  let inView = !('IntersectionObserver' in window);
  let hovering = false;
  let current = 0;
  let timer;
  let animation;

  image.addEventListener('load', () => { image.hidden = false; });
  image.addEventListener('error', () => { image.hidden = true; });

  function render(direction = 0) {
    const event = events[current];
    title.textContent = event.title;
    venue.textContent = event.venue;
    category.textContent = event.is_past ? 'Sự kiện đã diễn ra' : 'Một trải nghiệm cùng Eventy';

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

  function move(direction) {
    current = (current + direction + events.length) % events.length;
    render(direction);
  }

  function schedule() {
    window.clearTimeout(timer);
    if (!playing || !inView || hovering || document.hidden) return;
    timer = window.setTimeout(() => {
      move(1);
      schedule();
    }, rotationDelay);
  }

  function stopRotation() {
    playing = false;
    caption.setAttribute('aria-live', 'polite');
    schedule();
  }

  render();
  if (events.length === 1) return;
  for (const [selector, direction] of [['[data-carousel-prev]', -1], ['[data-carousel-next]', 1]]) {
    const arrow = carousel.querySelector(selector);
    arrow.hidden = false;
    arrow.addEventListener('click', () => {
      stopRotation();
      move(direction);
    });
  }
  carousel.addEventListener('focusin', (event) => {
    if (event.target.matches(':focus-visible')) stopRotation();
  });
  carousel.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return;
    hovering = true;
    schedule();
  });
  carousel.addEventListener('pointerleave', () => {
    hovering = false;
    schedule();
  });
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

const carousel = document.querySelector('[data-event-carousel]');
if (carousel) loadCarousel(carousel);
