#!/usr/bin/env python3
"""
sync-nav.py — Inline nav sync from one source file to all pages.

Usage:
  python sync-nav.py

This replaces <!--NAV--> markers in each page with the nav from nav.html,
setting the active link highlight for the correct page.
Edit nav.html, run this script, commit all pages.
No JS delay, no flash, one source of truth.
"""

import re
import os

# Root of the site
ROOT = os.path.dirname(os.path.abspath(__file__))

# Pages to update with their active link identifier
PAGES = {
    'index.html': 'index',
    'learn/index.html': 'learn',
    'books/index.html': 'books',
    'apps/index.html': 'apps',
    'bip110/index.html': 'bip110',
    'freedom/index.html': 'freedom',
}

# Which pages get the bitcoin-orange highlight
# If a page isn't in this map, no link gets highlighted
ACTIVE_MAP = {
    'index': None,      # no nav link for index/home
    'learn': 'learn',
    'books': 'books',
    'apps': 'apps',
    'bip110': 'bip110',
    'freedom': 'freedom',
}

def build_nav_html(active_id):
    """Read nav.html and set the active link highlight."""
    nav_path = os.path.join(ROOT, 'nav.html')
    with open(nav_path, 'r') as f:
        content = f.read()

    # Define all possible page IDs
    all_pages = ['index', 'learn', 'books', 'apps', 'freedom', 'bip110']

    for pid in all_pages:
        marker = f'__ACTIVE__{pid}'
        if pid == active_id:
            content = content.replace(marker, 'text-bitcoin-orange')
        else:
            # Remove the marker entirely (leaves just the class attribute clean)
            content = content.replace(marker, '')

    # Clean up any double spaces left from removals
    content = re.sub(r'  +', ' ', content)
    content = re.sub(r'"  ', '" ', content)
    content = re.sub(r'  ="', ' ="', content)

    return content


def update_page(page_path, active_id):
    """Replace <!--NAV--> in a page with the generated nav."""
    full_path = os.path.join(ROOT, page_path)
    if not os.path.exists(full_path):
        print(f'  SKIP {page_path} (not found)')
        return False

    with open(full_path, 'r') as f:
        content = f.read()

    if '<!--NAV-->' not in content:
        print(f'  SKIP {page_path} (no <!--NAV--> marker)')
        return False

    nav_html = build_nav_html(active_id)

    # Increase the pt-16 padding on the first section after nav
    # (the nav is fixed, so content below needs top padding)
    content = content.replace('<!--NAV-->', nav_html)

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
