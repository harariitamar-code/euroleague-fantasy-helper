#!/usr/bin/env -S npx tsx
/**
 * Cross-league identity reconciliation for the Euroleague Fantasy Challenge
 * <-> Sport5 Fantasy player data.
 *
 * WHY THIS EXISTS (read this before touching the logic):
 *
 * `npm run import` (scripts/import-data.ts) does its own team+shirt-number
 * matching, but it is intentionally conservative — it has no Hebrew
 * transliteration fallback, so it only catches players whose shirt number
 * happens to already be recorded from a *previous* import of the other
 * league. On a fresh pair of exports this misses a large fraction of real
 * matches (Sport5 names are Hebrew; Euroleague names are Latin; slugify()
 * can't compare them directly).
 *
 * This script is the second pass that gets the match rate from "most
 * players duplicated across two single-league rows" to "the large majority
 * correctly linked": it re-derives matches directly from the two *current*
 * price snapshots (never from historical linkage — that's what caused the
 * "Kostas Sloukas merged onto Moustapha Fall" bug, see AGENTS/README history)
 * and adds a Hebrew transliteration + fuzzy-name pass for players who share
 * a team but weren't caught by shirt number alone.
 *
 * It deliberately does NOT try to fully automate the fuzzy pass. A real
 * person (or Claude, reading the Hebrew names directly) must review the
 * `needs-review` output and supply a manual pairs file — see SKILL.md in
 * .claude/skills/reconcile-fantasy-data/ for the full workflow, the scoring
 * rationale, and the mistakes to avoid (shirt-number overlap is NOT the same
 * as being the same person; a departed player and a new arrival can share a
 * number across two out-of-sync feeds).
 *
 * Usage:
 *   npx tsx scripts/reconcile-cross-league.ts analyze [--out <dir>]
 *   npx tsx scripts/reconcile-cross-league.ts apply --pairs <file> [--high-conf <file>]
 *   npx tsx scripts/reconcile-cross-league.ts report [--out <file>]
 */
import fs from "node:fs";
import path from "node:path";
import { slugify } from "../src/lib/data/slugify";
import { readLeaguePrices, readPlayersDb, readTeamsDb, writeLeaguePrices, writePlayersDb } from "../src/lib/data/store";
import type { LeaguePlayerEntry, Player } from "../src/lib/data/types";

const DEFAULT_OUT_DIR = "reconcile-out";

// ---- Hebrew -> Latin consonant-skeleton transliteration ----
// Deliberately crude (drops vowels/niqqud distinctions, maps digraphs
// loosely) — it only needs to be *close enough* that the correct match
// scores clearly higher than every wrong candidate within the same team's
// small roster, not phonetically exact. Validated against ~270 real pairs
// across the Sep 2026 data; see SKILL.md for known limitations.
const HEBREW_TO_LATIN: Record<string, string> = {
  א: "", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "h",
  ט: "t", י: "y", כ: "k", ך: "k", ל: "l", מ: "m", ם: "m", נ: "n",
  ן: "n", ס: "s", ע: "", פ: "p", ף: "p", צ: "c", ץ: "c", ק: "k",
  ר: "r", ש: "s", ת: "t", "'": "", '"': "", "-": "", " ": "", ",": "",
};

function transliterate(hebrew: string): string {
  let out = "";
  for (const ch of hebrew) {
    if (HEBREW_TO_LATIN[ch] !== undefined) out += HEBREW_TO_LATIN[ch];
    else if (/[a-zA-Z]/.test(ch)) out += ch.toLowerCase();
  }
  return out;
}

