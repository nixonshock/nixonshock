/* Bee Tee Sea — live Bitcoin block height, shown in the scene's stats dock.
 *
 * Self-contained: it finds the .stats dock (identical in Bee / Tee / Sea),
 * injects one more stat item ("970,180  block height") right after the
 * "next block" item, and keeps it current.
 *
 * Source: mempool.space tip height, falling back to blockstream.info.
 * Cadence: immediately on load, then every 30s, and again whenever the tab
 * regains focus (background tabs have their timers throttled, so a stale
 * number would otherwise sit there). A new block flashes the number in the
 * scene's accent colour.
 *
 * Loaded by beeteesea/scenes/{beetc,bteec,btsea}/index.html — one line each.
 */
(function () {
  'use strict';

  if (window.__btseaBlockHeight) return;   // never inject twice on one page
  window.__btseaBlockHeight = true;

  var stats = document.querySelector('.stats');
  if (!stats) return;                      // not a scene page — nothing to do

  var nextItem = document.getElementById('sNext');
  var item = document.createElement('div');
  item.id = 'bh';
  item.title = 'Height of the latest Bitcoin block — refreshes every 30s';
  item.innerHTML = '<b id="sBlock">\u2014</b><span>block height</span>';

  // sit with the other stats, just before the hint + Pause button
  if (nextItem && nextItem.parentNode && nextItem.parentNode.parentNode === stats) {
    nextItem.parentNode.insertAdjacentElement('afterend', item);
  } else {
    stats.insertBefore(item, stats.firstChild);
  }

  var el = document.getElementById('sBlock');
  var SOURCES = [
    'https://mempool.space/api/blocks/tip/height',
    'https://blockstream.info/api/blocks/tip/height'
  ];
  var POLL_MS = 30000;

  var style = document.createElement('style');
  style.textContent =
    '#bh b{display:inline-block;transition:color .3s}\n' +
    '#bh.flash b{animation:bh-flash 1.6s ease-out 1}\n' +
    '@keyframes bh-flash{0%{color:var(--accent,#ffd54a);transform:scale(1.18)}100%{color:inherit;transform:none}}';
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
    if (!first) {                       // flash only when the chain advances
      item.classList.remove('flash');
      void item.offsetWidth;            // restart the animation
      item.classList.add('flash');
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
