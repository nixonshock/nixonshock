/* Bee Tee Sea — live Bitcoin block height.
 *
 * Exactly one copy is ever visible on a screen:
 *   • the hub (beeteesea/index.html) carries a <span id="bh"> placeholder in its
 *     title row, right of the Bee/Tee/Sea words — filled here. One element, so
 *     it shows for all three themes.
 *   • a scene page opened on its own gets a stat injected into its stats dock.
 *   • a scene running inside the hub's iframe shows neither of its own (the hub
 *     header already has it) — the same rule the scenes use to hide their brand
 *     when framed.
 *
 * Source: mempool.space tip height, falling back to blockstream.info.
 * Cadence: on load, every 30s, and again whenever the tab regains focus
 * (background tabs have their timers throttled, so the number would go stale).
 * A new block flashes the number in the theme accent colour.
 */
(function () {
  'use strict';

  if (window.__btseaBlockHeight) return;   // never wire up twice on one page
  window.__btseaBlockHeight = true;

  var box = document.getElementById('bh');
  var el = document.getElementById('sBlock');

  if (!el || !box) {
    // no placeholder: only a standalone scene gets its own copy
    var framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    if (framed) return;                    // the hub header already shows it

    var stats = document.querySelector('.stats');
    if (!stats) return;                    // not a scene page — nothing to do

    var nextItem = document.getElementById('sNext');
    box = document.createElement('div');
    box.id = 'bh';
    box.title = 'Height of the latest Bitcoin block — refreshes every 30s';
    box.innerHTML = '<b id="sBlock">\u2014</b><span>block height</span>';

    // sit with the other stats, just before the hint + Pause button
    if (nextItem && nextItem.parentNode && nextItem.parentNode.parentNode === stats) {
      nextItem.parentNode.insertAdjacentElement('afterend', box);
    } else {
      stats.insertBefore(box, stats.firstChild);
    }
    el = document.getElementById('sBlock');
  }

  var SOURCES = [
    'https://mempool.space/api/blocks/tip/height',
    'https://blockstream.info/api/blocks/tip/height'
  ];
  var POLL_MS = 30000;

  var style = document.createElement('style');
  style.textContent =
    '#bh b{display:inline-block;transition:color .3s}\n' +
    '#bh.flash b{animation:bh-flash 1.6s ease-out 1}\n' +
    '@keyframes bh-flash{0%{color:var(--accent,var(--acc,#ffd54a));transform:scale(1.18)}100%{color:inherit;transform:none}}';
  document.head.appendChild(style);

  var seen = null;

  function group(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function paint(h) {
    if (!h || h === seen) return;
    var first = seen === null;
    seen = h;
    el.textContent = group(h);
    if (!first) {                          // flash only when the chain advances
      box.classList.remove('flash');
      void box.offsetWidth;                // restart the animation
      box.classList.add('flash');
    }
  }

  function fetchFrom(i) {
    if (i >= SOURCES.length) return Promise.reject(new Error('no source'));
    return fetch(SOURCES[i] + '?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (body) {
        var h = parseInt(String(body).trim(), 10);
        if (!(h > 0)) throw new Error('bad height');
        return h;
      })
      .catch(function () { return fetchFrom(i + 1); });
  }

  function tick() { fetchFrom(0).then(paint, function () { /* keep the last value */ }); }

  tick();
  setInterval(tick, POLL_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) tick();
  });
})();