function skeleton(latin: string): string {
  return latin.toLowerCase().replace(/[^a-z]/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function byTeam<T extends { teamId?: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const t = r.teamId ?? "unknown";
    if (!m.has(t)) m.set(t, []);
    m.get(t)!.push(r);
  }
  return m;
}

interface HighConfMatch {
  team: string;
  teamId: string;
  elName: string;
  elShirt?: number;
  elSourceId: string;
  s5Name: string;
  s5Shirt?: number;
  s5SourceId: string;
  score: number;
}

interface ResidualRow {
  sourceId: string;
  name: string;
  shirt?: number;
  position: string;
  price: number;
}

interface TeamReport {
  team: string;
  teamId: string;
  remainingEl: ResidualRow[];
  remainingS5: ResidualRow[];
}

interface ShirtOverlap {
  team: string;
  teamId: string;
  shirt: number;
  elName: string;
  s5Name: string;
}

const AUTO_ACCEPT_THRESHOLD = 55; // score >= this: auto-matched, no review needed
const REVIEW_FLOOR = 0; // below this, not even worth listing as a candidate (report just shows raw residuals)

function analyze(outDir: string) {
  const el = readLeaguePrices("euroleague");
  const s5 = readLeaguePrices("sport5");
  const teamsDb = readTeamsDb();

  const elByTeam = byTeam(el.players);
  const s5ByTeam = byTeam(s5.players);

  const highConf: HighConfMatch[] = [];
  const teamReports: TeamReport[] = [];
  const shirtOverlaps: ShirtOverlap[] = [];

  for (const team of teamsDb.teams) {
    const elRows = elByTeam.get(team.id) ?? [];
    const s5Rows = s5ByTeam.get(team.id) ?? [];

    const candidates: { e: LeaguePlayerEntry; s: LeaguePlayerEntry; score: number }[] = [];
    for (const e of elRows) {
      const eSkel = skeleton(e.sourceName);
      for (const s of s5Rows) {
        const sSkel = transliterate(s.sourceName);
        let score = Math.round(nameSimilarity(eSkel, sSkel) * 100);
        if (e.shirtNumber && s.shirtNumber && e.shirtNumber === s.shirtNumber && e.shirtNumber !== 0) score += 25;
        candidates.push({ e, s, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    const usedEl = new Set<string>();
    const usedS5 = new Set<string>();
    for (const c of candidates) {
      if (!c.e.sourceId || !c.s.sourceId) continue;
      if (usedEl.has(c.e.sourceId) || usedS5.has(c.s.sourceId)) continue;
      if (c.score >= AUTO_ACCEPT_THRESHOLD) {
        highConf.push({
          team: team.name, teamId: team.id,
          elName: c.e.sourceName, elShirt: c.e.shirtNumber, elSourceId: c.e.sourceId,
          s5Name: c.s.sourceName, s5Shirt: c.s.shirtNumber, s5SourceId: c.s.sourceId,
          score: c.score,
        });
        usedEl.add(c.e.sourceId);
        usedS5.add(c.s.sourceId);
      }
    }

    // Shirt-number overlaps among the leftovers: same (team, shirt), names
    // clearly don't correspond. Flag, never auto-match — this is exactly the
    // shape of the Sloukas/Fall bug (a number reused by a different person
    // across out-of-sync feeds).
    const remEl = elRows.filter((e) => !e.sourceId || !usedEl.has(e.sourceId));
    const remS5 = s5Rows.filter((s) => !s.sourceId || !usedS5.has(s.sourceId));
    for (const e of remEl) {
      if (!e.shirtNumber || e.shirtNumber === 0) continue;
      const overlap = remS5.find((s) => s.shirtNumber === e.shirtNumber);
      if (overlap) {
        shirtOverlaps.push({ team: team.name, teamId: team.id, shirt: e.shirtNumber, elName: e.sourceName, s5Name: overlap.sourceName });
      }
    }

    if (remEl.length === 0 && remS5.length === 0) continue;
    teamReports.push({
      team: team.name,
      teamId: team.id,
      remainingEl: remEl.map((e) => ({ sourceId: e.sourceId!, name: e.sourceName, shirt: e.shirtNumber, position: e.position, price: e.price })),
      remainingS5: remS5.map((s) => ({ sourceId: s.sourceId!, name: s.sourceName, shirt: s.shirtNumber, position: s.position, price: s.price })),
    });
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "high-confidence.json"), JSON.stringify(highConf, null, 2));
  fs.writeFileSync(path.join(outDir, "needs-review.json"), JSON.stringify(teamReports, null, 2));
  fs.writeFileSync(path.join(outDir, "shirt-overlaps.json"), JSON.stringify(shirtOverlaps, null, 2));

  const totalRemEl = teamReports.reduce((n, t) => n + t.remainingEl.length, 0);
  const totalRemS5 = teamReports.reduce((n, t) => n + t.remainingS5.length, 0);
  console.log(`High-confidence auto-matches: ${highConf.length}`);
  console.log(`Teams with residual unmatched rows: ${teamReports.length} (${totalRemEl} EL rows, ${totalRemS5} S5 rows)`);
  console.log(`Shirt-number overlaps flagged (not auto-matched): ${shirtOverlaps.length}`);
  console.log(`\nWritten to ${outDir}/: high-confidence.json, needs-review.json, shirt-overlaps.json`);
  console.log(`\nNext: read needs-review.json team by team, build a manual pairs file, then run:`);
  console.log(`  npx tsx scripts/reconcile-cross-league.ts apply --pairs <your-pairs-file.json>`);
}

// ---- apply ----

interface ManualPair {
  teamId: string;
  elSourceId: string;
  s5SourceId: string;
}

function apply(pairsFile: string, highConfFile: string) {
  const el = readLeaguePrices("euroleague");
  const s5 = readLeaguePrices("sport5");
  const playersDb = readPlayersDb();

  const highConf: HighConfMatch[] = JSON.parse(fs.readFileSync(highConfFile, "utf-8"));
  const manual: ManualPair[] = JSON.parse(fs.readFileSync(pairsFile, "utf-8"));

  const pairs: { elSourceId: string; s5SourceId: string }[] = [
    ...highConf.map((h) => ({ elSourceId: h.elSourceId, s5SourceId: h.s5SourceId })),
    ...manual,
  ];

  const elIds = pairs.map((p) => p.elSourceId);
  const s5Ids = pairs.map((p) => p.s5SourceId);
  const dupEl = elIds.filter((id, i) => elIds.indexOf(id) !== i);
  const dupS5 = s5Ids.filter((id, i) => s5Ids.indexOf(id) !== i);
  if (dupEl.length || dupS5.length) {
    console.error("Duplicate sourceIds in pairs — a row is claimed twice:", { dupEl, dupS5 });
    process.exit(1);
  }

  // IMPORTANT: check the slug of the NAME ALONE, not name+team. A Hebrew-only
  // sourceName has no Latin characters, so slugify(name, team) silently
  // strips it down to just the team's own slug — which is non-empty, so a
  // naive `slugify(name, team) || fallback` never triggers its fallback and
  // every unmatched Hebrew player on the same club collapses onto one
  // shared id, silently dropping all but one of them. (This bit the first
  // version of this script — caught by comparing before/after player counts
  // in `apply`'s own output, not by the type system.)
  const elCanonicalId = new Map<string, string>();
  const s5CanonicalId = new Map<string, string>();
  for (const r of el.players) {
    const nameSlug = slugify(r.sourceName);
    elCanonicalId.set(r.sourceId!, nameSlug ? slugify(r.sourceName, r.team) : `euroleague-${r.sourceId}`);
  }
  for (const r of s5.players) {
    const nameSlug = slugify(r.sourceName);
    s5CanonicalId.set(r.sourceId!, nameSlug ? slugify(r.sourceName, r.team) : `sport5-${r.sourceId}`);
  }
  // Paired rows share the EL slug (prefer the clean Latin name for the id).
  for (const p of pairs) {
    const elSlug = elCanonicalId.get(p.elSourceId);
    if (!elSlug) {
      console.error(`Pair references unknown EL sourceId ${p.elSourceId}`);
      process.exit(1);
    }
    if (!s5CanonicalId.has(p.s5SourceId)) {
      console.error(`Pair references unknown S5 sourceId ${p.s5SourceId}`);
      process.exit(1);
    }
    s5CanonicalId.set(p.s5SourceId, elSlug);
  }

  const players = new Map<string, Player>();
  function upsert(id: string, fields: Partial<Player>) {
    const existing = players.get(id) ?? ({ id } as Player);
    Object.assign(existing, fields);
    players.set(id, existing);
  }

  for (const r of el.players) {
    const id = elCanonicalId.get(r.sourceId!)!;
    upsert(id, { name: r.sourceName, team: r.team, teamId: r.teamId, shirtNumber: r.shirtNumber });
  }
  for (const r of s5.players) {
    const id = s5CanonicalId.get(r.sourceId!)!;
    const existing = players.get(id);
    if (existing) {
      existing.nameHebrew = r.sourceName;
    } else {
      const isHebrew = /[֐-׿]/.test(r.sourceName);
      upsert(id, { name: r.sourceName, team: r.team, teamId: r.teamId, shirtNumber: r.shirtNumber, nameHebrew: isHebrew ? r.sourceName : undefined });
    }
  }

  // Sanity check: no single canonical id should be claimed by more than one
  // EL sourceId or more than one S5 sourceId — that's always a slugify
  // collision (typically a Hebrew-only name reduced to just the team slug),
  // never a legitimate "same person" case, since every legitimate cross-
  // league pairing is exactly one EL row + one S5 row via `pairs` above.
  const elIdCounts = new Map<string, number>();
  for (const r of el.players) elIdCounts.set(elCanonicalId.get(r.sourceId!)!, (elIdCounts.get(elCanonicalId.get(r.sourceId!)!) ?? 0) + 1);
  const s5IdCounts = new Map<string, number>();
  for (const r of s5.players) s5IdCounts.set(s5CanonicalId.get(r.sourceId!)!, (s5IdCounts.get(s5CanonicalId.get(r.sourceId!)!) ?? 0) + 1);
  const elCollisions = Array.from(elIdCounts.entries()).filter(([, n]) => n > 1);
  const s5Collisions = Array.from(s5IdCounts.entries()).filter(([, n]) => n > 1);
  if (elCollisions.length || s5Collisions.length) {
    console.error("Canonical id collisions detected (would silently drop distinct players) — aborting without writing:");
    for (const [id, n] of [...elCollisions, ...s5Collisions]) console.error(`  ${id}: ${n} rows claim this id`);
    process.exit(1);
  }

  const finalPlayers = Array.from(players.values())
    .map((p) => {
      const out: Player = { id: p.id, name: p.name, team: p.team };
      if (p.teamId) out.teamId = p.teamId;
      if (p.shirtNumber !== undefined) out.shirtNumber = p.shirtNumber;
      if (p.nameHebrew) out.nameHebrew = p.nameHebrew;
      return out;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  writePlayersDb({ updatedAt: playersDb.updatedAt, players: finalPlayers });
  writeLeaguePrices({ ...el, players: el.players.map((r) => ({ ...r, playerId: elCanonicalId.get(r.sourceId!)! })) });
  writeLeaguePrices({ ...s5, players: s5.players.map((r) => ({ ...r, playerId: s5CanonicalId.get(r.sourceId!)! })) });

  const elById = new Set(el.players.map((r) => elCanonicalId.get(r.sourceId!)));
  const s5ById = new Set(s5.players.map((r) => s5CanonicalId.get(r.sourceId!)));
  let both = 0, elOnly = 0, s5Only = 0;
  for (const p of finalPlayers) {
    const hasEl = elById.has(p.id), hasS5 = s5ById.has(p.id);
    if (hasEl && hasS5) both++;
    else if (hasEl) elOnly++;
    else if (hasS5) s5Only++;
  }
  console.log(`Applied ${pairs.length} pairs (${highConf.length} auto + ${manual.length} manual).`);
  console.log(`Final: ${finalPlayers.length} players — ${both} in both games, ${elOnly} Euroleague-only, ${s5Only} Sport5-only.`);
  console.log(`\nWrote data/players.json, data/euroleague-fantasy/prices.json, data/sport5-fantasy/prices.json.`);
  console.log(`Now: npm run build (sanity check), then run the "report" command for the review file, then commit.`);
}

// ---- report ----

function report(outFile: string) {
  const players = readPlayersDb().players;
  const el = readLeaguePrices("euroleague").players;
  const s5 = readLeaguePrices("sport5").players;
  const elById = new Map(el.map((e) => [e.playerId, e]));
  const s5ById = new Map(s5.map((e) => [e.playerId, e]));

  const byTeamName = new Map<string, Player[]>();
  for (const p of players) {
    if (!byTeamName.has(p.team)) byTeamName.set(p.team, []);
    byTeamName.get(p.team)!.push(p);
  }

  let out = "# Unmatched players by team\n\n";
  const bothCount = players.filter((p) => elById.has(p.id) && s5ById.has(p.id)).length;
  out += `${players.length} total players, ${bothCount} linked across both games.\n\n`;
  out += "Legend: **EL** = Euroleague Fantasy Challenge only, **S5** = Sport5 Fantasy only.\n\n";

  for (const teamName of Array.from(byTeamName.keys()).sort()) {
    const list = byTeamName.get(teamName)!;
    const elOnly = list.filter((p) => elById.has(p.id) && !s5ById.has(p.id));
    const s5Only = list.filter((p) => !elById.has(p.id) && s5ById.has(p.id));
    if (elOnly.length === 0 && s5Only.length === 0) continue;
    out += `## ${teamName}\n\n`;
    if (elOnly.length) {
      out += "**Euroleague only:**\n";
      for (const p of elOnly.sort((a, b) => a.name.localeCompare(b.name))) {
        const e = elById.get(p.id)!;
        out += `- ${p.name} — #${p.shirtNumber ?? "-"}, ${e.position}, €${e.price}\n`;
      }
      out += "\n";
    }
    if (s5Only.length) {
      out += "**Sport5 only:**\n";
      for (const p of s5Only.sort((a, b) => a.name.localeCompare(b.name))) {
        const s = s5ById.get(p.id)!;
        out += `- ${p.name} — #${p.shirtNumber ?? "-"}, ${s.position}, ₪${s.price}\n`;
      }
      out += "\n";
    }
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out);
  console.log(`Written to ${outFile}`);
}

// ---- CLI ----

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args[key] = val;
    }
  }
  return args;
}

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);

if (cmd === "analyze") {
  analyze(args.out ?? DEFAULT_OUT_DIR);
} else if (cmd === "apply") {
  if (!args.pairs) {
    console.error("Usage: reconcile-cross-league.ts apply --pairs <file> [--high-conf <file>]");
    process.exit(1);
  }
  apply(args.pairs, args["high-conf"] ?? path.join(DEFAULT_OUT_DIR, "high-confidence.json"));
} else if (cmd === "report") {
  report(args.out ?? path.join(DEFAULT_OUT_DIR, "unmatched-players.md"));
} else {
  console.error("Usage:");
  console.error("  reconcile-cross-league.ts analyze [--out <dir>]");
  console.error("  reconcile-cross-league.ts apply --pairs <file> [--high-conf <file>]");
  console.error("  reconcile-cross-league.ts report [--out <file>]");
  process.exit(1);
}
