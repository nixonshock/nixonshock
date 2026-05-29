# nixonshock.com

**The Biggest Default in Human History — Bitcoin is the Fix.**

A comprehensive Bitcoin education hub that tells the story of the 1971 Nixon Shock and why Bitcoin is the solution to the broken fiat system.

## Site Structure

```
/
├── index.html       → Landing: The Nixon Shock → Bitcoin story
├── vercel.json      → Vercel deployment config
├── bip110/         → BIP110 educational page (countdown, chart, analysis)
├── learn/          → Bitcoin education hub (coming soon)
├── books/          → Affiliate book recommendations
├── wallets/        → Hardware wallet affiliate links
├── apps/           → Bitcoin app recommendations
└── daily/          → Daily brief: Bitcoin, macro, geopolitics, ME tracker
```

## Tech Stack

- Static HTML + Tailwind CSS (CDN)
- JetBrains Mono + Inter fonts
- Deployed on Vercel

## Development

```bash
# Serve locally
python3 -m http.server 8000
# Open http://localhost:8000
```

## Deploy

Push to `main` branch. Vercel auto-deploys.

## License

MIT
