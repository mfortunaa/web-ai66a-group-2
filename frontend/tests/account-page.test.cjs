const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/account-page.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/await loadAccount\(\);\s*$/, '');

test('account settings only submits the editable name and keeps the email read-only', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../pages/account-settings.html'), 'utf8');
  assert.match(html, /id="user-email"[^>]*readonly/);
  assert.doesNotMatch(html.match(/<form id="account-form"[\s\S]*?<\/form>/)[0], /name="email"/);

  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', hidden: true, textContent: '', disabled: false, attributes: {},
      listeners: {}, classes: new Set(),
      addEventListener(name, handler) { this.listeners[name] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      classList: {
        add: value => nodes.get(selector).classes.add(value),
        remove: value => nodes.get(selector).classes.delete(value),
      },
      reportValidity: () => true,
      focus() {},
    });
    return nodes.get(selector);
  }
  const calls = [];
  const context = vm.createContext({
    document: { querySelector: node },
    window: { addEventListener() {} },
    initializeSitePreferences() {},
    t: (vi, en) => vi,
    localizeMessage: text => text,
    logout() {},
    requireAuth: async () => ({
      full_name: 'Khang Tran', email: 'khang@example.com',
      date_of_birth: null, phone_number: null,
    }),
    apiRequest: async (url, options) => {
      calls.push({ url, options });
      return { ...options.body, email: 'khang@example.com' };
    },
  });
  vm.runInContext(`${source}\nthis.controller = { loadAccount, form };`, context);
  await context.controller.loadAccount();
  assert.equal(node('#account-form').hidden, false);
  assert.equal(node('#user-email').value, 'khang@example.com');

  node('#user-name').value = 'New Name';
  node('#date-of-birth').value = '2000-02-29';
  node('#phone-number').value = '+84 901 234 567';
  await node('#account-form').listeners.submit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/auth/me');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.body)), {
    full_name: 'New Name', date_of_birth: '2000-02-29', phone_number: '+84 901 234 567',
  });
  assert.equal(node('#user-email').value, 'khang@example.com');
  assert.equal(node('#form-message').textContent, 'Đã lưu thông tin tài khoản.');
});
