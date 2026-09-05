---
name: reconcile-fantasy-data
description: Import a new Euroleague Fantasy Challenge and/or Sport5 Fantasy data export and re-link players across both games. Use when the user says they have new player/price data, mentions new players or coaches were added, asks to update prices, or asks to re-check/fix cross-league matching.
---

Importing new data is two separate steps, and skipping the second one
is the single biggest way to disappoint the user here: `npm run import`
alone only catches players whose (team, shirt#) was *already* linked
from a previous import. It has no way to compare a Hebrew name against
a Latin one, so on a fresh pair of exports it silently leaves most
genuine cross-league matches unlinked. The fix is
`scripts/reconcile-cross-league.ts`, and — this is the part that
can't be skipped — a manual, team-by-team review pass using your own
reading of the Hebrew names. Budget for that; it's not optional and
it's not something to approximate with a fuzzy-score cutoff alone.

All paths below are relative to the repo root.

## 0. Clean the raw export files

User-provided dumps have shown up with trailing garbage after the
final `}` (a copy/paste artifact) — `JSON.parse` fails with
`Unexpected non-whitespace character after JSON`. Fix by trimming to
the last `}`:

```bash
python3 -c "
data = open('incoming/sport5-YYYY-MM-DD.json', 'rb').read()
idx = data.rfind(b'}')
open('incoming/sport5-YYYY-MM-DD.json', 'wb').write(data[:idx+1])
"
```

Then sanity-check both files parse and look like the expected shape
before importing:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('incoming/euroleague-YYYY-MM-DD.json')).data.length, 'euroleague rows')"
node -e "const d=JSON.parse(require('fs').readFileSync('incoming/sport5-YYYY-MM-DD.json')); let n=0; for(const t of d.data) n+=t.players.length; console.log(n,'sport5 rows across',d.data.length,'teams')"
```

`incoming/` is gitignored — raw scrapes don't get committed, only the
data they produce.

## 1. Run the importer (both leagues, Euroleague first)

```bash
npm run import -- --league euroleague --file ./incoming/euroleague-YYYY-MM-DD.json
npm run import -- --league sport5 --file ./incoming/sport5-YYYY-MM-DD.json
```

Euroleague first, always — it gives clean English names that the
Sport5 import (Hebrew names) can then match against by (team, shirt#).
This does some real matching on its own and reports how many; that
count will still be well short of the true cross-league total, and
that's expected, not a sign anything went wrong yet.

## 2. Analyze: auto-match what's confidently matchable

```bash
npm run reconcile -- analyze
```

Writes to `reconcile-out/` (gitignored):
- `high-confidence.json` — pairs already matched by (current-snapshot
  shirt# + name-similarity score ≥ 55). These need no review.
- `needs-review.json` — per team, every remaining unmatched row on
  both sides (with `sourceId`, name, shirt, position, price).
- `shirt-overlaps.json` — pairs that share a (team, shirt#) among the
  *unmatched* leftovers but whose names clearly don't correspond.
  Never auto-matched, always worth a look (see Gotchas).

The scoring is a crude Hebrew→Latin consonant-skeleton transliteration
plus Levenshtein similarity (implementation in the script, validated
against ~270 real pairs from the Sep 2026 data) — good enough to rank
candidates within one team's small roster, not phonetically exact.
Read the script's own top-of-file comment before touching the scoring
constants; the history there explains why the threshold is where it is.

## 3. Manually review `needs-review.json` — team by team, by reading the names

This is the actual work. For each team in the file, look at
`remainingEl` and `remainingS5` side by side and decide, using your own
knowledge of Hebrew and current Euroleague/EuroCup rosters:

- **A clear same-person match** (transliteration obviously corresponds,
  or a shirt number lines up with a name that also roughly fits) →
  add to your manual pairs list.
- **Genuinely a different person, or genuinely not tracked by the
  other source** (a deep-bench player, a departed player one feed
  hasn't dropped yet, an assistant coach only one game prices) → leave
  unmatched. This is normal and expected — not every player is in both
  games, and forcing a match here is worse than leaving it.
- **Ambiguous** → leave unmatched and flag it in your summary to the
  user rather than guessing. Getting one wrong (see Gotchas) is worse
  than leaving several genuinely-unclear ones unmatched.

Build the manual pairs as JSON, `{teamId, elSourceId, s5SourceId}[]`
(use `needs-review.json`'s `sourceId` fields directly — don't match by
name text, formatting differs enough between rounds — e.g. "Derrick
Alston Jr." vs "Derrick Alston Jr" — to make exact-string lookups
fragile). Save it somewhere in `reconcile-out/` (or anywhere outside
the repo — it's a one-round input, not app data).

## 4. Apply

```bash
npm run reconcile -- apply --pairs reconcile-out/manual-pairs.json
```

Rebuilds `data/players.json` and both `data/*/prices.json` from the
current price snapshots directly — combining `high-confidence.json`
with your manual pairs — rather than trusting whatever linkage
happened to already exist. Prints final totals (total / both / EL-only
/ S5-only). The script hard-fails instead of writing if it detects a
canonical id claimed by more than one source row (see Gotchas below —
this exact bug happened once already).

## 5. Verify before committing

```bash
npx tsc --noEmit
npm run build
```

Then actually look at the app, not just trust the counts — screenshot
a couple of searches via the `run-euroleague-fantasy-helper` skill
(e.g. search for a name you just fixed, and the full `/players` table)
and eyeball that the "both / EL-only / S5-only" stat bar and the row
counts look sane. A build passing doesn't catch a data bug like the
collision below — only looking at rendered output does.

## 6. Report residuals for the user, then commit

```bash
npm run reconcile -- report --out reconcile-out/unmatched-players.md
```

Send that file to the user (they've asked for it before) rather than
pasting the whole thing into chat — it's long. Then commit `data/` and
push per this repo's normal workflow (`main`, no PR).

## Gotchas

- **The id-collision bug (already happened once, cost a full extra
  round-trip).** `slugify(sourceName, team)` for a Hebrew-only name
  doesn't return an empty string — it silently strips the Hebrew
  entirely and returns just the team's own slug (e.g.
  `anadolu-efes-istanbul`), which is non-empty. A naive
  `slug || fallback` never fires its fallback, and every unmatched
  Hebrew player at that club collapses onto one shared canonical id,
  silently dropping the rest. The fix (already in the script): check
  `slugify(sourceName)` **alone** (no team) for emptiness before
  deciding whether to use a `sourceId`-based fallback id — matching
  what `scripts/import-data.ts` already does correctly for new
  players. `apply` now hard-fails on any collision rather than writing
  bad data, but if you ever reimplement this logic elsewhere, keep the
  same "name-alone" check.
- **A shared shirt number is not evidence of being the same person.**
  This is the Kostas Sloukas / Moustapha Fall bug from the first round:
  two different real players wore the same club shirt number at
  different times, and a stale (team, shirt#) linkage merged one
  league's row for the new guy onto the old guy's canonical id. Always
  re-derive matches from the *current* snapshot's names, never from
  historical linkage alone — `analyze` already does this — and treat
  every `shirt-overlaps.json` entry as "probably two different people"
  until the names themselves say otherwise.
- **Two Sport5 rows can legitimately share a shirt number.** Seen once:
  Panathinaikos had both "Panagiotis Kalaitzakis" (active) and
  "Georgios Kalaitzakis" (doubtful) at shirt #5 simultaneously — a real
  Sport5-side data duplicate/quirk, not two names for one person.
  Don't force a match just because a name and a shirt number are
  *close*; if the first name is clearly different, leave it.
- **HC (head coach) entries need care.** Coaching staff are priced by
  Sport5 too, sharing shirt #0 with several others at the same club, so
  shirt number is useless for them — match by name only, and don't
  assume the Euroleague feed's listed "HC" is actually the real-world
  head coach (assistant coaches show up too).
- **Name-formatting drift breaks exact-string matching between
  rounds.** "Derrick Alston Jr." one round, "Derrick Alston Jr"
  another. This is why step 3 says match by `sourceId`, not name text.
