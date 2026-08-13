/* North Atlanta Automotive — form submission + outbound tracking.
 * Vanilla ES6. No libraries. Never on the critical path.
 *
 * CORS note: Apps Script cannot answer an OPTIONS preflight. Sending
 * Content-Type: application/json triggers one and the request dies with an
 * opaque CORS error. text/plain makes it a "simple request" — no preflight —
 * and JSON.parse(e.postData.contents) still reads the body fine server-side.
 */
(function () {
  'use strict';

  var ENDPOINT = document.documentElement.getAttribute('data-gas-endpoint') || '';

  /* ------------------------------------------------------ mobile navigation */
  (function initMobileNavigation() {
    var header = document.querySelector('.masthead');
    if (!header) return;

    var shell = header.querySelector('.wrap, .nav-shell');
    var nav = header.querySelector('nav.primary, .nav-shell nav');
    if (!shell || !nav) return;

    var menuId = 'mobile-navigation';
    nav.id = nav.id || menuId;
    nav.classList.add('mobile-nav-panel');

    var toggle = document.createElement('button');
    toggle.className = 'mobile-menu-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-label', 'Open navigation menu');
    toggle.innerHTML =
      '<span class="menu-mark" aria-hidden="true">' +
        '<i></i><i></i><i></i>' +
      '</span>' +
      '<span class="menu-label">Menu</span>';

    var veil = document.createElement('button');
    veil.className = 'mobile-menu-veil';
    veil.type = 'button';
    veil.setAttribute('aria-label', 'Close navigation menu');
    veil.tabIndex = -1;

    shell.appendChild(toggle);
    header.appendChild(veil);

    function setMenu(open, restoreFocus) {
      document.documentElement.classList.toggle('menu-open', open);
      header.classList.toggle('menu-is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      toggle.querySelector('.menu-label').textContent = open ? 'Close' : 'Menu';
      if (!open && restoreFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    veil.addEventListener('click', function () { setMenu(false, true); });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false, true);
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900 && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
      }
    });
  })();

  /* ------------------------------------------------------------ form submit */
  Array.prototype.forEach.call(document.querySelectorAll('form[data-gas-form]'), function (form) {
    var loadedAt = Date.now();
    var status   = form.querySelector('[data-form-status]');
    var button   = form.querySelector('button[type="submit"]');

    function setStatus(msg, kind) {
      if (!status) return;
      status.textContent = msg;
      status.className = 'form-status ' + (kind || '');
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var payload = {};
      new FormData(form).forEach(function (v, k) { payload[k] = v; });
      payload.formType = form.getAttribute('data-gas-form');
      payload.page     = location.pathname;
      payload.origin   = location.origin;
      payload.ua       = navigator.userAgent;
      payload.elapsed  = Date.now() - loadedAt;

      /* GitHub Pages and early previews have no server-side form endpoint.
       * Fall back to the visitor's email client so the request is still usable
       * without pretending it was delivered. */
      if (!ENDPOINT || ENDPOINT.indexOf('DEPLOYMENT_ID') !== -1) {
        var subject = 'Website ' + (payload.formType || 'contact') + ' request';
        var lines = Object.keys(payload)
          .filter(function (key) { return ['ua', 'elapsed', 'origin'].indexOf(key) === -1; })
          .map(function (key) { return key + ': ' + payload[key]; });
        setStatus('Opening your email app so you can send this request…', '');
        location.href = 'mailto:northatlantaautomotive@gmail.com?subject=' +
          encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
        return;
      }

      setStatus('Sending…', '');
      if (button) button.disabled = true;

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.error || 'Submission failed');
          form.reset();
          loadedAt = Date.now();
          setStatus('Thanks — we’ll get back to you within one business day.', 'ok');
          track('form_submit', { form: payload.formType });
        })
        .catch(function () {
          setStatus('That didn’t go through. Please call (770) 676-7030 — we’ll pick up.', 'error');
        })
        .then(function () { if (button) button.disabled = false; });
    });
  });

  /* -------------------------------------------------- outbound click tracking
   * The shop currently cannot tell how many people reach booking, finish it,
   * or which page sent them. Every tagged CTA fires an event. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-analytics]');
    if (!a) return;
    track(a.getAttribute('data-analytics'), {
      location: a.getAttribute('data-location') || '',
      page: location.pathname
    });
  }, { passive: true });

  function track(name, props) {
    try {
      if (window.gtag) window.gtag('event', name, props);
      if (window.plausible) window.plausible(name, { props: props });
    } catch (err) { /* analytics must never break the page */ }
  }
})();
