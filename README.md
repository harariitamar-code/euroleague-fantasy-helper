# Euroleague Fantasy Helper — "Courtside Ledger"

A helper app for building the best possible team in both:

- the official **Euroleague Fantasy Challenge**, and
- **Sport5 Euroleague Fantasy**

**Live at:** https://euroleague-fantasy-helper.vercel.app — deployed on
Vercel, auto-redeploying from the `main` branch on every push. This is a
personal project: development happens directly on `main`, no PR workflow.

## Data model

- `data/players.json` — canonical, game-agnostic player identities (name, Hebrew
  name when known, team, jersey number). Shared between both leagues.
- `data/euroleague-fantasy/prices.json` — current prices/positions/stats for the
  official Euroleague Fantasy Challenge.
- `data/sport5-fantasy/prices.json` — current prices/positions/stats for Sport5
  Euroleague Fantasy.
- `data/<league>/history/YYYY-MM-DD.json` — a dated snapshot saved on every
  import, so price history can be tracked over time.
- `data/teams.json` — the 20 Euroleague clubs, with each club's id in both
  fantasy games' own APIs. Used to line up identity across leagues.
- `data/player-aliases.json` — manual overrides for the rare case automatic
  cross-league matching gets wrong (see below).

See `src/lib/data/types.ts` for the exact shapes.

## Importing/updating player data

Run this any time you have new data — it's safe to re-run:

```bash
npm run import -- --league euroleague --file ./incoming/euroleague.json
npm run import -- --league sport5 --file ./incoming/sport5.json
```

**Import the official Euroleague file first** when you have both — it gives
clean English names, which the Sport5 import (Hebrew names) then matches
against.

Three input shapes are supported:

1. **Official Euroleague Fantasy API JSON** — the raw response from the
   official app/site (an array of players with a `quotation` field).
2. **Sport5 Fantasy API JSON** — the raw response from the Sport5 app/site
   (an array of teams, each with a `players` array; names in Hebrew).
3. **Generic CSV/XLSX** — any spreadsheet export with loosely-named columns.
   Recognized header aliases (case/spacing insensitive):

   | Field | Recognized headers |
   |---|---|
   | name | name, player, player name, full name |
   | team | team, club |
   | position | position, pos, role |
   | price | price, value, credits, cost, salary |
   | totalPoints | points, total points, pts |
   | avgPoints | avg, average, ppg |
   | ownershipPct | ownership, owned, selected |
   | status | status, fitness, injury |
   | nationality | nationality, nation, country |

For the two JSON shapes, the importer matches the same person across
leagues by **(team, shirt number)** using `data/teams.json`, since Sport5
names are in Hebrew and the official feed uses English. Every import prints
a summary: new players added, players matched/updated (and how many were
newly linked across leagues), and any price changes since the last import
for that league.

### Known limitation: cross-league matching isn't 100% certain

Team+shirt-number matching is a heuristic, not a guarantee — jersey numbers
occasionally differ between the two sources (transfers, number changes, or
one feed being briefly stale), which can attach the wrong Sport5 entry to an
official-feed player. If you spot a player showing an unrelated Hebrew name
or price, fix it with `data/player-aliases.json`:

```json
{
  "aliases": {
    "sport5:4042": "the-correct-canonical-player-id"
  }
}
```

The key is `<league>:<sourceId>` (the source's own player id, visible in
`sourceId` on that league's `prices.json` entry); the value is the canonical
player id it should map to instead. Re-run the import afterwards.

## Running the app

```bash
npm install
npm run dev
```

Then open `/players` to see the merged player list across both leagues.

## Deploying

The site is connected to Vercel via GitHub — pushing to `main` triggers an
auto-deploy, no manual `vercel` CLI steps needed. One important constraint:
**Vercel's filesystem is read-only at runtime**, so `npm run import` only
works run locally/in a dev session against the repo checkout. It cannot be
run against the live deployed site. The workflow for new data is:

```
npm run import -- --league <league> --file <path>   # locally
npm run build                                         # sanity check
git add -A && git commit -m "..."
git push origin main                                  # Vercel auto-redeploys
```

## Design system

The UI ("Courtside Ledger") uses **Big Shoulders** for display headlines,
**IBM Plex Sans** for body/UI text, and **IBM Plex Mono** for prices/numbers
(tabular figures). Amber is the Euroleague Fantasy Challenge accent, teal is
the Sport5 accent — used consistently for that league's price column,
position pills, etc. Full light/dark theme tokens live in
`src/app/globals.css`. Keep new UI consistent with this rather than
introducing new fonts or palettes.

## Roadmap

- [x] Import & persist player data/prices for both leagues
- [x] Cross-league identity matching (team + shirt number)
- [x] Browse/search/sort merged player list
- [ ] Team/lineup builder with budget constraints per league's rules
- [ ] Optimizer (best team under budget, per-league roster rules)
- [ ] Price-change and form trends over time
