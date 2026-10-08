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
  var POLL_MS = 3000;
  var PRESETS = [100, 1000, 10000, 50000];
  var CATCHUP_S = 12;          // replay a donation younger than this on first contact

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
      '.dnf-lnurl{display:flex;flex-direction:column;align-items:center;gap:6px;padding:9px;' +
        'border:1px dashed rgba(127,127,127,.35);border-radius:11px;margin:2px 0 8px;}\n' +
      '.dnf-lnurl .dnf-ln-cap{font-size:10px;letter-spacing:.12em;text-transform:uppercase;' +
        'color:var(--muted,#9aa);font-weight:700;text-align:center;}\n' +
      '.dnf-lnurl .dnf-ln-qr{width:128px;height:128px;border-radius:9px;background:#fff;padding:6px;border:1px solid var(--line,rgba(127,127,127,.35));}\n' +
      '.dnf-lnurl .dnf-ln-copy{display:flex;gap:6px;align-items:center;max-width:100%;}\n' +
      '.dnf-lnurl .dnf-ln-copy code{font-size:9px;color:var(--fg,#fff);word-break:break-all;opacity:.7;}\n' +
      '.dnf-lnurl .dnf-ln-copy button{font-size:10px;padding:2px 8px;flex:none;}\n' +
      '.dnf-lnurl .dnf-ln-url{display:flex;gap:6px;align-items:center;max-width:100%;}\n' +
      '.dnf-lnurl .dnf-ln-url code{font-size:10px;color:var(--accent,#ffd54a);white-space:nowrap;font-weight:700;}\n' +
      '.dnf-lnurl .dnf-ln-url button{font-size:10px;padding:2px 8px;flex:none;}\n' +
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
      '.dnf-inv img{width:min(100%,260px);height:auto;aspect-ratio:1/1;border-radius:12px;background:#fff;padding:8px;border:1px solid var(--line,rgba(127,127,127,.35));}\n' +
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
      '.dnf-hitem{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--fg,#fff);' +
        'background:rgba(127,127,127,.05);border-radius:7px;padding:4px 8px;}\n' +
      '.dnf-hrow{display:flex;justify-content:space-between;gap:8px;}\n' +
      '.dnf-hitem b{color:#f8c144;font-variant-numeric:tabular-nums;}\n' +
      '.dnf-hitem time{color:var(--muted,#9aa);font-size:10px;flex:none;}\n' +
      '.dnf-hmsg{font-size:10.5px;color:var(--muted,#9aa);line-height:1.35;padding-left:1px;}\n' +
      '.dnf-empty{font-size:10.5px;color:var(--muted,#9aa);font-style:italic;}\n' +
      '.dnf-err{font-size:10.5px;color:#ff7b72;text-align:center;}\n' +
      '.mwrap{position:relative;display:inline-block;}\n' +
      '.music{position:absolute;right:0;top:calc(100% + 10px);width:200px;max-width:calc(100vw - 20px);z-index:90;display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:14px;}\n' +
      '.music[hidden]{display:none;}\n' +
      '.music .mtitle{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#9aa);font-weight:700;}\n' +
      '.music .mchk{display:flex;gap:8px;align-items:center;}\n' +
      '.music .mchk .btn{flex:1;padding:6px 8px;font-size:12px;}\n' +
      '.music .mstat{font-size:10.5px;color:var(--muted,#9aa);min-height:14px;text-align:center;}\n' +
      '.music .mvol{display:flex;gap:8px;align-items:center;}\n' +
      '.music .mvol input{flex:1;accent-color:var(--accent,#ffd54a);}\n' +
      '.music .mvol span{font-size:10px;color:var(--muted,#9aa);min-width:26px;text-align:right;}\n' +
      '@media(max-width:760px){.music{position:fixed;left:50%;right:auto;top:150px;transform:translateX(-50%);width:min(280px,calc(100vw - 20px));}}\n';
    document.head.appendChild(s);
  })();

  initMusic();

  /* ---------------- helpers ---------------- */
  function api(path, opts) {
    var url = BASE.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
    var o = opts || {};
    if (!o.method || o.method === 'GET') {
      // No caching, ever: a cached /latest freezes a viewer's donation id and the
      // rain silently stops for them. no-store + a unique query defeats browser
      // HTTP cache and any intermediary proxy alike.
      o = Object.assign({}, o, { cache: 'no-store' });
      url += (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now();
    }
    return fetch(url, o)
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

  // Self-hosted LNURL-Pay target: scanning this QR in a wallet opens a message
  // box (commentAllowed:256) and the donor's comment reaches OUR backend (not a
  // third-party host that drops it). Bech32 of https://relay.taila67aa4.ts.net/api/donate/lnurl
  var LNURL_BECH32 = 'lnurl1dp68gurn8ghj7un9d3shjtn5v95kccfkxaskzdpww3ejumn9wshkzurf9ajx7mnpw3jj7mrww4excycpzv5';
  var LNURL_LIGHTNING = 'lightning:' + LNURL_BECH32;
  var LNURL_ADDR = 'donate@www.nixonshock.com';   // typed address resolves to OUR backend

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
      '<div class="dnf-lnurl">' +
        '<div class="dnf-ln-cap">Scan with your wallet — attach a message</div>' +
        '<img class="dnf-ln-qr" alt="Scan to pay — message supported" src="https://api.qrserver.com/v1/create-qr-code/?size=360x360&qzone=4&data=' + encodeURIComponent(LNURL_LIGHTNING) + '">' +
        '<div class="dnf-ln-copy"><code>' + LNURL_BECH32 + '</code><button type="button" class="btn panel" id="dnfLnCpy">Copy</button></div>' +
        '<div class="dnf-ln-url"><code>' + LNURL_ADDR + '</code><button type="button" class="btn panel" id="dnfAddrCpy">Copy</button></div>' +
      '</div>' +
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
    var lnCpy = $('dnfLnCpy');
    if (lnCpy) lnCpy.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(LNURL_LIGHTNING).then(flashCpy);
      } else { flashCpy(); }
    });
    var addrCpy = $('dnfAddrCpy');
    if (addrCpy) addrCpy.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(LNURL_ADDR).then(flashCpy);
      } else { flashCpy(); }
    });

    // History only. The donation watcher is started once at init, independent of
    // this health gate, so the rain keeps working even if the card cannot be built.
    refreshHistory();
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
      srcImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=480x480&qzone=4&data=' + encodeURIComponent(res.bolt11);
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
      var row = '<span class="dnf-hrow"><b>⚡ ' + (d.amount || 0).toLocaleString() + ' sats</b><time>' + esc(ago(d.ts)) + '</time></span>';
      var msg = d.message ? '<div class="dnf-hmsg">' + esc(d.message) + '</div>' : '';
      return '<div class="dnf-hitem">' + row + msg + '</div>';
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
    cv.style.display = 'none';               // never show a stale/idle canvas
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

  function fireShower(amount, message) {
    ensureCanvas();
    cv.style.display = 'block';              // visible only while it's actually raining
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
    banner = { text: bannerText, message: (message || '').trim().slice(0, 140) || null, born: start, life: amount >= 1000 ? 3000 : 2600 };
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
        if (banner.message) {
          var mfz = Math.max(16, Math.round(fz * 0.58));
          ctx.font = '600 ' + mfz + 'px "Bricolage Grotesque", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowBlur = 12;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.94 * ba).toFixed(3) + ')';
          ctx.fillText('\u201c' + banner.message + '\u201d', bx, by + fz * 1.12);
          ctx.shadowBlur = 0;
        }
      }

      if (alive > 0 || now < endMs + 1500) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, cv.width, cv.height);
        cv.style.display = 'none';           // fully hide once the rain is over
        raf = null; banner = null; flash = null;
        if (state.pending && statusEl) {
          statusEl.textContent = '✅ Payment received — thank you!';
          statusEl.classList.add('paid');
          state.pending = null;
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- donation watcher ----------------
   * Reliability rules, learned the hard way:
   *  - The "last seen donation" lives in THIS PAGE's memory, never localStorage.
   *    localStorage is shared by every tab and every scene on this origin, so a
   *    shared id meant only the FIRST tab to poll consumed the donation and every
   *    other open screen stayed dry. Per-page state = every screen rains.
   *  - The watcher starts at module init, NOT behind the /health gate, so a backend
   *    restart or a flaky health check can never switch the rain off.
   *  - Poll immediately (not after the first interval), re-poll on tab focus to
   *    defeat background-timer throttling, and never let anything cache /latest.
   *  - On first contact, replay a donation that is only a few seconds old, so a
   *    screen opened slightly late still shows the impact.
   */
  var lastId = -1;                       // -1 = not yet seeded

  function rain(amount, message) {
    if (window.BEETEESEA_NO_SOUND !== true) { try { playThunder(amount); } catch (e) {} }
    fireShower(amount, message);
    refreshHistory();
  }

  function pollOnce() {
    api('latest').then(function (res) {
      if (!res || typeof res.id !== 'number') return;   // transient: retry next tick
      if (lastId < 0) {
        lastId = res.id;                                // baseline — a stale id never fires
        if (res.id > 0 && res.ts) {
          var age = Math.floor(Date.now() / 1000 - res.ts);   // tolerant of float ts
          if (age >= 0 && age <= CATCHUP_S) rain(res.amount || 0, res.message);
        }
        return;
      }
      if (res.id > lastId) {
        lastId = res.id;
        rain(res.amount || 0, res.message);
      }
    });
  }

  function startWatcher() {
    pollOnce();
    setInterval(pollOnce, POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) pollOnce();                 // catch up after throttling
    });
  }
  function playThunder(amount) {
    // "Received!" chime — a bright coin-stack ding that climbs a touch with the
    // tip size, plus a soft low thump so the impact is felt.
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctxh = state._ac || (state._ac = new AC());
    if (ctxh.state === 'suspended') { try { ctxh.resume(); } catch (e) {} }
    var t = ctxh.currentTime;
    var step = Math.min(Math.round(amount / 200), 7);
    var base = 523.25 * Math.pow(2, step / 12);        // C5 and up (richer for big tips)
    [[1, .18], [1.2599, .14], [2, .05]].forEach(function (n, i) {
      var o = ctxh.createOscillator(), g = ctxh.createGain();
      o.type = 'sine'; o.frequency.value = base * n[0];
      o.connect(g); g.connect(ctxh.destination);
      var st = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(n[1], st + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
      o.start(st); o.stop(st + 0.55);
    });
    var o = ctxh.createOscillator(), g = ctxh.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
    o.connect(g); g.connect(ctxh.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.start(t); o.stop(t + 0.3);
  }

  /* Warm the web-audio context on the first user gesture. The donation chime
   * fires from polling (not a click), so without this autoplay policy may leave
   * the context suspended and the sound silent. A single click/tap/key is enough. */
  function warmAudio() {
    if (state._ac) { if (state._ac.state === 'suspended') state._ac.resume().catch(function () {}); return; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    var c = new AC(); state._ac = c; c.resume().catch(function () {});
  }
  document.addEventListener('pointerdown', warmAudio, { once: true });
  document.addEventListener('keydown', warmAudio, { once: true });

  /* ---------------- music ---------------- */
  /* Looping background track. Default is unmuted + stopped — nothing plays
   * until they hit Play (no autoplay, so no browser policy fight), but Play
   * itself is audible right away; a remembered mute is cleared by Play too.
   * preload='none' so the file isn't downloaded (or kept in memory) until
   * it's actually used. Independent of the donate card and the rain: it loops
   * underneath and coexists with the shower's WebAudio crack. */
  function initMusic() {
    var top = document.querySelector('.top .controls');
    if (!top || top.querySelector('#mbtn')) return;
    var w = document.createElement('span');
    w.className = 'mwrap';
    w.innerHTML =
      '<button id="mbtn" class="btn panel" type="button" aria-label="Music" title="Background music">♪ Music</button>' +
      '<div class="music panel" id="mpanel" hidden>' +
        '<span class="mtitle">Background music</span>' +
        '<div class="mchk">' +
          '<button type="button" class="btn panel" id="mpp">Play</button>' +
          '<button type="button" class="btn panel" id="mmute">Mute</button>' +
        '</div>' +
        '<div class="mstat" id="mstat">Stopped</div>' +
        '<div class="mvol"><input id="mvol" type="range" min="0" max="100" step="1" aria-label="Music volume"><span id="mvolv">60%</span></div>' +
      '</div>';
    top.insertBefore(w, top.firstChild);

    var btn = w.querySelector('#mbtn'), panel = w.querySelector('#mpanel'),
        pp = w.querySelector('#mpp'), mute = w.querySelector('#mmute'),
        mstat = w.querySelector('#mstat'), rng = w.querySelector('#mvol'),
        rv = w.querySelector('#mvolv');

    var prefs = { vol: 60, muted: false };
    try {
      var s = localStorage.getItem('beeteesea_music');
      if (s) { var p = JSON.parse(s);
        if (typeof p.vol === 'number') prefs.vol = Math.max(0, Math.min(100, p.vol));
        if (typeof p.muted === 'boolean') prefs.muted = p.muted; }
    } catch (e) {}

    var aud = new Audio('/beeteesea/music.mp3');
    aud.loop = true; aud.preload = 'none'; aud.volume = prefs.vol / 100; aud.muted = prefs.muted;

    function save() {
      try { localStorage.setItem('beeteesea_music', JSON.stringify({ vol: prefs.vol, muted: prefs.muted })); } catch (e) {}
    }
    function refresh() {
      mstat.textContent = aud.paused ? 'Stopped' : (aud.muted ? 'Playing · muted' : 'Playing');
      pp.textContent = aud.paused ? 'Play' : 'Pause';
      mute.textContent = aud.muted ? 'Unmute' : 'Mute';
      rng.value = prefs.vol; rv.textContent = prefs.vol + '%';
      btn.classList.toggle('on', !aud.paused && !aud.muted);
    }
    /* The popover hangs under the Music button; pin it to the viewport and clamp
     * it so it can never run off an edge (the controls row wraps on narrower
     * windows, which used to shove it past the left side of the screen). */
    function place() {
      if (window.innerWidth <= 760) {   // CSS centres it on phones
        panel.style.position = panel.style.left = panel.style.top = panel.style.right = '';
        return;
      }
      panel.style.position = 'fixed'; panel.style.right = 'auto';
      var r = btn.getBoundingClientRect(), m = 10,
          pw = panel.offsetWidth || 200, ph = panel.offsetHeight || 0,
          left = Math.min(Math.max(m, r.right - pw), Math.max(m, window.innerWidth - pw - m)),
          top = Math.min(r.bottom + 10, Math.max(m, window.innerHeight - ph - m));
      panel.style.left = Math.round(left) + 'px';
      panel.style.top = Math.round(top) + 'px';
    }
    function togglePlay() {
      if (aud.paused) {
        if (prefs.muted) { prefs.muted = false; aud.muted = false; } // pressing Play should be audible
        var pv = aud.play();
        if (pv && pv.catch) pv.catch(function () { mstat.textContent = 'Tap play from the control'; });
      } else { aud.pause(); }
      save(); refresh();
    }

    btn.addEventListener('click', function (e) { e.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) place(); });
    pp.addEventListener('click', function (e) { e.stopPropagation(); togglePlay(); });
    mute.addEventListener('click', function (e) { e.stopPropagation(); prefs.muted = !prefs.muted; aud.muted = prefs.muted; save(); refresh(); });
    rng.addEventListener('input', function () { prefs.vol = parseInt(rng.value, 10) || 0; aud.volume = prefs.vol / 100; save(); rv.textContent = prefs.vol + '%'; });
    document.addEventListener('click', function (e) { if (!panel.hidden && !e.target.closest('.mwrap')) panel.hidden = true; });
    window.addEventListener('resize', function () { if (!panel.hidden) place(); });
    window.addEventListener('scroll', function () { if (!panel.hidden) place(); }, { passive: true });
    refresh();
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
  startWatcher();   // always on: the rain must not depend on the card building
  boot();
})();
