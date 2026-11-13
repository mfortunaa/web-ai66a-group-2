const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
test('every page loads the early preference bootstrap and provides both controls', () => {
  const frontend = path.join(__dirname, '..');
  const pages = [path.join(frontend, 'index.html'), ...fs.readdirSync(path.join(frontend, 'pages'))
    .filter(name => name.endsWith('.html')).map(name => path.join(frontend, 'pages', name))];
  for (const file of pages) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /site-preferences-init\.js/);
    assert.match(html, /id="language-toggle"/);
    assert.match(html, /id="theme-toggle"/);
  }
});
test('customer pages group bookings, account settings, and logout in the account menu', () => {
  const frontend = path.join(__dirname, '..');
  for (const name of ['events.html', 'event-detail.html', 'booking.html', 'payment.html',
    'confirmation.html', 'my-bookings.html', 'admin-events.html', 'account-settings.html']) {
    const html = fs.readFileSync(path.join(frontend, 'pages', name), 'utf8');
    assert.match(html, /class="account-menu"/, name);
    assert.match(html, /href="(?:my-bookings|account-settings)\.html"/, name);
    assert.match(html, /id="logout"/, name);
    assert.doesNotMatch(html, /data-account-name/, name);
    assert.doesNotMatch(html, /<a class="nav-link" href="events\.html"[^>]*>Sự kiện<\/a>/, name);
  }
});
test('my bookings keeps a single-column layout and shared footer has clickable contact details', () => {
  const frontend = path.join(__dirname, '..');
  const bookings = fs.readFileSync(path.join(frontend, 'pages/my-bookings.html'), 'utf8');
  const preferences = read('site-preferences.js');
  assert.doesNotMatch(bookings, /account-sidebar|breadcrumbs|Theo dõi trạng thái và lịch diễn/);
  assert.match(bookings, /<main class="bookings-main">/);
  assert.match(preferences, /href="mailto:contact@eventy\.com"/);
  assert.match(preferences, /href="https:\/\/maps\.google\.com\/\?q=Hanoi\+Centre"/);
});
test('catalog headings show only their main titles and date hints are hidden when empty', () => {
  const frontend = path.join(__dirname, '..');
  const catalog = fs.readFileSync(path.join(frontend, 'pages/events.html'), 'utf8');
  const styles = fs.readFileSync(path.join(frontend, 'css/events.css'), 'utf8');
  const script = read('events.js');
  assert.doesNotMatch(catalog, /EVENTY ·|CHỌN VÉ NGAY|ĐỪNG BỎ LỠ|CẬP NHẬT TRẠNG THÁI/);
  assert.match(styles, /date-empty:not\(:focus\).*datetime-edit/);
  assert.match(script, /classList\.toggle\('date-empty', input\.value === ''\)/);
});
test('sold-out and closed event states use the negative color and event cards align details links', () => {
  const styles = fs.readFileSync(path.join(__dirname, '../css/events.css'), 'utf8');
  const detailStyles = fs.readFileSync(path.join(__dirname, '../css/event-detail.css'), 'utf8');
  assert.match(styles, /\.status-pill\.unavailable \{ color: var\(--negative\)/);
  assert.match(detailStyles, /\.status-pill\.unavailable \{ color: var\(--negative\)/);
  assert.match(styles, /\.event-card \{ display: flex; flex-direction: column; \}/);
  assert.match(styles, /\.event-card-content \{[^}]*flex: 1;/);
});
test('customer flows share page-title and control typography tokens', () => {
  const css = path.join(__dirname, '../css');
  const common = fs.readFileSync(path.join(css, 'common.css'), 'utf8');
  assert.match(common, /--font-size-page-title: clamp\(28px, 3vw, 36px\)/);
  assert.match(common, /--font-size-control: 15px/);
  for (const name of ['events.css', 'event-detail.css', 'booking.css', 'payment.css',
    'confirmation.css', 'auth.css', 'auth-entry.css', 'my-bookings.css']) {
    assert.match(fs.readFileSync(path.join(css, name), 'utf8'), /font-size: var\(--font-size-page-title\)/, name);
  }
});
test('shared footer no longer contains simulated-payment guidance', () => {
  const preferences = read('site-preferences.js');
  assert.doesNotMatch(preferences, /Payments are simulated in this demo/);
  assert.doesNotMatch(preferences, /Thanh toán trong bản demo được mô phỏng/);
});
test('pre-paint bootstrap applies stored theme and language without waiting for API/modules', () => {
  const root = { dataset: {} };
  vm.runInNewContext(read('site-preferences-init.js'), {
    document: { documentElement: root },
    localStorage: { getItem: key => key === 'eventy-theme-v2' ? 'dark' : 'en' },
  });
  assert.equal(root.dataset.theme, 'dark'); assert.equal(root.lang, 'en');
  vm.runInNewContext(read('site-preferences-init.js'), {
    document: { documentElement: root }, localStorage: { getItem() { throw new Error('Unavailable'); } },
  });
  assert.equal(root.dataset.theme, 'light'); assert.equal(root.lang, 'vi');
});
test('stored preferences initialize controls and toggles persist both language and theme', () => {
  const values = new Map([['eventy-language', 'en'], ['eventy-theme-v2', 'dark']]);
  const make = () => ({ textContent: '', attributes: {}, listeners: {}, setAttribute(k,v) {this.attributes[k]=v;}, addEventListener(k,fn) {this.listeners[k]=fn;} });
  const language = make(), theme = make(), icon = make(), label = { ...make(), remove() { this.removed = true; } };
  theme.querySelector = selector => selector === '[data-theme-icon]' ? icon : label;
  const copy = { ...make(), dataset: { i18nVi: 'Vé của tôi', i18nEn: 'My bookings' } };
  const classes = new Set(); let finishFade;
  const root = { dataset: {}, classList: { add: value => classes.add(value), remove: value => classes.delete(value) } };
  const events = []; const handlers = {};
  const context = vm.createContext({ localStorage: {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},
    document: { documentElement:root, querySelector:s=>s==='#language-toggle'?language:theme,
      querySelectorAll:s=>s==='[data-i18n-vi][data-i18n-en]'?[copy]:[] },
    window:{dispatchEvent:event=>events.push(event), addEventListener:(name,fn)=>{handlers[name]=fn;},
      matchMedia:()=>({matches:false}), setTimeout:fn=>{finishFade=fn;} },
    CustomEvent:class { constructor(type) {this.type=type;} } });
  vm.runInContext(read('site-preferences.js').replace(/export /g,''), context);
  context.initializeSitePreferences();
  assert.equal(root.lang,'en'); assert.equal(root.dataset.theme,'dark'); assert.equal(copy.textContent,'My bookings');
  assert.equal(icon.textContent,''); assert.equal(label.removed,true); assert.equal(theme.attributes['aria-pressed'],'true');
  assert.equal(theme.attributes['aria-label'],'Switch to light mode');
  language.listeners.click(); assert.equal(values.get('eventy-language'),'vi');
  assert.ok(classes.has('language-fading')); finishFade();
  assert.equal(copy.textContent,'Vé của tôi'); assert.ok(!classes.has('language-fading'));
  assert.equal(icon.textContent,'');
  theme.listeners.click(); assert.equal(root.dataset.theme,'light'); assert.equal(values.get('eventy-theme-v2'),'light');
  assert.ok(classes.has('theme-fading')); finishFade(); assert.ok(!classes.has('theme-fading'));
  assert.equal(icon.textContent,''); assert.equal(theme.attributes['aria-label'],'Chuyển sang giao diện tối');
  assert.ok(events.some(event=>event.type==='eventy:languagechange'));
  values.set('eventy-language','en'); values.set('eventy-theme-v2','dark');
  handlers.pageshow({persisted:true});
  assert.equal(root.lang,'en'); assert.equal(root.dataset.theme,'dark'); assert.equal(copy.textContent,'My bookings');
  assert.equal(icon.textContent,''); assert.equal(theme.attributes['aria-label'],'Switch to light mode');
  values.set('eventy-language','vi'); values.set('eventy-theme-v2','light');
  handlers.storage({key:'eventy-language'});
  assert.equal(root.lang,'vi'); assert.equal(root.dataset.theme,'light');
  assert.equal(icon.textContent,'');
  values.set('eventy-theme-v2','dark'); handlers.focus(); assert.equal(root.dataset.theme,'dark');
  assert.equal(icon.textContent,''); assert.equal(theme.attributes['aria-label'],'Chuyển sang giao diện sáng');
});
test('theme icon destination is moon in light mode and sun in dark mode', () => {
  const css = fs.readFileSync(path.join(__dirname, '../css/common.css'), 'utf8');
  assert.match(css, /#theme-toggle \[data-theme-icon\]::before \{ content: '☾'/);
  assert.match(css, /:root\[data-theme='dark'\] #theme-toggle \[data-theme-icon\]::before \{ content: '☀'/);
});
test('translation updates labels inside form controls without replacing the controls or their values', () => {
  const make = () => ({ textContent: '', attributes: {}, listeners: {}, setAttribute(k,v) {this.attributes[k]=v;}, addEventListener(k,fn) {this.listeners[k]=fn;} });
  const language = make(), theme = make(), icon = make(), label = make();
  theme.querySelector = selector => selector === '[data-theme-icon]' ? icon : label;
  const input = { value: 'Khang Tran', nodeType: 1 };
  const textNode = { nodeType: 3, nodeValue: 'Họ và tên' };
  const fieldLabel = {
    dataset: { i18nVi: 'Họ và tên', i18nEn: 'Full name' },
    childElementCount: 1,
    childNodes: [textNode, input],
    matches: selector => selector === '[data-i18n-vi][data-i18n-en]',
    querySelectorAll: () => [],
  };
  const root = { dataset: {} };
  let finishTransition;
  const context = vm.createContext({
    localStorage: { getItem: () => 'vi', setItem() {} },
    document: {
      documentElement: root,
      querySelector: selector => selector === '#language-toggle' ? language : theme,
      querySelectorAll: selector => selector === '[data-i18n-vi][data-i18n-en]' ? [fieldLabel] : [],
      createTextNode: value => ({ nodeType: 3, nodeValue: value }),
    },
    window: { dispatchEvent() {}, addEventListener() {}, setTimeout: callback => { finishTransition = callback; } },
    CustomEvent: class {},
  });
  vm.runInContext(read('site-preferences.js').replace(/export /g, ''), context);
  context.initializeSitePreferences();
  const subtree = {
    matches: () => false,
    querySelectorAll: selector => selector === '[data-i18n-vi][data-i18n-en]' ? [fieldLabel] : [],
  };
  context.applyTranslations(subtree);
  language.listeners.click();
  finishTransition();
  assert.equal(textNode.nodeValue, 'Full name');
  assert.equal(input.value, 'Khang Tran');
  assert.equal(fieldLabel.childNodes[1], input);
});
test('flow messages translate combined validation errors in both directions', () => {
  let language = 'en';
  const context = vm.createContext({ getLanguage:()=>language, translate:(vi,en)=>language==='en'?en:vi });
  vm.runInContext(read('flow-messages.js').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),context);
  const vi='Vui lòng nhập email hợp lệ. Số điện thoại cần có từ 8 đến 15 chữ số.';
  const en=context.localizeMessage(vi);
  assert.equal(en,'Enter a valid email address. Phone number must contain 8–15 digits.');
  language='vi'; assert.equal(context.localizeMessage(en),vi);
});
