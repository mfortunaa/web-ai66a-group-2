const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../js/my-bookings.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/loadPage\(\);\s*$/, '');
const reasons = fs.readFileSync(path.join(__dirname, '../js/booking-status.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
function element(tag = 'div') {
  return { tag, children: [], hidden: false, disabled: false, textContent: '', attributes: {}, listeners: {},
    dataset: {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(type, callback) { this.listeners[type] = callback; } };
}
function setup(transport = async () => pageData([]), authenticate = async () => ({})) {
  const nodes = new Map(); const requests = []; const events = {};
  const get = selector => { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); };
  get('#status-tabs').children = ['all', 'confirmed', 'processing', 'cancelled'].map(value => {
    const button = element('button'); button.dataset.bookingStatus = value; return button;
  });
  get('#period-tabs').children = ['upcoming', 'past'].map(value => {
    const button = element('button'); button.dataset.bookingPeriod = value; return button;
  });
  const context = vm.createContext({ createCancelButton: () => element('button'), t: (vi, en) => vi, getLanguage: () => 'vi', initializeSitePreferences() {}, localizeMessage: text => text, Intl, Date, Object, Number, encodeURIComponent,
    document: { querySelector: get, createElement: element },
    window: { addEventListener: (event, fn) => { events[event] = fn; } },
    requireAuth: authenticate, logout() {},
    URLSearchParams,
    apiRequest: async url => { requests.push(url); return transport(url); },
  });
  vm.runInContext(reasons + '\n' + source, context);
  return { get, requests, events, load: target => context.loadPage(target) };
}
function booking(overrides = {}) {
  return { id: 8, event_title: '<img src=x onerror=alert(1)>', venue: 'Hà Nội', reference: 'BK-8', quantity: 2,
    status: 'pending', total_price_vnd: 250000, can_retry_payment: true, retry_unavailable_reason: null,
    session_starts_at: '2027-01-17T09:00:00Z', session_ends_at: '2027-01-17T11:00:00Z', created_at: '2026-11-05T03:00:00Z', ...overrides };
}
function pageData(items, total = items.length) { return { items, total, limit: 10, offset: 0 }; }
function descendants(item) { return [item, ...item.children.flatMap(descendants)]; }
test('empty account shows catalog empty state, not invented tickets', async () => {
  const ui = setup(); await ui.load();
  assert.equal(ui.get('#bookings-empty').hidden, false);
  assert.equal(ui.get('#bookings-content').hidden, true);
  assert.equal(ui.get('#bookings-list').children.length, 0);
});
test('cancelled history remains visible without payment or another cancel action', async () => {
  const ui = setup(async () => pageData([booking({ status: 'cancelled', can_retry_payment: false, retry_unavailable_reason: 'cancelled' })]));
  await ui.load();
  assert.equal(ui.get('#bookings-content').hidden, false);
  const nodes = descendants(ui.get('#bookings-list'));
  assert.ok(nodes.some(n => n.textContent === 'Đã hủy'));
  assert.ok(!nodes.some(n => n.href?.startsWith('payment')));
  assert.ok(!nodes.some(n => n.tag === 'button'));
  assert.ok(nodes.some(n => n.href === 'confirmation.html?booking_id=8'));
});
test('statuses select the original booking destination and render server strings as text', async () => {
  const ui = setup(async () => pageData([booking(), booking({ id: 9, status: 'confirmed', can_retry_payment: false }), booking({ id: 10, status: 'payment_failed' })]));
  await ui.load();
  const rows = ui.get('#bookings-list').children;
  assert.equal(rows.length, 3);
  assert.equal(descendants(rows[0]).find(n => n.tag === 'h2').textContent, '<img src=x onerror=alert(1)>');
  assert.ok(descendants(rows[0]).some(n => n.href === 'payment.html?booking_id=8'));
  assert.ok(descendants(rows[1]).some(n => n.href === 'confirmation.html?booking_id=9'));
  assert.ok(!descendants(rows[1]).some(n => n.href?.startsWith('payment')));
  assert.ok(descendants(rows[2]).some(n => n.textContent === 'Thử thanh toán lại'));
  assert.ok(descendants(rows[0]).some(n => String(n.textContent).includes('16:00')));
  assert.ok(descendants(rows[0]).some(n => String(n.textContent).includes('250.000')));
});
test('unavailable bookings explain the reason without a payment link', async () => {
  const ui = setup(async () => pageData([booking({ can_retry_payment: false, retry_unavailable_reason: 'tickets_unavailable' })])); await ui.load();
  const nodes = descendants(ui.get('#bookings-list'));
  assert.ok(nodes.some(n => n.textContent === 'Không còn đủ vé cho đặt vé này.'));
  assert.ok(!nodes.some(n => n.href?.startsWith('payment')));
  assert.ok(nodes.some(n => n.href === 'confirmation.html?booking_id=8'));
});
test('pagination requests bounded offsets and respects total', async () => {
  const ui = setup(async url => url.includes('offset=10') ? pageData([booking({ id: 20 })], 11) : pageData(Array.from({ length: 10 }, (_, id) => booking({ id: id + 1 })), 11));
  await ui.load(); assert.equal(ui.get('#next-page').disabled, false);
  await ui.get('#next-page').listeners.click();
  assert.equal(ui.requests[1], '/api/bookings?limit=10&offset=10&period=upcoming');
  assert.equal(ui.get('#next-page').disabled, true); assert.equal(ui.get('#previous-page').disabled, false);
  await ui.get('#previous-page').listeners.click(); assert.equal(ui.requests[2], '/api/bookings?limit=10&offset=0&period=upcoming');
});
test('temporary failure retries the requested page and hides stale content', async () => {
  let fail = true;
  const ui = setup(async () => { if (fail) throw new Error('Disconnected'); return pageData([booking()], 11); });
  await ui.load(10); assert.equal(ui.get('#retry').hidden, false); assert.equal(ui.get('#bookings-content').hidden, true);
  fail = false; await ui.get('#retry').onclick();
  assert.equal(ui.requests[1], '/api/bookings?limit=10&offset=10&period=upcoming'); assert.equal(ui.get('#retry').hidden, true);
});
test('rejects invalid server data and avoids duplicate requests while loading', async () => {
  let release;
  const ui = setup(() => new Promise(resolve => { release = resolve; }));
  const first = ui.load(); await Promise.resolve(); await ui.load();
  assert.equal(ui.requests.length, 1);
  release({ items: [], total: -1 }); await first;
  assert.equal(ui.get('#retry').hidden, false);
});
test('bfcache return refreshes booking state', async () => {
  const ui = setup(); await ui.load(); await ui.events.pageshow({ persisted: true });
  assert.equal(ui.requests.length, 2);
});
test('expired authentication offers no retry and never requests the list', async () => {
  const ui = setup(undefined, async () => { throw Object.assign(new Error('Expired'), { status: 401 }); });
  await ui.load(); assert.equal(ui.get('#retry').hidden, true); assert.equal(ui.requests.length, 0);
});
test('status and time filters request matching server pages and reset pagination', async () => {
  const ui = setup();
  await ui.load(10);
  await ui.get('#status-tabs').children[2].listeners.click();
  assert.equal(ui.requests[1], '/api/bookings?limit=10&offset=0&period=upcoming&status=processing');
  assert.equal(ui.get('#status-tabs').children[2].attributes['aria-pressed'], 'true');
  await ui.get('#period-tabs').children[1].listeners.click();
  assert.equal(ui.requests[2], '/api/bookings?limit=10&offset=0&period=past&status=processing');
  assert.equal(ui.get('#period-tabs').children[1].attributes['aria-pressed'], 'true');
});

test('filter changes during a request render only the latest selection', async () => {
  let finishOldRequest;
  let finishNewRequest;
  let oldRequestStarted;
  let newRequestStarted;
  const oldResponse = new Promise(resolve => { finishOldRequest = resolve; });
  const newResponse = new Promise(resolve => { finishNewRequest = resolve; });
  const oldRequest = new Promise(resolve => { oldRequestStarted = resolve; });
  const newRequest = new Promise(resolve => { newRequestStarted = resolve; });
  const ui = setup(url => {
    if (url.includes('period=upcoming')) {
      oldRequestStarted();
      return oldResponse;
    }
    newRequestStarted();
    return newResponse;
  });
  const loading = ui.load(10);
  await oldRequest;
  assert.equal(ui.requests.length, 1);
  ui.get('#period-tabs').children[1].listeners.click();
  ui.get('#status-tabs').children[1].listeners.click();

  finishOldRequest(pageData([booking({ event_title: 'Old result' })], 11));
  await Promise.race([newRequest, loading]);
  assert.equal(ui.get('#bookings-content').hidden, true);
  assert.equal(ui.get('#bookings-list').children.length, 0);

  finishNewRequest(pageData([booking({ status: 'confirmed', event_title: 'Latest result' })]));
  await loading;
  assert.deepEqual(ui.requests, [
    '/api/bookings?limit=10&offset=10&period=upcoming',
    '/api/bookings?limit=10&offset=0&period=past&status=confirmed',
  ]);
  assert.equal(ui.get('#period-tabs').children[1].attributes['aria-pressed'], 'true');
  assert.equal(ui.get('#bookings-content').hidden, false);
  assert.ok(descendants(ui.get('#bookings-list')).some(node => node.textContent === 'Latest result'));
});
