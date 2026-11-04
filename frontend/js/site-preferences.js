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

export function initializeSitePreferences() {
  const languageButton = document.querySelector('#language-toggle');
  const themeButton = document.querySelector('#theme-toggle');

  function applyLanguage() {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n-vi][data-i18n-en]').forEach((element) => {
      element.textContent = language === 'en'
        ? element.dataset.i18nEn
        : element.dataset.i18nVi;
    });
    document.querySelectorAll('[data-i18n-aria-vi][data-i18n-aria-en]').forEach((element) => {
      element.setAttribute('aria-label', language === 'en'
        ? element.dataset.i18nAriaEn
        : element.dataset.i18nAriaVi);
    });
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
      themeButton.querySelector('[data-theme-icon]').textContent = theme === 'dark' ? '☀' : '◐';
      themeButton.querySelector('[data-theme-label]').textContent = theme === 'dark'
        ? translate('Giao diện sáng', 'Light mode')
        : translate('Giao diện tối', 'Dark mode');
    }
  }

  languageButton?.addEventListener('click', () => {
    language = language === 'vi' ? 'en' : 'vi';
    savePreference(LANGUAGE_KEY, language);
    applyLanguage();
    applyTheme();
  });

  themeButton?.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    savePreference(THEME_KEY, theme);
    applyTheme();
  });

  function syncSavedPreferences() {
    const savedLanguage = readPreference(LANGUAGE_KEY, language) === 'en' ? 'en' : 'vi';
    const savedTheme = readPreference(THEME_KEY, theme) === 'dark' ? 'dark' : 'light';
    const languageChanged = savedLanguage !== language;
    language = savedLanguage;
    theme = savedTheme;
    applyTheme();
    if (languageChanged) applyLanguage();
  }

  // Back/Forward may restore a whole page, including its old module state.
  // Other tabs can also change the preferences while this page is open.
  window.addEventListener('pageshow', syncSavedPreferences);
  window.addEventListener('focus', syncSavedPreferences);
  window.addEventListener('storage', event => {
    if (event.key === LANGUAGE_KEY || event.key === THEME_KEY || event.key === null) syncSavedPreferences();
  });

  applyTheme();
  applyLanguage();
}
