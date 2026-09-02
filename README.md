# Euroleague Fantasy Helper

A helper app for building the best possible team in both:

- the official **Euroleague Fantasy Challenge**, and
- **Sport5 Euroleague Fantasy**

## Data model

- `data/players.json` — canonical, game-agnostic player identities (name, team,
  nationality). Shared between both leagues.
- `data/euroleague-fantasy/prices.json` — current prices/positions/stats for the
  official Euroleague Fantasy Challenge.
- `data/sport5-fantasy/prices.json` — current prices/positions/stats for Sport5
  Euroleague Fantasy.
- `data/<league>/history/YYYY-MM-DD.json` — a dated snapshot saved on every
  import, so price history can be tracked over time.

See `src/lib/data/types.ts` for the exact shapes.

## Importing/updating player data

Export or save the player list (with prices) from the official app or Sport5
as a `.csv` or `.xlsx` file, then run:

```bash
npm run import -- --league euroleague --file ./incoming/euroleague.csv
npm run import -- --league sport5 --file ./incoming/sport5.xlsx
```

Run this any time you have new data — it's safe to re-run. It will:

- match players by name+team against the existing canonical list (adding new
  players it hasn't seen before),
- update that league's prices/positions/stats,
- save a dated snapshot under `data/<league>/history/`,
- print a summary of what changed, including price moves.

The importer recognizes common column header variants (case/spacing
insensitive) — see `src/lib/data/normalize.ts` for the full alias list:

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

Any columns it can't map are ignored and reported at the end of the import
so you can tell if something needs a new alias.

## Running the app

```bash
npm install
npm run dev
```

Then open `/players` to see the merged player list across both leagues.

## Roadmap

- [x] Import & persist player data/prices for both leagues
- [x] Browse/search/sort merged player list
- [ ] Team/lineup builder with budget constraints per league's rules
- [ ] Optimizer (best team under budget, per-league roster rules)
- [ ] Price-change and form trends over time
