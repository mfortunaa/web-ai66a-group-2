const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Run the actual page controller with a small DOM and a controlled API transport.
const source = fs.readFileSync(path.join(__dirname, '../js/booking.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/loadPage\(\);\s*$/, '');
const payload = { event_session_id: 20, quantity: 2, attendee_name: 'Demo A',
  attendee_email: 'a@example.com', attendee_phone: '0901234567' };
const saved = { user_id: 1, event_id: 2, key: 'original-request-key', payload };
const key = 'eventy-booking-request:1:2';

function page(entries = [], transport = async () => ({ id: 99 })) {
  const nodes = new Map();
  const handlers = {};
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', hidden: true,
      disabled: false, textContent: '', dataset: {}, addEventListener() {},
      options: [],
      setAttribute() {}, append() {}, replaceChildren() {},
      reset() { for (const item of nodes.values()) item.value = ''; },
      querySelectorAll() { return ['#quantity', '#event-session', '#attendee-name',
        '#attendee-email', '#attendee-phone', '#submit-booking', '#retry-booking'].map(node); } });
    return nodes.get(selector);
  }
  const storage = new Map(entries);
  const requests = [];
  const navigations = [];
  let user = { id: 1, full_name: 'Demo A', email: 'a@example.com' };
  let language = 'vi';
  const event = { id: 2, title: 'Event', starts_at: '2026-12-01T12:00:00Z',
    ends_at: '2026-12-01T14:00:00Z', ticket_price_vnd: 100000,
    sale_status: 'on_sale', is_bookable: true,
    sessions: [{ id: 20, is_bookable: true, available_tickets: 10,
      starts_at: '2026-12-01T12:00:00Z', ends_at: '2026-12-01T14:00:00Z' }] };
  const context = vm.createContext({ t: (vi, en) => language === 'en' ? en : vi, getLanguage: () => language, initializeSitePreferences() {}, localizeMessage: text => text, console, Intl, URLSearchParams,
    crypto: { randomUUID: () => 'new-request-key' },
    document: { querySelector: node, createElement: () => node(`option-${nodes.size}`) },
    window: { addEventListener(name, handler) { handlers[name] = handler; }, location: { search: '?event_id=2', assign: url => navigations.push(url) } },
    sessionStorage: { getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    requireAuth: async () => user, logout() {},
    apiRequest: async (url, options) => {
      if (!options) return event;
      requests.push({ url, options });
      return transport(url, options);
    },
  });
  vm.runInContext(`${source}\nthis.controller = { loadPage, submitBooking, sessionLabel, updateEstimate };`, context);
  return { node, storage, requests, navigations, ...context.controller,
    setUser: value => { user = value; },
    setLanguage: value => { language = value; },
    changeLanguage: () => handlers['eventy:languagechange']?.() };
}

for (const status of [404, 409, 422]) {
  test(`restored request rejected with ${status} unlocks editing`, async () => {
    const p = page([[key, JSON.stringify(saved)]], async () => {
      throw Object.assign(new Error('Request rejected'), { status });
    });
    await p.loadPage();
    assert.equal(p.node('#quantity').disabled, true);
    await p.submitBooking(true);
    assert.equal(p.node('#quantity').disabled, false);
    assert.equal(p.node('#retry-booking').hidden, true);
    assert.equal(p.storage.has(key), false);
    assert.equal(p.requests[0].options.headers['Idempotency-Key'], saved.key);
    assert.equal(p.navigations.length, 0);
  });
}

for (const status of [undefined, 401, 403, 429, 500]) {
  test(`uncertain response ${status} retains the same request for retry`, async () => {
    let attempts = 0;
    const p = page([[key, JSON.stringify(saved)]], async () => {
      if (++attempts === 1) throw Object.assign(new Error('Unavailable'), { status });
      return { id: 99 };
    });
    await p.loadPage();
    await p.submitBooking(true);
    assert.equal(p.node('#quantity').disabled, true);
    assert.equal(p.storage.has(key), true);
    await p.submitBooking(true);
    assert.equal(p.requests.length, 2);
    assert.equal(p.requests[1].options.headers['Idempotency-Key'], saved.key);
    assert.equal(JSON.stringify(p.requests[1].options.body), JSON.stringify(payload));
    assert.deepEqual(p.navigations, ['payment.html?booking_id=99']);
  });
}

test('another account never restores the previous account request or booking', async () => {
  for (const record of [saved, { ...saved, payload: undefined, booking_id: 99 }]) {
    const p = page([[key, JSON.stringify(record)]]);
    p.setUser({ id: 2, full_name: 'Demo B', email: 'b@example.com' });
    await p.loadPage();
    assert.equal(p.node('#existing-booking').hidden, true);
    assert.equal(p.node('#attendee-name').value, 'Demo B');
    assert.equal(p.node('#quantity').disabled, false);
    assert.equal(p.requests.length, 0);
    assert.equal(p.storage.has(key), true);
  }
});

test('account change before retry reloads the form without sending old attendee data', async () => {
  const p = page([[key, JSON.stringify(saved)]]);
  await p.loadPage();
  p.setUser({ id: 2, full_name: 'Demo B', email: 'b@example.com' });
  await p.submitBooking(true);
  assert.equal(p.requests.length, 0);
  assert.equal(p.node('#attendee-name').value, 'Demo B');
  assert.equal(p.node('#attendee-phone').value, '');
});

test('double retry sends only one booking request', async () => {
  let finish;
  const p = page([[key, JSON.stringify(saved)]], () => new Promise(resolve => { finish = resolve; }));
  await p.loadPage();
  const first = p.submitBooking(true);
  await p.submitBooking(true);
  assert.equal(p.requests.length, 1);
  finish({ id: 99 });
  await first;
  assert.equal(p.navigations.length, 1);
});

test('performance options and booking summary show Vietnam-local 24-hour ranges in both languages', async () => {
  const p = page();
  assert.match(p.sessionLabel({ starts_at: '2026-12-01T12:00:00Z', ends_at: '2026-12-01T14:00:00Z', available_tickets: 2 }),
    /^19:00 – 21:00 ngày 01\/12\/2026/);
  await p.loadPage();
  p.node('#event-session').value = '20';
  p.node('#attendee-name').value = 'Name stays';
  p.updateEstimate();
  assert.equal(p.node('#selected-session-time').textContent, '19:00 – 21:00 ngày 01/12/2026');

  p.setLanguage('en');
  p.changeLanguage();
  assert.equal(p.node('#selected-session-time').textContent, '19:00–21:00, 01/12/2026');
  assert.equal(p.node('#attendee-name').value, 'Name stays');
});
