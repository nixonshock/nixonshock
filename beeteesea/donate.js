/* Beeteesea donation receiver client.
 * Adds to any scene:
 *   1. live-invoice donate flow (Ippon)  — pick amount -> BOLT11+QR -> pay
 *   2. full-screen lightning shower      — amount-scaled, capped
 *   3. donation history under the card
 * Picks up donations by polling the Pi backend; every open page fires the
 * shower at the same moment (the site multiplies the impact automatically).
 *
 * REGRESSION GUARD: the live card is only built once the backend answers
 * /health OK. Until then (or if the backend is ever unreachable) the original
 * static markup is left exactly as-is, so the page is never worse than before.
 */
(function () {
  'use strict';

  // API base. Production = Tailscale funnel. Override via localStorage for local testing.
  var BASE = localStorage.getItem('donateApiBase') || 'https://relay.taila67aa4.ts.net/api/donate';
  var LAST_KEY = 'beeteesea_last_donation_id';
  var POLL_MS = 4000;
  var PRESETS = [100, 1000, 10000, 50000];

  var card = document.getElementById('dcard');
  if (!card) return;

  var state = { pending: null }; // {quote, amount}

  /* ---------------- styles ---------------- */
  (function injectCSS() {
    var s = document.createElement('style');
    s.id = 'donate-sheet';
    s.textContent =
      '.dnf{position:fixed;inset:0;width:100%;height:100%;z-index:99999;pointer-events:none;' +
        'background:transparent;display:block;}\n' +
      '.donate .dnf{position:static;padding:0;margin:0;width:0;height:0;}\n' +
      '.dnf-amt{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 8px;}\n' +
      '.dnf-amt button{flex:1;min-width:52px;padding:6px 4px;font-size:12px;font-weight:700;' +
        'border:1px solid var(--line,rgba(127,127,127,.35));border-radius:9px;background:rgba(127,127,127,.06);' +
        'color:var(--fg,#fff);cursor:pointer;transition:background .15s,border-color .15s;}\n' +
      '.dnf-amt button.active{background:var(--accent,#ffd54a);border-color:transparent;color:#1a1a1a;}\n' +
      '.dnf-row{display:flex;gap:6px;align-items:center;margin-bottom:8px;}\n' +
      '.dnf-row input{flex:1;min-width:0;padding:6px 8px;font-size:12px;border:1px solid var(--line,rgba(127,127,127,.35));' +
        'border-radius:9px;background:rgba(127,127,127,.06);color:var(--fg,#fff);font-family:inherit;}\n' +
      '.dnf-get{flex:none;padding:6px 12px;font-size:12px;font-weight:700;border:1px solid var(--line,rgba(127,127,127,.35));' +
        'border-radius:9px;background:var(--accent,#ffd54a);color:#1a1a1a;cursor:pointer;}\n' +
      '.dnf-get:disabled{opacity:.5;cursor:wait;}\n' +
      '.dnf-inv{display:none;flex-direction:column;gap:8px;align-items:center;margin-top:2px;}\n' +
      '.dnf-inv img{width:148px;height:148px;border-radius:12px;background:#fff;padding:8px;border:1px solid var(--line,rgba(127,127,127,.35));}\n' +
      '.dnf-status{font-size:11px;color:var(--muted,#9aa);text-align:center;min-height:14px;}\n' +
      '.dnf-status.paid{color:#3ddc84;font-weight:700;}\n' +
      '.dnf-copy{display:flex;gap:6px;align-items:center;width:100%;}\n' +
      '.dnf-copy code{flex:1;min-width:0;font-family:var(--font-mono,monospace);font-size:10px;color:var(--fg,#fff);' +
        'word-break:break-all;max-height:44px;overflow:hidden;}\n' +
      '.dnf-copy button{flex:none;padding:4px 8px;font-size:11px;border:1px solid var(--line,rgba(127,127,127,.35));' +
        'border-radius:8px;background:rgba(127,127,127,.07);color:var(--fg,#fff);cursor:pointer;}\n' +
      '.dnf-hist{margin-top:10px;border-top:1px solid var(--line,rgba(127,127,127,.18));padding-top:8px;}\n' +
      '.dnf-hlabel{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#9aa);font-weight:700;margin-bottom:6px;}\n' +
      '.dnf-hlist{display:flex;flex-direction:column;gap:4px;max-height:120px;overflow:auto;}\n' +
      '.dnf-hitem{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--fg,#fff);' +
        'background:rgba(127,127,127,.05);border-radius:7px;padding:4px 8px;}\n' +
      '.dnf-hitem b{color:#f8c144;font-variant-numeric:tabular-nums;}\n' +
      '.dnf-hitem time{color:var(--muted,#9aa);font-size:10px;flex:none;}\n' +
      '.dnf-empty{font-size:10.5px;color:var(--muted,#9aa);font-style:italic;}\n' +
      '.dnf-err{font-size:10.5px;color:#ff7b72;text-align:center;}\n';
    document.head.appendChild(s);
  })();

  /* ---------------- helpers ---------------- */
  function api(path, opts) {
    return fetch(BASE.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, ''), opts)
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return null; });
  }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ago(ts) {
    if (!ts) return '';
    var d = Math.max(0, Date.now() / 1000 - ts);
    if (d < 60) return 'just now';
    if (d < 3600) return Math.floor(d / 60) + 'm ago';
    if (d < 86400) return Math.floor(d / 3600) + 'h ago';
    return Math.floor(d / 86400) + 'd ago';
  }

  /* ---------------- card elements (assigned by buildCard) ---------------- */
  var $, amtInput, getBtn, invWrap, srcImg, statusEl, boltEl, cpyBtn, backBtn, histList, amtSel;

  var originalHeader = (function () {
    var h = card.querySelector('.dh'); return h ? h.textContent : '';
  })();
  if (!originalHeader) originalHeader = 'Support this livestream ⚡';

  /* Build the live card. Only called once the backend is confirmed healthy,
   * so the original static markup is left untouched otherwise. */
  function buildCard() {
    amtSel = PRESETS[1]; // default 1,000
    card.innerHTML =
      '<span class="dh">' + esc(originalHeader) + '</span>' +
      '<div class="dnf-amt">' + PRESETS.map(function (p) {
        return '<button type="button" data-p="' + p + '">' +
          (p >= 1000 ? (p / 1000) + 'k' : p) + '</button>';
      }).join('') + '</div>' +
      '<div class="dnf-row">' +
        '<input type="number" min="1" max="1000000" placeholder="Custom (sats)" aria-label="Donation amount in sats">' +
        '<button type="button" class="dnf-get" id="dnfGet">Get invoice</button>' +
      '</div>' +
      '<div class="dnf-inv" id="dnfInv">' +
        '<img alt="Scan to pay" width="148" height="148">' +
        '<div class="dnf-status" id="dnfStatus">Creating invoice…</div>' +
        '<div class="dnf-copy"><code id="dnfBolt"></code><button type="button" id="dnfCpy">Copy</button></div>' +
        '<button type="button" class="btn panel" id="dnfBack">New donation</button>' +
      '</div>' +
      '<div class="dnf-hist" id="dnfHist">' +
        '<div class="dnf-hlabel">Recent donations</div>' +
        '<div class="dnf-hlist" id="dnfHistList"><span class="dnf-empty">Loading…</span></div>' +
      '</div>';

    $ = function (s) { return card.querySelector(s.charAt(0) === '#' || s.charAt(0) === '.' ? s : '#' + s); };
    amtInput = card.querySelector('.dnf-row input');
    getBtn = $('dnfGet'); invWrap = $('dnfInv'); srcImg = invWrap.querySelector('img');
    statusEl = $('dnfStatus'); boltEl = $('dnfBolt'); cpyBtn = $('dnfCpy'); backBtn = $('dnfBack');
    histList = $('dnfHistList');

    card.querySelectorAll('.dnf-amt button').forEach(function (b) {
      b.addEventListener('click', function () {
        card.querySelectorAll('.dnf-amt button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        amtSel = parseInt(b.dataset.p, 10);
        amtInput.value = '';
      });
    });
    amtInput.addEventListener('input', function () { amtSel = parseInt(amtInput.value, 10) || 0; });
    amtInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doInvoice(); });
    getBtn.addEventListener('click', doInvoice);
    backBtn.addEventListener('click', function () { invWrap.style.display = 'none'; state.pending = null; });
    cpyBtn.addEventListener('click', function () {
      var t = boltEl.textContent; if (!t) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(flashCpy);
      } else { flashCpy(); }
    });

    // seed last-id so switching scenes / refresh never replays old donations
    var seenStart = parseInt(localStorage.getItem(LAST_KEY) || '0', 10);
    api('latest').then(function (res) {
      if (res && res.id) {
        if (!seenStart) localStorage.setItem(LAST_KEY, String(res.id));
        refreshHistory();
      }
    });
    setInterval(poll, POLL_MS);
  }

  function flashCpy() { var t = cpyBtn.textContent; cpyBtn.textContent = 'Copied ✓'; setTimeout(function () { cpyBtn.textContent = t; }, 1600); }

  function doInvoice() {
    var amount = amtSel;
    if (isNaN(amount) || amount < 1) { statusEl.textContent = 'Pick an amount'; invWrap.style.display = 'flex'; return; }
    invWrap.style.display = 'flex';
    srcImg.style.visibility = 'hidden';
    boltEl.textContent = '';
    cpyBtn.style.visibility = 'hidden';
    statusEl.textContent = 'Creating invoice…'; statusEl.classList.remove('paid');
    getBtn.disabled = true;
    api('invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.min(amount, 1000000) }) }).then(function (res) {
      getBtn.disabled = false;
      if (!res || !res.bolt11) { statusEl.textContent = 'Could not create invoice — try again.'; return; }
      state.pending = { amount: res.amount };
      srcImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&qzone=2&data=' + encodeURIComponent(res.bolt11);
      srcImg.style.visibility = 'visible';
      boltEl.textContent = res.bolt11;
      cpyBtn.style.visibility = 'visible';
      statusEl.textContent = 'Scan or copy — waiting for payment…';
    });
  }

  /* ---------------- history ---------------- */
  function renderHistory(items) {
    if (!histList) return;
    if (!items || !items.length) { histList.innerHTML = '<span class="dnf-empty">No donations yet — be the first ⚡</span>'; return; }
    histList.innerHTML = items.slice(0, 12).map(function (d) {
      return '<div class="dnf-hitem"><b>⚡ ' + (d.amount || 0).toLocaleString() + ' sats</b><time>' + esc(ago(d.ts)) + '</time></div>';
    }).join('');
  }
  function refreshHistory() {
    api('history').then(function (res) { if (res && res.history) renderHistory(res.history); });
  }

  /* ---------------- lightning rain (Matrix-style bolt columns) ----------------
   * Every donation rains lightning bolts down the screen, and the NUMBER OF RAINS
   * tracks the gift: 1 sat → 1 column, 5 sats → 5 columns, 21 sats → 21 columns
   * (literally one bolt-column per sat, up to one screenful).
   * Past that, the surplus escalates DENSITY + duration instead of column count:
   *   100 sats → every column gets a longer trail;  1k → a heavy storm;
   *   10k+     → a ~6.5s full-width thunderstorm with a bright screen flash.
   * Columns keep dropping top-to-bottom for the duration, so a big gift reads as a
   * storm rather than one wave. Bolt glyphs are pre-rendered sprites (2 variants)
   * and blitted with a fading trail — cheap, and the trail is what reads as "Matrix".
   */
  var cv = null, ctx = null, raf = null, banner = null, flash = null;
  var boltDim = null, boltHot = null;

  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.className = 'dnf';
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.floor(window.innerWidth * dpr);
    cv.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Pre-render two bolt glyphs (hot white head + gold body). Blitting sprites is
  // far cheaper than stroking a path per bolt per frame.
  function buildSprites() {
    function mk(fill, glow, sz) {
      var c = document.createElement('canvas');
      c.width = sz; c.height = Math.round(sz * 1.7);
      var g = c.getContext('2d');
      var P = [[0.56, 0], [0.14, 0.56], [0.45, 0.56], [0.30, 1], [0.86, 0.40], [0.54, 0.40], [0.74, 0]];
      g.beginPath();
      for (var i = 0; i < P.length; i++) {
        var x = P[i][0] * c.width, y = P[i][1] * c.height;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      g.shadowColor = glow; g.shadowBlur = Math.max(4, sz * 0.6);
      g.fillStyle = fill; g.fill(); g.fill();   // double fill deepens the bloom
      g.shadowBlur = 0; g.fill();
      return c;
    }
    boltDim = mk('rgba(255,198,64,0.95)', 'rgba(255,198,64,0.85)', 16);
    boltHot = mk('rgba(255,255,255,1)', 'rgba(255,214,90,1)', 16);
  }

  function fireShower(amount) {
    ensureCanvas();
    if (!boltDim) buildSprites();
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    var W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, cv.width, cv.height);

    amount = Math.max(1, amount | 0);
    var intensity = Math.min(1, Math.log10(amount + 1) / 4);   // 1sat≈.08 .. 10k=1
    var maxCols = Math.max(1, Math.floor(W / 26));
    // Literal mapping for small gifts — 1 sat = 1 rain, 5 sats = 5 rains, 21 = 21 rains.
    // Once the columns fill one screenful, the surplus escalates DENSITY (trail length)
    // + duration instead, so 100 / 1k / 10k keep growing visually.
    var nCols = Math.min(maxCols, Math.max(1, amount));
    var overflow = Math.max(0, amount - nCols);
    var dens = Math.min(1, Math.log10(overflow + 1) / 4.2);    // 0 while amount <= maxCols
    var trail = Math.max(3, Math.min(Math.round(3 + 22 * dens), Math.floor(1300 / nCols)));
    var dur = Math.min(1.1 + amount / 420, 6.5);               // seconds of rain
    var gw = Math.max(18, Math.min(36, (W / nCols) * 0.5));   // glyph width — keep bolts obvious
    var gh = Math.round(gw * 1.6);
    var cell = gh * 0.86;
    var speedMin = H * (0.45 + 0.30 * intensity);
    var speedMax = H * (0.85 + 0.65 * intensity);
    var start = performance.now();
    var endMs = start + dur * 1000;
    var slot = W / nCols;
    var colsArr = [];
    for (var i = 0; i < nCols; i++) {
      colsArr.push({
        x: slot * i + Math.random() * Math.max(0, slot - gw),
        y: -Math.random() * H * 0.8,
        len: Math.max(4, Math.round(trail * (0.7 + Math.random() * 0.6))),
        spd: speedMin + Math.random() * (speedMax - speedMin),
        boost: 0.5 + 0.5 * intensity,
        hot: Math.random() < 0.35,
      });
    }
    var bannerText = '⚡ ' + amount.toLocaleString() + (amount === 1 ? ' sat' : ' sats');
    banner = { text: bannerText, born: start, life: amount >= 1000 ? 3000 : 2200 };
    flash = { end: start + (220 + 640 * intensity), a: 0.30 + 0.55 * intensity };

    function frame(now) {
      var dt = Math.min((now - (frame._last || now)) / 1000, 0.05);
      frame._last = now;
      ctx.clearRect(0, 0, cv.width, cv.height);

      if (flash && now < flash.end) {
        var fa = flash.a * (1 - (now - start) / (flash.end - start));
        ctx.fillStyle = 'rgba(255,214,90,' + fa.toFixed(3) + ')';
        ctx.fillRect(0, 0, cv.width, cv.height);
      }

      var alive = 0;
      for (var ci = 0; ci < colsArr.length; ci++) {
        var c = colsArr[ci];
        c.y += c.spd * dt;
        for (var k = 0; k < c.len; k++) {
          var y = c.y - k * cell;
          if (y < -gh || y > H + gh) continue;
          ctx.globalAlpha = Math.max(0, 1 - k / c.len) * c.boost;
          ctx.drawImage(k === 0 ? (c.hot ? boltHot : boltDim) : boltDim, c.x, y, gw, gh);
        }
        ctx.globalAlpha = 1;
        if (c.y - c.len * cell > H) {                  // column fully past the bottom
          if (now < endMs) { c.y = -Math.random() * H * 0.4; c.len = Math.max(4, Math.round(trail * (0.7 + Math.random() * 0.6))); }
          else continue;
        }
        alive++;
      }

      if (banner && now < banner.born + banner.life) {
        var ba = 1 - Math.max(0, (now - banner.born - banner.life + 700) / 700);
        var isNarrow = W < 640;                      // phones: keep the amount legible
        var fz = Math.round(W * (amount >= 1000 ? 0.05 : 0.04));
        if (isNarrow) fz = Math.max(26, fz);         // never shrink below readability
        ctx.font = '700 ' + fz + 'px "Bricolage Grotesque", system-ui, sans-serif';
        ctx.textAlign = 'center';
        var bx = W / 2, by = H * 0.16;
        // contrast chip so the amount reads over any busy scene (mainly phones)
        if (isNarrow) {
          var tw = ctx.measureText(banner.text).width;
          var r = fz * 0.55, x0 = bx - tw / 2 - r, y0 = by - fz * 0.92 - r;
          var wpx = tw + r * 2, hpx = fz * 1.15 + r;
          ctx.fillStyle = 'rgba(0,0,0,' + (0.55 * ba).toFixed(2) + ')';
          ctx.beginPath();
          ctx.moveTo(x0 + r, y0);
          ctx.arcTo(x0 + wpx, y0, x0 + wpx, y0 + hpx, r);
          ctx.arcTo(x0 + wpx, y0 + hpx, x0, y0 + hpx, r);
          ctx.arcTo(x0, y0 + hpx, x0, y0, r);
          ctx.arcTo(x0, y0, x0 + wpx, y0, r);
          ctx.closePath();
          ctx.fill();
        }
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12;
        ctx.fillStyle = 'rgba(255,255,255,' + ba.toFixed(3) + ')';
        ctx.fillText(banner.text, bx, by);
        ctx.shadowBlur = 0;
      }

      if (alive > 0 || now < endMs + 1500) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, cv.width, cv.height);
        raf = null; banner = null; flash = null;
        if (state.pending) {
          statusEl.textContent = '✅ Payment received — thank you!';
          statusEl.classList.add('paid');
          state.pending = null;
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- poller ---------------- */
  function poll() {
    api('latest').then(function (res) {
      if (!res || !res.id) return;
      var last = parseInt(localStorage.getItem(LAST_KEY) || '0', 10);
      if (res.id > last) {
        localStorage.setItem(LAST_KEY, String(res.id));
        if (window.BEETEESEA_NO_SOUND !== true) {
          try { playThunder(res.amount); } catch (e) {}
        }
        fireShower(res.amount || 0);
        refreshHistory();
      }
    });
  }
  function playThunder(amount) {
    // tiny "crack" pop so the impact is felt, not just seen
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctxh = state._ac || (state._ac = new AC());
    if (ctxh.state === 'suspended') ctxh.resume();
    var t = ctxh.currentTime, o = ctxh.createOscillator(), g = ctxh.createGain();
    o.connect(g); g.connect(ctxh.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(160 + Math.random() * 40, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.28);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.min(0.25, 0.08 + amount / 20000), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.start(t); o.stop(t + 0.32);
  }

  /* ---------------- boot ----------------
   * Only upgrade the card once the backend answers /health OK. If it is not
   * reachable (or the site is deployed ahead of the backend), the original
   * static markup stays in place and we retry quietly — zero regression. */
  function boot() {
    api('health').then(function (res) {
      if (res && res.status === 'ok') { buildCard(); }
      else { setTimeout(boot, 20000); }
    });
  }
  boot();
})();
