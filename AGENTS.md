# AGENTS.md — Multi-Agent Workflow Protocol

This file defines how **Hermes** (AI agent on Raspberry Pi) and **OpenCode** (AI coding IDE on Jerry's corporate laptop) collaborate on this repo without overwriting each other's work.

## 👥 Who's Who

| Agent | Platform | Location | Prefix |
|---|---|---|---|
| **You (Jerry)** | OpenCode IDE | Corporate laptop | `opencode/` |
| **Hermes** | Telegram + CLI | Raspberry Pi (always on) | `hermes/` |
| **Shared** | GitHub | Cloud (source of truth) | `main` (protected) |

## 🚫 Golden Rule

**Never push directly to `main`.** All changes go through branches + Pull Requests.

## 🌿 Branch Convention

```
opencode/<feature-name>    ← You work here (laptop)
hermes/<feature-name>      ← Hermes works here (Pi)
main                       ← Only merged via PR (protected)
```

### Examples
- `opencode/add-dark-mode`
- `hermes/fix-api-timeout`
- `opencode/update-layout`
- `hermes/gauge-improvements`

## 🔄 Daily Workflow

### When you (OpenCode) start working:

1. **Pull latest** from GitHub:
   ```
   git checkout main && git pull origin main
   ```

2. **Check for Hermes branches:**
   ```
   git fetch origin
   git branch -r | grep hermes/
   ```
   If any exist, I'm working on something. Check the branch name to see what.

3. **Create your branch:**
   ```
   git checkout -b opencode/<feature-name>
   ```

4. **Work, commit, push, PR, merge.**
   - When you merge to `main`, Vercel auto-deploys 🎉

### When Hermes (me) works:

I follow the same flow using `hermes/` prefix. I **always check GitHub first** for any open `opencode/` branches before starting.

## ⚠️ Avoiding Conflicts

1. **Before starting**, I'll check: what `opencode/` branches exist? What was the last merge?
2. **If we'd touch the same files**, I'll flag it and wait for your direction
3. **Work in different areas** — you focus on frontend/UI, I handle backend/API/config
4. **AGENTS.md is your source of truth** — both agents read this before any action

## 📝 Communication Protocol

| Situation | Action |
|---|---|
| I start a task | Branch `hermes/<task>` created, push happens |
| I finish a task | PR created, you get notified on Telegram |
| You start a task | Branch `opencode/<task>` created (AGENTS.md not needed) |
| Conflict risk | I pause and ask on Telegram |

## 🚀 Vercel Deployment

- **Production branch:** `main`
- Only merged PRs deploy
- Both agents can deploy independently as long as we merge properly

## 🧹 Cleanup

- Delete branches after merge:
  ```
  git branch -d opencode/<feature>
  git push origin --delete opencode/<feature>
  ```
- Hermes auto-cleans `hermes/` branches after merge
