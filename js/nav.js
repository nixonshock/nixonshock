/**
 * Shared Navigation for nixonshock.com
 * 
 * Usage: <div data-nav="freedom"></div>
 *        <script src="/js/nav.js"></script>
 * 
 * data-nav values: index, learn, books, apps, freedom, bip110
 * 
 * This one file handles: nav rendering, theme toggle, mobile menu.
 * Edit ONE place, updates everywhere.
 */
(function() {
  'use strict';

  // ── Config ───────────────────────────────────────────────────────────
  const LINKS = [
    { id: 'learn',   label: 'Learn',   href: '/learn/' },
    { id: 'books',   label: 'Books',   href: '/books/' },
    { id: 'apps',    label: 'Apps',    href: '/apps/' },
    { id: 'freedom', label: 'Freedom', href: '/freedom/' },
  ];

  // ── Nav HTML ─────────────────────────────────────────────────────────
  function buildNav(activePage) {
    const desktopLinks = LINKS.map(l =>
      `<a href="${l.href}" class="nav-link ${l.id === activePage ? 'nav-active' : ''}" data-page="${l.id}">${l.label}</a>`
    ).join('');

    const mobileLinks = LINKS.map(l =>
      `<a href="${l.href}" class="block text-gray-400 hover:text-bitcoin-orange nav-link ${l.id === activePage ? 'nav-active' : ''}" data-page="${l.id}">${l.label}</a>`
    ).join('');

    return `
<nav class="fixed top-0 left-0 right-0 z-50 bg-bitcoin-dark/90 backdrop-blur-md border-b border-white/5">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16">
      <a href="/" class="flex items-center">
        <img src="/nixonshock_logo.svg" alt="nixonshock" class="h-8">
      </a>
      <div class="hidden md:flex items-center gap-6 text-sm">
        ${desktopLinks}
        <button class="theme-btn" id="theme-btn-desktop" aria-label="Toggle theme">
          <svg id="theme-icon-desktop" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        </button>
      </div>
      <button class="md:hidden text-gray-400 hover:text-white p-2" id="menu-btn">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
      </button>
    </div>
  </div>
  <div id="mobile-menu" class="hidden md:hidden border-t border-white/5 bg-bitcoin-dark/95 backdrop-blur-md">
    <div class="px-4 py-4 space-y-3">
      ${mobileLinks}
      <button class="theme-btn w-full flex items-center justify-center gap-2 text-gray-400 hover:text-bitcoin-orange py-2" id="theme-btn-mobile">
        <svg id="theme-icon-mobile" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        <span id="theme-label" class="text-sm">Light</span>
      </button>
    </div>
  </div>
</nav>`;
  }

  // ── Inject minimal nav CSS ───────────────────────────────────────────
  function injectNavCSS() {
    const style = document.createElement('style');
    style.textContent = `
.theme-btn { cursor: pointer; background: none; border: none; padding: 6px; border-radius: 8px; color: var(--text-dim); transition: all 0.2s; line-height: 1; }
.theme-btn:hover { color: #f7931a; background: rgba(247,147,26,0.1); }
.theme-btn svg { width: 18px; height: 18px; display: block; }
.nav-link { color: #9ca3af; transition: color 0.2s; text-decoration: none; }
.nav-link:hover { color: #f7931a; }
.nav-active { color: #f7931a !important; }
[data-theme="light"] nav a[href="/"] img { filter: invert(1); }
`;
    document.head.appendChild(style);
  }

  // ── Theme ────────────────────────────────────────────────────────────
  const SUN_PATH = 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z';
  const MOON_PATH = 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z';

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    const path = isDark ? SUN_PATH : MOON_PATH;
    document.querySelectorAll('#theme-icon-desktop path, #theme-icon-mobile path').forEach(el => el.setAttribute('d', path));
    const label = document.getElementById('theme-label');
    if (label) label.textContent = isDark ? 'Light' : 'Dark';
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('nixonshock-theme', next);
    applyTheme(next);
  }

  // ── Init ─────────────────────────────────────────────────────────────
  function init() {
    const container = document.querySelector('[data-nav]');
    if (!container) return;

    const activePage = container.getAttribute('data-nav') || '';

    // Inject CSS
    injectNavCSS();

    // Render nav
    container.outerHTML = buildNav(activePage);

    // ── Theme ──
    const saved = localStorage.getItem('nixonshock-theme') || 'dark';
    applyTheme(saved);
    document.addEventListener('click', function(e) {
      if (e.target.closest('#theme-btn-desktop') || e.target.closest('#theme-btn-mobile')) {
        toggleTheme();
      }
    });

    // ── Mobile menu ──
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('#menu-btn');
      if (btn) {
        const menu = document.getElementById('mobile-menu');
        if (menu) menu.classList.toggle('hidden');
      }
    });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
