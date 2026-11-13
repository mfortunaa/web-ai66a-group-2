const LANGUAGE_KEY = 'eventy-language';
const THEME_KEY = 'eventy-theme-v2';

function readPreference(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return false;
  }
  return true;
}

let language = readPreference(LANGUAGE_KEY, 'vi') === 'en' ? 'en' : 'vi';
let theme = readPreference(THEME_KEY, 'light');
theme = theme === 'dark' ? 'dark' : 'light';

export function getLanguage() {
  return language;
}

export function translate(vietnamese, english) {
  return language === 'en' ? english : vietnamese;
}

export function applyTranslations(root = document) {
  const textSelector = '[data-i18n-vi][data-i18n-en]';
  const ariaSelector = '[data-i18n-aria-vi][data-i18n-aria-en]';
  const textElements = [
    ...(root.matches?.(textSelector) ? [root] : []),
    ...root.querySelectorAll(textSelector),
  ];
  const ariaElements = [
    ...(root.matches?.(ariaSelector) ? [root] : []),
    ...root.querySelectorAll(ariaSelector),
  ];

  textElements.forEach((element) => {
    const text = language === 'en'
      ? element.dataset.i18nEn
      : element.dataset.i18nVi;
    if (element.childElementCount > 0) {
      const textNode = Array.from(element.childNodes).find((node) => node.nodeType === 3);
      if (textNode) textNode.nodeValue = text;
      else element.prepend(document.createTextNode(text));
    } else {
      element.textContent = text;
    }
  });
  ariaElements.forEach((element) => {
    element.setAttribute('aria-label', language === 'en'
      ? element.dataset.i18nAriaEn
      : element.dataset.i18nAriaVi);
  });
}

