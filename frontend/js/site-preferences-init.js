// Run before stylesheets so navigation never paints the opposite saved theme.
try {
  document.documentElement.dataset.theme = localStorage.getItem('eventy-theme-v2') === 'dark' ? 'dark' : 'light';
  document.documentElement.lang = localStorage.getItem('eventy-language') === 'en' ? 'en' : 'vi';
} catch {
  document.documentElement.dataset.theme = 'light';
  document.documentElement.lang = 'vi';
}
