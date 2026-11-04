const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
test('stored preferences initialize controls and toggles persist both language and theme', () => {
  const values = new Map([['eventy-language', 'en'], ['eventy-theme-v2', 'dark']]);
  const make = () => ({ textContent: '', attributes: {}, listeners: {}, setAttribute(k,v) {this.attributes[k]=v;}, addEventListener(k,fn) {this.listeners[k]=fn;} });
  const language = make(), theme = make(), icon = make(), label = make();
  theme.querySelector = selector => selector === '[data-theme-icon]' ? icon : label;
  const copy = { ...make(), dataset: { i18nVi: 'Vé của tôi', i18nEn: 'My bookings' } };
  const root = { dataset: {} }; const events = [];
  const context = vm.createContext({ localStorage: {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},
    document: { documentElement:root, querySelector:s=>s==='#language-toggle'?language:theme,
      querySelectorAll:s=>s==='[data-i18n-vi][data-i18n-en]'?[copy]:[] },
    window:{dispatchEvent:event=>events.push(event)}, CustomEvent:class { constructor(type) {this.type=type;} } });
  vm.runInContext(read('site-preferences.js').replace(/export /g,''), context);
  context.initializeSitePreferences();
  assert.equal(root.lang,'en'); assert.equal(root.dataset.theme,'dark'); assert.equal(copy.textContent,'My bookings');
  assert.equal(label.textContent,'Light mode'); assert.equal(theme.attributes['aria-pressed'],'true');
  language.listeners.click(); assert.equal(values.get('eventy-language'),'vi'); assert.equal(copy.textContent,'Vé của tôi');
  assert.equal(label.textContent,'Giao diện sáng');
  theme.listeners.click(); assert.equal(root.dataset.theme,'light'); assert.equal(values.get('eventy-theme-v2'),'light');
  assert.ok(events.some(event=>event.type==='eventy:languagechange'));
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
