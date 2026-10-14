// socra-ai-web/docs/contracts/iframe-bridge.md의 v1 계약을 사용한다.
(() => {
  const CHANNEL = 'socra-iframe-bridge';
  const PARENT_ORIGINS = [
    'https://socratutor.ai',
    'https://socra-ai-web-stg.vercel.app',
    'https://socra-ai-web-dev.vercel.app',
    'http://localhost:3333',
  ];
  const documentId = crypto.randomUUID();
  let origin = null, sessionId = null, seq = 0, isWebView = false;
  let hasContext = false, safeArea = null, layoutRevision = 0;
  const post = message => window.parent.postMessage({ channel: CHANNEL, ...message }, origin);
  const bridge = {
    get connected() { return sessionId !== null; },
    emit(name, payload) {
      if (sessionId) post({ kind: 'event', version: 1, sessionId, name, payload });
    },
    request(name, payload) {
      if (sessionId) post({ kind: 'request', version: 1, sessionId, id: `${documentId}-${++seq}`, name, payload });
    },
  };
  const notifyLayoutReady = () => {
    if (!hasContext || !safeArea) return;
    const revision = ++layoutRevision;
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    fontsReady.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (revision !== layoutRevision || !sessionId) return;
      bridge.emit('scholarship-layout-ready', { isWebView, safeArea });
    })));
  };
  window.scholarshipBridge = bridge;

  if (window.parent === window) return;
  addEventListener('message', event => {
    const message = event.data;
    if (event.source !== window.parent || !PARENT_ORIGINS.includes(event.origin)) return;
    if (!message || message.channel !== CHANNEL || (origin && event.origin !== origin)) return;
    if (message.kind === 'welcome') {
      if (message.documentId !== documentId || message.version !== 1 ||
          typeof message.sessionId !== 'string' || !message.sessionId || message.sessionId.length > 128) return;
      if (sessionId !== message.sessionId) {
        isWebView = false; hasContext = false; safeArea = null; layoutRevision++;
      }
      origin = event.origin;
      sessionId = message.sessionId;
      post({ kind: 'ready', version: 1, sessionId });
      return;
    }
    if (!sessionId || message.version !== 1 || message.sessionId !== sessionId || message.kind !== 'event') return;
    if (message.name === 'host-scholarship-context-changed') {
      if (typeof message.payload?.isWebView !== 'boolean') return;
      isWebView = message.payload.isWebView;
      hasContext = true;
      document.documentElement.toggleAttribute('data-scholarship-webview', isWebView);
      notifyLayoutReady();
    }
    if (message.name === 'host-safe-area-changed') {
      const nextSafeArea = message.payload?.safeArea;
      if (!nextSafeArea || ![nextSafeArea.top, nextSafeArea.bottom].every(value => Number.isFinite(value) && value >= 0)) return;
      safeArea = { top: nextSafeArea.top, bottom: nextSafeArea.bottom };
      document.documentElement.style.setProperty('--host-safe-area-top', `${safeArea.top}px`);
      document.documentElement.style.setProperty('--host-safe-area-bottom', `${safeArea.bottom}px`);
      notifyLayoutReady();
    }
  });
  let tries = 0;
  const hello = () => {
    if (sessionId || tries++ > 20) return;
    for (const targetOrigin of PARENT_ORIGINS) {
      window.parent.postMessage({ channel: CHANNEL, kind: 'hello', documentId, supportedVersions: [1] }, targetOrigin);
    }
    setTimeout(hello, 400);
  };
  hello();

  // 일반 웹의 랜딩·가이드 링크는 원래 href/target으로 동작한다.
  // 응모 폼은 기존처럼 웹에서도 부모에게 링크를 중계한다.
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href^="http"]') : null;
    if (!anchor || !bridge.connected || (!isWebView && document.documentElement.dataset.scholarshipPage !== 'apply')) return;
    const url = new URL(anchor.href);
    const destinations = {
      '/event/scholarship': 'landing',
      '/event/scholarship/guide': 'guide',
      '/event/scholarship/apply': 'apply',
      '/landing': 'tutor-landing',
    };
    const destination = url.origin === 'https://socratutor.ai' ? destinations[url.pathname.replace(/\/$/, '')] : null;
    let payload;
    if (destination) payload = { to: destination, newTab: !isWebView && anchor.target !== '_top' };
    else if (document.documentElement.dataset.scholarshipPage === 'apply' && url.origin !== location.origin && url.hostname !== 'socratutor.ai') payload = { to: 'external', url: anchor.href };
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
    bridge.request('scholarship-navigate', payload);
  }, true);
})();