function updateSiteFooters() {
  const pagePrefix = window.location?.pathname?.includes('/pages/') ? '' : 'pages/';
  const bookingsUrl = `${pagePrefix}my-bookings.html`;
  const settingsUrl = `${pagePrefix}account-settings.html`;
  document.querySelectorAll('footer.site-footer, footer.auth-footer, footer.bookings-footer').forEach((footer) => {
    footer.className = 'site-footer';
    footer.removeAttribute('data-i18n-vi');
    footer.removeAttribute('data-i18n-en');
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-main">
          <section class="footer-brand">
            <a class="brand" href="${pagePrefix}events.html" aria-label="Eventy">
              <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 5v14" stroke-dasharray="2 2"/></svg>
              <span>eventy</span>
            </a>
            <p data-i18n-vi="Khám phá sự kiện, quản lý đặt vé và lưu lại những trải nghiệm đáng nhớ." data-i18n-en="Discover events, manage bookings, and keep track of memorable experiences.">Khám phá sự kiện, quản lý đặt vé và lưu lại những trải nghiệm đáng nhớ.</p>
          </section>
          <section class="footer-column">
            <h2 data-i18n-vi="Địa chỉ" data-i18n-en="Address">Địa chỉ</h2>
            <ul class="footer-links"><li><a href="https://maps.google.com/?q=Hanoi+Centre" target="_blank" rel="noopener noreferrer" data-i18n-vi="Hanoi Centre, Hà Nội" data-i18n-en="Hanoi Centre, Hanoi">Hanoi Centre, Hà Nội</a></li></ul>
          </section>
          <section class="footer-column">
            <h2 data-i18n-vi="Liên hệ" data-i18n-en="Contact">Liên hệ</h2>
            <ul class="footer-links">
              <li><a href="mailto:contact@eventy.com">contact@eventy.com</a></li>
              <li><a href="${bookingsUrl}" data-i18n-vi="Vé của tôi" data-i18n-en="My bookings">Vé của tôi</a></li>
              <li><a href="${settingsUrl}" data-i18n-vi="Cài đặt tài khoản" data-i18n-en="Account settings">Cài đặt tài khoản</a></li>
            </ul>
          </section>
        </div>
        <div class="footer-bottom">
          <span>© Eventy</span>
          <span data-i18n-vi="Khám phá · Đặt vé · Trải nghiệm" data-i18n-en="Discover · Book · Experience">Khám phá · Đặt vé · Trải nghiệm</span>
        </div>
      </div>`;
  });
}

export function initializeSitePreferences() {
  const languageButton = document.querySelector('#language-toggle');
  const themeButton = document.querySelector('#theme-toggle');
  const accountMenus = document.querySelectorAll('.account-menu');

  function applyLanguage() {
    document.documentElement.lang = language;
    applyTranslations();
    if (languageButton) {
      languageButton.textContent = language === 'vi' ? 'EN' : 'VI';
      languageButton.setAttribute('aria-label', translate('Chuyển sang tiếng Anh', 'Switch to Vietnamese'));
      languageButton.title = translate('Chuyển sang tiếng Anh', 'Switch to Vietnamese');
    }
    window.dispatchEvent(new CustomEvent('eventy:languagechange', { detail: { language } }));
  }

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    if (themeButton) {
      themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
      const actionLabel = theme === 'dark'
        ? translate('Chuyển sang giao diện sáng', 'Switch to light mode')
        : translate('Chuyển sang giao diện tối', 'Switch to dark mode');
      themeButton.setAttribute('aria-label', actionLabel);
      themeButton.title = actionLabel;
      themeButton.querySelector('[data-theme-icon]').textContent = '';
    }
  }

  function transitionPreference(update, fallbackClass, fadeBeforeUpdate = false) {
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (!prefersReducedMotion && typeof document.startViewTransition === 'function') {
      document.startViewTransition(update);
      return;
    }

    if (prefersReducedMotion) {
      update();
      return;
    }

    root.classList?.add(fallbackClass);
    if (fadeBeforeUpdate) {
      window.setTimeout(() => {
        update();
        root.classList?.remove(fallbackClass);
      }, 140);
      return;
    }

    update();
    if (root.classList) window.setTimeout(() => root.classList.remove(fallbackClass), 280);
  }

  function transitionTheme() {
    transitionPreference(applyTheme, 'theme-fading');
  }

  function transitionLanguage() {
    transitionPreference(() => {
      applyLanguage();
      applyTheme();
    }, 'language-fading', true);
  }

  themeButton?.querySelector('[data-theme-label]')?.remove?.();

  if (accountMenus.length) {
    document.addEventListener('click', (event) => {
      accountMenus.forEach((menu) => {
        if (!menu.contains(event.target)) menu.open = false;
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      accountMenus.forEach((menu) => {
        if (menu.open) {
          menu.open = false;
          menu.querySelector('summary')?.focus();
        }
      });
    });
  }

  languageButton?.addEventListener('click', () => {
    language = language === 'vi' ? 'en' : 'vi';
    savePreference(LANGUAGE_KEY, language);
    transitionLanguage();
  });

  themeButton?.addEventListener('click', () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    theme = nextTheme;
    savePreference(THEME_KEY, nextTheme);
    transitionTheme();
  });

  function syncSavedPreferences() {
    const savedLanguage = readPreference(LANGUAGE_KEY, language) === 'en' ? 'en' : 'vi';
    const savedTheme = readPreference(THEME_KEY, theme) === 'dark' ? 'dark' : 'light';
    const languageChanged = savedLanguage !== language;
    language = savedLanguage;
    theme = savedTheme;
    if (languageChanged) applyLanguage();
    applyTheme();
  }

  // Back/Forward may restore a whole page, including its old module state.
  // Other tabs can also change the preferences while this page is open.
  window.addEventListener('pageshow', syncSavedPreferences);
  window.addEventListener('focus', syncSavedPreferences);
  window.addEventListener('storage', event => {
    if (event.key === LANGUAGE_KEY || event.key === THEME_KEY || event.key === null) syncSavedPreferences();
  });

  updateSiteFooters();
  applyTheme();
  applyLanguage();
}
