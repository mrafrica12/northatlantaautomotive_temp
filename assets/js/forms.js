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
