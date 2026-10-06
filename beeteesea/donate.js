/* Beeteesea donation receiver client.
 * Adds to any scene:
 *   1. live-invoice donate flow (Ippon)  — pick amount -> BOLT11+QR -> pay
 *   2. full-screen lightning shower      — amount-scaled, capped
 *   3. donation history under the card
 * Picks up donations by polling the Pi backend; every open page fires the
 * shower at the same moment (the site multiplies the impact automatically).
 */
(function () {
  'use strict';

  // API base. Production = Tailscale funnel. Override via localStorage for local testing.
  var BASE = localStorage.getItem('donateApiBase') || 'https://relay.taila67aa4.ts.net/api/donate';
  var LAST_KEY = 'beeteesea_last_donation_id';
  var POLL_MS = 4000;
  var CAP = 650;               // never spawn more bolts than this at once-scale
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

  /* ---------------- rebuild card ---------------- */
  var originalHeader = (function () {
    var h = card.querySelector('.dh'); return h ? h.textContent : '';
  })();
  if (!originalHeader) originalHeader = 'Support this livestream ⚡';

  var amtSel = PRESETS[1]; // default 1,000
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

  var $ = function (s) { return card.querySelector(s.charAt(0) === '#' || s.charAt(0) === '.' ? s : '#' + s); };
  var amtInput = card.querySelector('.dnf-row input');
  var getBtn = $('dnfGet'), invWrap = $('dnfInv'), srcImg = invWrap.querySelector('img'),
      statusEl = $('dnfStatus'), boltEl = $('dnfBolt'), cpyBtn = $('dnfCpy'), backBtn = $('dnfBack'),
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
    if (!items || !items.length) { histList.innerHTML = '<span class="dnf-empty">No donations yet — be the first ⚡</span>'; return; }
    histList.innerHTML = items.slice(0, 12).map(function (d) {
      return '<div class="dnf-hitem"><b>⚡ ' + (d.amount || 0).toLocaleString() + ' sats</b><time>' + esc(ago(d.ts)) + '</time></div>';
    }).join('');
  }
  function refreshHistory() {
    api('history').then(function (res) { if (res && res.history) renderHistory(res.history); });
  }

  /* ---------------- lightning shower ---------------- */
  var cv = null, ctx = null, raf = null, bolts = [], banner = null, flash = null;

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
  function makeBolt(yLo, yHi) {
    var w = window.innerWidth, h = window.innerHeight;
    var sx = Math.random() * w;
    var top = yLo + Math.random() * (yHi - yLo);
    var len = h * (0.55 + Math.random() * 0.5);
    var segs = 9 + Math.floor(Math.random() * 6);
    var pts = []; var x = sx, y = top;
    pts.push([x, y]);
    for (var i = 0; i < segs; i++) {
      x += (Math.random() - 0.5) * 2 * Math.max(6, w * 0.013);
      y += len / segs * (0.75 + Math.random() * 0.5);
      pts.push([x, y]);
    }
    return { pts: pts, vel: h * (0.45 + Math.random() * 0.85), w: w, h: h, born: performance.now(), flick: Math.random() * 6.28 };
  }
  function drawBolt(b, alpha) {
    var p = b.pts;
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,212,80,' + (0.22 * alpha).toFixed(3) + ')';
    ctx.lineWidth = 7; ctx.stroke();                       // glow
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * alpha).toFixed(3) + ')';
    ctx.lineWidth = 1.6; ctx.stroke();                     // hot core
    ctx.beginPath(); ctx.moveTo(p[p.length - 1][0], p[p.length - 1][1] + 2);
    ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1] + hlen(b)); // ground tail
    ctx.strokeStyle = 'rgba(255,212,80,' + (0.16 * alpha).toFixed(3) + ')';
    ctx.lineWidth = 3; ctx.stroke();
  }
  function hlen(b) { return 8 + Math.random() * 14; }

  function fireShower(amount) {
    ensureCanvas();
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    ctx.clearRect(0, 0, cv.width, cv.height);
    var total = Math.min(amount, CAP);
    var scaled = amount > CAP;
    var dur = amount <= 60 ? 0.9 : Math.min(0.8 + amount / 420, 6.5);
    var rate = Math.max(total / Math.max(dur, 0.4), amount <= 60 ? total : 30); // bolts/sec
    var spawned = 0;
    var start = performance.now();
    var bannerText = '⚡ ' + amount.toLocaleString() + ' sats' + (scaled ? ' donated' : '');
    var flashLeft = 2;      // flash pulses at the start
    banner = { text: bannerText, born: start, life: 2600 };
    flash = { end: start + 520, a: 0.9 };

    function frame(now) {
      var dt = Math.min((now - (frame._last || now)) / 1000, 0.05);
      frame._last = now;
      var t = (now - start) / 1000;
      ctx.clearRect(0, 0, cv.width, cv.height);

      // screen flash pulses
      if (flash && now < flash.end) {
        var fa = flash.a * (1 - (now - start) / flash.end);
        ctx.fillStyle = 'rgba(255,214,90,' + fa.toFixed(3) + ')';
        ctx.fillRect(0, 0, cv.width, cv.height);
        if (flashLeft > 1) { ctx.fillStyle = 'rgba(255,214,90,' + (fa * 0.45).toFixed(3) + ')'; ctx.fillRect(0, 0, cv.width, cv.height); }
      }

      // spawn new bolts
      if (spawned < total) {
        var toSpawn = Math.floor(rate * dt);
        var n = Math.min(toSpawn, total - spawned);
        var span = 0.45 + Math.min(n, 80) / 320;          // spread spawn tops
        for (var i = 0; i < n; i++) bolts.push(makeBolt(-0.15 * window.innerHeight, 0.25 * window.innerHeight));
        spawned += n;
      }

      // move + fade bolts
      var keep = [];
      for (var j = 0; j < bolts.length; j++) {
        var b = bolts[j];
        var age = (now - b.born) / 1000;
        var move = b.vel * age;
        var bottom = b.pts[b.pts.length - 1][1] + move;
        if (bottom < -20) continue;                       // not in screen yet
        if (bottom > b.h * 1.35) continue;                // fell fully past screen
        var fadeIn = Math.min(age / 0.06, 1);             // ramp up over a few frames
        var gone = Math.max(0, (bottom - b.h * 1.02) / (b.h * 0.35));  // fade as it reaches the floor
        var alpha = fadeIn * (1 - gone);
        if (alpha > 0.02) {
          ctx.save();
          ctx.translate(0, move);
          ctx.globalAlpha = alpha;
          drawBolt(b, 0.7 + 0.3 * Math.sin(b.flick + now * 0.03));
          ctx.restore();
        }
        keep.push(b);
      }
      bolts = keep;

      // banner
      if (banner && now < banner.born + banner.life) {
        var ba = 1 - Math.max(0, (now - banner.born - banner.life + 700) / 700);
        ctx.font = '700 ' + Math.round(window.innerWidth * 0.035) + 'px "Bricolage Grotesque", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12;
        ctx.fillStyle = 'rgba(255,255,255,' + ba.toFixed(3) + ')';
        ctx.fillText(banner.text, window.innerWidth / 2, window.innerHeight * 0.16);
        ctx.shadowBlur = 0;
      }

      if (t < dur + 2.5 || bolts.length) {            // keep a beat after spawning ends
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
  var recorded = {};
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

  // boot: seed last-id so switching scenes / refresh never replays old donations
  var seenStart = parseInt(localStorage.getItem(LAST_KEY) || '0', 10);
  api('latest').then(function (res) {
    if (res && res.id) {
      if (!seenStart) localStorage.setItem(LAST_KEY, String(res.id));
      refreshHistory();
    }
  });
  setInterval(poll, POLL_MS);
})();