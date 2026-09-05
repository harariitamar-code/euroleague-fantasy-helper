---
name: run-euroleague-fantasy-helper
description: Build, run, and drive the Euroleague Fantasy Helper Next.js app. Use when asked to start/run the app, take a screenshot of it, view the players page, test search, or confirm a change works in the running app.
---

Next.js 16 (Turbopack) app. There is no `chromium-cli` in this
container, so the driver is a small Playwright script:
`.claude/skills/run-euroleague-fantasy-helper/driver.mjs`. Start the
dev server, then run the driver against it.

**Important — this is a remote cloud container.** `localhost:3000`
here is only reachable inside this container. There is no
port-forwarding to the user's own browser and no way to show the live
server in the Claude desktop/web side panel — that panel only renders
static published Artifacts, not a proxy into a running server. The
correct way to "show the user the app running" is: launch it here,
drive it with this script, and share the resulting screenshots (e.g.
via the file-send tool). Don't try to expose the port or claim you
can — say so up front if asked, and offer the screenshot flow instead.

All paths below are relative to the repo root.

## Setup

```bash
npm install
```

The driver has its own tiny `package.json` (just `playwright-core`) so
it doesn't touch the app's own dependency tree:

```bash
cd .claude/skills/run-euroleague-fantasy-helper
npm install
cd -
```

Chromium is already present in this container at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` — don't run
`playwright install`, it's not needed and may try to re-download.

## Run (agent path)

Start the dev server in the background and wait for it to actually
serve, then drive it:

```bash
npm run dev > /tmp/next-dev.log 2>&1 &
timeout 30 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'

node .claude/skills/run-euroleague-fantasy-helper/driver.mjs home
node .claude/skills/run-euroleague-fantasy-helper/driver.mjs players
node .claude/skills/run-euroleague-fantasy-helper/driver.mjs search Alberto
node .claude/skills/run-euroleague-fantasy-helper/driver.mjs click-view-players
```

Screenshots land in
`.claude/skills/run-euroleague-fantasy-helper/screenshots/`. **Look at
them** — a blank frame or an error page means it didn't actually
render.

| command | what it does |
|---|---|
| `home` | screenshot the landing page (`/`) |
| `players` | screenshot the merged players table (`/players`) |
| `search <query>` | type `<query>` into the players search box, screenshot the filtered result |
| `click-view-players` | full nav flow: load `/`, click the "View players" link, confirm the URL changed, screenshot |

To stop the dev server: `fuser -k 3000/tcp` (`lsof -ti:3000` returns
nothing in this container even while something is listening — don't
rely on it; and don't `pkill -f next`, too broad, risks killing
unrelated things in the same container).

## Run (human path)

```bash
npm run dev
```

Opens on `http://localhost:3000` — but only inside this container.
Useless for a human unless they're actually working in this exact
container's terminal. A user who wants to browse it themselves needs
to `git clone`/`checkout` the branch and run this on their own
machine.

## Gotchas

- **Run `npm run dev` from the repo root, not from inside this skill
  directory.** This skill directory has its own `package.json` (for
  `playwright-core` only, no `dev` script) — running `npm run dev`
  while `cd`'d in here fails with `Missing script: "dev"`. If a
  previous `cd` in the same shell left you here, `cd` back to the
  repo root first.
- **No `chromium-cli` in this container** — had to install
  `playwright-core` (not full `playwright`, to skip the browser
  download) and point `executablePath` at the pre-installed Chromium
  binary under `/opt/pw-browsers/`. Regular `chromium.launch()` with
  no `executablePath` fails because Playwright's own bundled browsers
  aren't downloaded here (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set
  globally in this environment).
- **`page.click("text=View players")` doesn't navigate** — matched the
  link text but the plain `text=` selector plus a bare `.click()` can
  race the Next.js client hydration/navigation. Use
  `a:has-text('View players')` and wrap the click with
  `Promise.all([page.waitForURL(...), page.click(...)])`.
- **`fullPage: true` screenshots of `/players` are enormous** (the
  merged player list is ~19,000px tall) and unreadable at a glance —
  the driver intentionally takes a viewport-only screenshot (no
  `fullPage`) so the header/search/first rows are actually legible.
- **`AGENTS.md`/`CLAUDE.md` in this repo point at
  `node_modules/next/dist/docs/`** for framework-specific behavior —
  irrelevant to *running* the app (nothing here required reading
  those docs), only relevant if you're about to write new Next.js
  code.

## Troubleshooting

- **`page.goto` hangs / times out**: the dev server isn't up yet.
  Confirm with `curl -sf http://localhost:3000` before running the
  driver — Turbopack is fast (`✓ Ready in ~400ms` in this repo) but a
  fixed `sleep` is still the wrong tool; poll instead.
- **Port already in use / `EADDRINUSE` on `npm run dev`**: a previous
  session's server is still running. `fuser -k 3000/tcp` to kill it,
  then retry.
