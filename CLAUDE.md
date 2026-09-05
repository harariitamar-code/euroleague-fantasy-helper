@AGENTS.md

# Project: Euroleague Fantasy Helper ("Courtside Ledger")

A personal tool to help build the best team in **two** separate fantasy
basketball games that both draft from the Euroleague:

1. The **official Euroleague Fantasy Challenge**
2. **Sport5 Euroleague Fantasy** (an Israeli broadcaster's own fantasy game;
   its data source is in Hebrew)

The live app is deployed at **https://euroleague-fantasy-helper.vercel.app**
(Vercel, auto-deploys from the `main` branch of
`harariitamar-code/euroleague-fantasy-helper` on push — no PR workflow, the
owner works directly on `main`).

Full usage docs (import commands, header aliases, alias-override format)
are in `README.md` — read that for the how-to. This file is the fast
orientation for picking the project back up.

## What exists today

- **Data storage**: plain JSON files under `data/`, committed to git — not
  a database. `data/players.json` is the canonical, game-agnostic player
  list; `data/euroleague-fantasy/prices.json` and
  `data/sport5-fantasy/prices.json` hold that league's price/position/status
  per player; `data/<league>/history/*.json` are dated snapshots from every
  import. `data/teams.json` maps the 20 clubs' ids across both source APIs.
  `data/player-aliases.json` is for manually correcting a wrong cross-league
  match.
- **Importer**: `npm run import -- --league <euroleague|sport5> --file <path>`.
  Understands three input shapes — see `src/lib/data/source-formats.ts` for
  the two raw JSON API dumps (official Euroleague Fantasy, and Sport5
  Fantasy), and `src/lib/data/normalize.ts` for generic CSV/XLSX header
  aliases. Does basic (club, shirt number) matching on its own, but that
  alone is intentionally conservative and under-matches a fresh pair of
  exports — see the reconciliation step below, which is required after
  every import, not optional.
- **Reconciliation**: `npm run reconcile -- analyze|apply|report`
  (`scripts/reconcile-cross-league.ts`) is the required second step after
  `npm run import`. It re-derives matches from the current price snapshots
  directly (never from historical linkage — that's what caused the
  Sloukas/Fall bug, see git history) using shirt number plus a Hebrew
  transliteration + fuzzy-name pass, auto-matching what it can and handing
  back the rest for a manual, team-by-team review pass — see
  `.claude/skills/reconcile-fantasy-data/SKILL.md` for the full workflow
  and every gotcha hit so far (including a real id-collision bug that
  silently merged distinct players, now guarded against with a hard
  failure rather than a silent stat).
- **UI**: `/players` — the "Courtside Ledger" — a searchable, sortable,
  filterable table. **Euroleague Fantasy Challenge is the ground truth for
  roster membership** (it's the more reliably current of the two sources):
  the main "Roster" tab is every Euroleague player, Sport5 price attached
  wherever matched. Sport5 rows that never matched a Euroleague player live
  in a separate "Sport5 unmatched" tab, not mixed into the roster — that
  list should normally be near-empty; a non-empty one is a signal to
  re-run reconcile or to prune from data/sport5-fantasy/prices.json a
  player Sport5 still lists who has actually left the club.
  Design system: **Big Shoulders** (display headline), **IBM Plex Sans**
  (body/UI), **IBM Plex Mono** (prices/numbers, tabular), amber = Euroleague
  accent, teal = Sport5 accent, full light/dark theme tokens in
  `src/app/globals.css`. Keep new UI consistent with this system rather
  than introducing new fonts/palettes.
- **As of the last import** (Sep 5, 2026, post-reconcile): 447 canonical
  players, 346 in the official feed, 371 in Sport5, 270 linked across both
  leagues.

## Important constraints

- **Vercel's filesystem is read-only at runtime.** `npm run import` only
  works run locally/in a dev session against the repo checkout — it cannot
  be run against the deployed site. The workflow for new data is: import
  here → `npm run build` to verify → commit → push to `main` → Vercel
  auto-redeploys.
- **Cross-league player matching is a heuristic, not guaranteed correct.**
  Jersey numbers occasionally differ between the two sources (transfers,
  renumbering, stale data), which can misattribute a Sport5 entry to the
  wrong official-feed player. Known/found mismatches get fixed via
  `data/player-aliases.json`, not by changing the matching algorithm
  per-case. See README's "Known limitation" section.
- This is a personal project — develop directly on `main`, no PR needed
  unless explicitly asked for one.

## Roadmap (not yet built)

- Team/lineup builder with each league's own budget + roster-composition
  rules
- An optimizer (best possible team under budget)
- Price-change / form trend tracking over time (the dated history snapshots
  already being saved are meant to feed this eventually)
