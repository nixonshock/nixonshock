/**
 * Shared Theme Toggle for nixonshock.com
 * 
 * Handles dark/light mode switching with a single sun/moon icon.
 * Load on every page: <script src="/js/nav.js"></script>
 */
(function() {
  'use strict';

  const SUN_PATH = 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z';
  const MOON_PATH = 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z';

  function init() {
    const saved = localStorage.getItem('nixonshock-theme') || 'dark';
    applyTheme(saved);

    // Theme toggle via event delegation
    document.addEventListener('click', function(e) {
      if (e.target.closest('#theme-btn-desktop') || e.target.closest('#theme-btn-mobile')) {
        toggleTheme();
      }
    });

    // Mobile menu toggle
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('#menu-btn');
      if (btn) {
        const menu = document.getElementById('mobile-menu');
        if (menu) menu.classList.toggle('hidden');
      }
    });
  }

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
