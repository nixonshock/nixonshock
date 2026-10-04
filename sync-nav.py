#!/usr/bin/env python3
"""
sync-nav.py — Inline nav sync from one source file to all pages.

Usage:
  python sync-nav.py

This:
1. Replaces <!--NAV--> markers with the nav from nav.html (active link highlighted)
2. Injects critical CSS + theme init into <head> so the nav looks right before Tailwind loads
3. No JS delay, no flash, one source of truth

Edit nav.html, run this script, commit all pages.
"""

import re
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

PAGES = {
    'index.html': 'index',
    'learn/index.html': 'learn',
    'books/index.html': 'books',
    'apps/index.html': 'apps',
    'bip110/index.html': 'bip110',
    'freedom/index.html': 'freedom',
}

ACTIVE_MAP = {
    'index': None,
    'learn': 'learn',
    'books': 'books',
    'apps': 'apps',
    'bip110': 'bip110',
    'freedom': 'freedom',
}

CRITICAL_HEAD = """\
<!-- critical: nav styles + theme init (loads before Tailwind) -->
<style>
/* Nav critical — works before Tailwind CDN arrives */
nav.fixed { position: fixed; top: 0; left: 0; right: 0; z-index: 50; background: rgba(9,9,15,0.9); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.05); }
.theme-btn { cursor: pointer; background: none; border: none; padding: 6px; border-radius: 8px; color: var(--text-dim); transition: all 0.2s; line-height: 1; }
.theme-btn:hover { color: #f7931a; background: rgba(247,147,26,0.1); }
.theme-btn svg { width: 18px; height: 18px; display: block; }
[data-theme="light"] nav a[href="/"] img { filter: invert(1); }
</style>
<script>try{var t=localStorage.getItem('nixonshock-theme')||'dark';document.documentElement.setAttribute('data-theme',t);var m={dark:'Light',light:'Dark'};document.body&&document.body.setAttribute('data-theme-ready','1')}catch(e){}</script>"""


def build_nav_html(active_id):
    """Read nav.html and set the active link highlight."""
    nav_path = os.path.join(ROOT, 'nav.html')
    with open(nav_path, 'r') as f:
        content = f.read()

    all_pages = ['index', 'learn', 'books', 'apps', 'btsea', 'freedom', 'bip110']

    for pid in all_pages:
        marker = f'__ACTIVE__{pid}'
        if pid == active_id:
            content = content.replace(marker, 'text-bitcoin-orange')
        else:
            content = content.replace(marker, '')

    content = re.sub(r'  +', ' ', content)
    content = re.sub(r'"  ', '" ', content)
    content = re.sub(r'  ="', ' ="', content)

    return content


def inject_critical_before_head_end(content):
    """Insert critical CSS + theme init just before </head>."""
    critical = CRITICAL_HEAD
    # Remove old critical block if exists
    content = re.sub(r'\n<!-- critical: nav styles.*?</script>', '', content, flags=re.DOTALL)
    # Insert before </head>
    content = content.replace('</head>', f'{critical}\n</head>')
    return content


def update_page(page_path, active_id):
    """Update a single page."""
    full_path = os.path.join(ROOT, page_path)
    if not os.path.exists(full_path):
        print(f'  SKIP {page_path} (not found)')
        return False

    with open(full_path, 'r') as f:
        content = f.read()

    # 1. Replace <!--NAV--> with nav HTML
    if '<!--NAV-->' in content:
        nav_html = build_nav_html(active_id)
        content = content.replace('<!--NAV-->', nav_html)
    else:
        print(f'  WARN {page_path} (no <!--NAV--> marker, skipping nav)')

    # 2. Inject critical CSS + theme init
    content = inject_critical_before_head_end(content)

    with open(full_path, 'w') as f:
        f.write(content)

    print(f'  UPDATED {page_path} (active: {active_id or "none"})')
    return True


def main():
    print('Syncing nav from nav.html to all pages...')
    updated = 0
    skipped = 0

    for rel_path, active_id in PAGES.items():
        if update_page(rel_path, active_id):
            updated += 1
        else:
            skipped += 1

    print(f'Done: {updated} updated, {skipped} skipped.')


if __name__ == '__main__':
    main()
