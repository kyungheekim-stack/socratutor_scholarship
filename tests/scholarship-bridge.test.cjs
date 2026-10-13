const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/scholarship-bridge.js'), 'utf8');

function createChild(page = 'landing', embedded = true) {
  const listeners = {}, messages = [], properties = {}, attributes = {};
  const root = { dataset: { scholarshipPage: page },
    style: { setProperty: (name, value) => { properties[name] = value; } },
    toggleAttribute: (name, value) => { attributes[name] = value; } };
  class Anchor {
    constructor(href, target = '_top') { this.href = href; this.target = target; }
    closest() { return this; }
  }
  const parent = { postMessage: (message, origin) => messages.push({ message, origin }) };
  const window = {};
  window.parent = embedded ? parent : window;
  vm.runInNewContext(source, { window, document: { documentElement: root,
    addEventListener: (name, listener) => { listeners[name] = listener; } },
    addEventListener: (name, listener) => { listeners[name] = listener; },
    crypto: { randomUUID: () => 'document-1' }, setTimeout: () => {}, URL,
    location: { origin: 'https://socratutor-scholarship.vercel.app' }, Element: Anchor });
  const send = (message, origin = 'https://socra-ai-web-stg.vercel.app', sender = parent) => listeners.message?.({ source: sender, origin,
    data: { channel: 'socra-iframe-bridge', version: 1, sessionId: 'session-1', ...message } });
  const connect = () => send({ kind: 'welcome', documentId: 'document-1' });
  const context = (isWebView) => send({ kind: 'event', name: 'host-scholarship-context-changed', payload: { isWebView } });
  const click = (href, target) => {
    let prevented = false;
    listeners.click?.({ target: new Anchor(href, target),
      preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => {} });
    return prevented;
  };
  return { listeners, messages, properties, attributes, send, connect, context, click, window };
}

test('웹뷰 내부 링크는 현재 부모에게 목적지만 보내고 원래 탐색을 막는다', () => {
  const child = createChild(); child.connect(); child.context(true);
  for (const [pathname, to] of [['/event/scholarship/apply', 'apply'], ['/event/scholarship/guide', 'guide'], ['/event/scholarship', 'landing'], ['/landing', 'tutor-landing']]) {
    assert.equal(child.click(`https://socratutor.ai${pathname}`, '_blank'), true);
    const { message, origin } = child.messages.at(-1);
    assert.equal(origin, 'https://socra-ai-web-stg.vercel.app');
    assert.equal(message.name, 'scholarship-navigate');
    assert.equal(message.payload.to, to); assert.equal(message.payload.newTab, false);
  }
});

test('일반 웹과 연결 전 랜딩·가이드 링크는 원래 href와 target으로 동작한다', () => {
  for (const page of ['landing', 'guide']) {
    const child = createChild(page);
    assert.equal(child.click('https://socratutor.ai/event/scholarship/apply'), false);
    child.connect(); child.context(false);
    assert.equal(child.click('https://socratutor.ai/event/scholarship/apply'), false);
  }
  assert.equal(createChild('landing', false).messages.length, 0);
});

test('웹 응모 폼의 기존 가이드 새 탭과 외부 링크 중계를 유지한다', () => {
  const child = createChild('apply'); child.connect(); child.context(false);
  assert.equal(child.click('https://socratutor.ai/event/scholarship/guide', '_blank'), true);
  assert.equal(child.messages.at(-1).message.payload.newTab, true);
  child.context(true);
  assert.equal(child.click('https://socraai.notion.site/terms', '_blank'), true);
  assert.equal(child.messages.at(-1).message.payload.to, 'external');
});

test('현재 부모·session의 유효한 안전 영역만 받고 변경값을 갱신한다', () => {
  const child = createChild(); child.connect(); child.context(true);
  const event = { kind: 'event', name: 'host-safe-area-changed', payload: { safeArea: { top: 47, bottom: 34 } } };
  child.send(event, 'https://evil.example'); child.send(event, undefined, {});
  child.send({ ...event, sessionId: 'stale' });
  assert.deepEqual(child.properties, {});
  child.send(event);
  assert.equal(child.properties['--host-safe-area-top'], '47px');
  assert.equal(child.properties['--host-safe-area-bottom'], '34px');
  for (const top of [-1, Infinity, '47', null]) {
    child.send({ ...event, payload: { safeArea: { top, bottom: 0 } } });
    assert.equal(child.properties['--host-safe-area-top'], '47px');
  }
  child.send({ ...event, payload: { safeArea: { top: 24, bottom: 0 } } });
  assert.equal(child.properties['--host-safe-area-top'], '24px');
  assert.equal(child.properties['--host-safe-area-bottom'], '0px');
});

test('다른 origin·문서·version의 welcome은 연결로 인정하지 않는다', () => {
  const child = createChild();
  child.send({ kind: 'welcome', documentId: 'document-1' }, 'https://evil.example');
  child.send({ kind: 'welcome', documentId: 'other' });
  child.send({ kind: 'welcome', documentId: 'document-1', version: 2 });
  assert.equal(child.window.scholarshipBridge.connected, false);
});
