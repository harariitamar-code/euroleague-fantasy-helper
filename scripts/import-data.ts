#!/usr/bin/env -S npx tsx
/**
 * Import a player/price export into the local data store.
 *
 * Usage:
 *   npm run import -- --league euroleague --file ./incoming/euroleague.json
 *   npm run import -- --league sport5 --file ./incoming/sport5.json
 *   npm run import -- --league euroleague --file ./incoming/euroleague.csv
 *
 * Supports three input shapes:
 *   1. Raw JSON dumped straight from the official Euroleague Fantasy
 *      Challenge API (an array of players with a "quotation" field).
 *   2. Raw JSON dumped straight from the Sport5 Euroleague Fantasy API
 *      (an array of teams, each with a "players" array; Hebrew names).
 *   3. A generic CSV/XLSX export with loosely-named columns — see
 *      src/lib/data/normalize.ts for recognized header aliases.
 *
 * For the two JSON shapes, players are matched across leagues by
 * (team, shirt number) using data/teams.json, so the same person gets one
 * canonical entry even though Sport5 names are in Hebrew and the official
 * feed uses English. Import the official Euroleague file first for the
 * best match rate, since it supplies clean English names.
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { normalizeRow, parseNumber } from "../src/lib/data/normalize";
import { slugify } from "../src/lib/data/slugify";
import {
  readLeaguePrices,
  readPlayerAliases,
  readPlayersDb,
  readTeamsDb,
  writeLeaguePrices,
  writePlayersDb,
} from "../src/lib/data/store";
import {
  isEuroleagueShape,
  isSport5Shape,
  parseEuroleague,
  parseSport5,
  type SourceRow,
} from "../src/lib/data/source-formats";
import type { League, LeaguePlayerEntry, Player } from "../src/lib/data/types";

function parseArgs(argv: string[]) {
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

function normalizeStatus(raw: string | undefined): LeaguePlayerEntry["status"] {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s.includes("injur") || s.includes("out")) return "out";
  if (s.includes("doubt") || s.includes("quest")) return "doubtful";
  if (s.includes("active") || s.includes("fit") || s.includes("ok")) return "active";
  return "unknown";
}

async function readCsvOrXlsxRows(filePath: string): Promise<Record<string, unknown>[]> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = Papa.parse<Record<string, unknown>>(raw, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    if (parsed.errors.length) {
      for (const err of parsed.errors) console.warn(`CSV parse warning: ${err.message} (row ${err.row})`);
    }
    return parsed.data;
  }

  if (ext === ".xlsx" || ext === ".xlsm") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber] = String(cell.value ?? "").trim();
    });

    const rows: Record<string, unknown>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (!header) return;
        let value: unknown = cell.value;
        if (value && typeof value === "object" && "result" in value) {
          value = (value as { result: unknown }).result; // formula cell
        }
        if (value && typeof value === "object" && "text" in value) {
          value = (value as { text: unknown }).text; // rich text
        }
        obj[header] = value;
      });
      if (Object.keys(obj).length > 0) rows.push(obj);
    });
    return rows;
  }

  throw new Error(`Unsupported file type: ${ext}. Use .json, .csv or .xlsx`);
}

function csvRowsToSourceRows(rows: Record<string, unknown>[], unmappedHeaders: Set<string>): SourceRow[] {
  const out: SourceRow[] = [];
  for (const raw of rows) {
    const { fields, unmapped } = normalizeRow(raw);
    unmapped.forEach((h) => unmappedHeaders.add(h));
    if (!fields.name || !fields.price) continue; // skip rows we can't use (e.g. footers)

    out.push({
      name: fields.name,
      team: fields.team ?? "Unknown",
      position: fields.position ?? "?",
      price: parseNumber(fields.price) ?? 0,
      totalPoints: parseNumber(fields.totalPoints),
      avgPoints: parseNumber(fields.avgPoints),
      ownershipPct: parseNumber(fields.ownershipPct),
      status: normalizeStatus(fields.status),
    });
  }
  return out;
}

async function loadSourceRows(
  league: League,
  filePath: string,
  unmappedHeaders: Set<string>
): Promise<SourceRow[]> {
  const ext = path.extname(filePath).toLowerCase();
  const teamsDb = readTeamsDb();

  if (ext === ".json" || ext === ".txt") {
    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw) as unknown;
    if (isSport5Shape(json)) {
      const bySport5Id = new Map(teamsDb.teams.map((t) => [t.sport5TeamId, t]));
      return parseSport5(json, bySport5Id);
    }
    if (isEuroleagueShape(json)) {
      const byEuroleagueId = new Map(teamsDb.teams.map((t) => [t.euroleagueTeamId, t]));
      return parseEuroleague(json, byEuroleagueId);
    }
    throw new Error(
      "Unrecognized JSON shape. Expected either the Sport5 Fantasy API export or the official Euroleague Fantasy API export."
    );
  }

  const rows = await readCsvOrXlsxRows(filePath);
  return csvRowsToSourceRows(rows, unmappedHeaders);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const league = args.league as League;
  const filePath = args.file;

  if (league !== "euroleague" && league !== "sport5") {
    console.error("Missing/invalid --league. Use --league euroleague OR --league sport5");
    process.exit(1);
  }
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`Missing/invalid --file. Got: ${filePath ?? "(none)"}`);
    process.exit(1);
  }

  const unmappedHeaders = new Set<string>();
  const sourceRows = await loadSourceRows(league, filePath, unmappedHeaders);
  if (sourceRows.length === 0) {
    console.error("No usable player rows found in file.");
    process.exit(1);
  }

  const playersDb = readPlayersDb();
  const prevPrices = readLeaguePrices(league);
  const prevByPlayerId = new Map(prevPrices.players.map((p) => [p.playerId, p]));
  const aliases = readPlayerAliases();
  const playersById = new Map(playersDb.players.map((p) => [p.id, p]));
  // Match key for players already known to have a specific shirt number at a
  // specific club — this is what lines up the same person across leagues
  // even when one source's name is in a different language/script.
  // (Shirt 0 is used for non-players like head coaches, so it's excluded —
  // clubs list several coaching staff under shirt 0 and it isn't unique.)
  // NOTE: these two lookup maps are frozen snapshots of players known
  // *before* this import started, and are deliberately never updated as
  // rows are processed below. A handful of (team, shirt#) pairs are reused
  // within a single season's own feed (a roster change mid-season — one
  // player leaves, another joins wearing the same number), so matching
  // against rows from the file currently being imported would incorrectly
  // collapse two different real players into one canonical id.
  const matchByTeamShirt = new Map(
    playersDb.players
      .filter((p) => p.teamId && p.shirtNumber)
      .map((p) => [`${p.teamId}::${p.shirtNumber}`, p])
  );
  const matchByNameTeam = new Map(
    playersDb.players.map((p) => [`${slugify(p.name)}::${slugify(p.team)}`, p])
  );

  // A (team, shirt#) pair that appears more than once *within the file
  // currently being imported* is ambiguous (a mid-season roster change,
  // where the outgoing and incoming player briefly share a number in the
  // feed) — matching either row against it would risk attaching the wrong
  // person to an existing canonical player, so such keys are excluded from
  // cross-league matching for this run.
  const teamShirtCounts = new Map<string, number>();
  for (const row of sourceRows) {
    if (!row.teamId || !row.shirtNumber) continue;
    const key = `${row.teamId}::${row.shirtNumber}`;
    teamShirtCounts.set(key, (teamShirtCounts.get(key) ?? 0) + 1);
  }
  const ambiguousShirtKeys = new Set(
    Array.from(teamShirtCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
  );

  let addedPlayers = 0;
  let updatedPlayers = 0;
  let matchedAcrossLeagues = 0;
  const priceChanges: { name: string; from: number; to: number }[] = [];
  const newEntries: LeaguePlayerEntry[] = [];

  for (const row of sourceRows) {
    if (!row.name || !Number.isFinite(row.price)) continue;

    const aliasTarget = row.sourceId ? aliases[`${league}:${row.sourceId}`] : undefined;
    const teamShirtKey = row.teamId && row.shirtNumber ? `${row.teamId}::${row.shirtNumber}` : undefined;

    let player: Player | undefined;
    let isNew = false;

    if (aliasTarget) {
      player = playersById.get(aliasTarget);
    }
    if (!player && teamShirtKey && !ambiguousShirtKeys.has(teamShirtKey)) {
      player = matchByTeamShirt.get(teamShirtKey);
      if (player) matchedAcrossLeagues++;
    }
    const nameSlug = slugify(row.name);
    if (!player && nameSlug) {
      // Only trust this match when the name actually contributes to the
      // slug — a name in a non-Latin script (e.g. Hebrew) slugifies to "",
      // which would otherwise key off the team alone and collide every
      // unmatched player at that club onto one id.
      const nameTeamKey = `${nameSlug}::${slugify(row.team)}`;
      player = matchByNameTeam.get(nameTeamKey);
    }

    if (!player) {
      // Same reasoning: fall back to a source-id-based id whenever the name
      // has no Latin characters to contribute, rather than one that collapses
      // to just the team slug.
      const id = nameSlug
        ? slugify(row.name, row.team)
        : `${league}-${row.sourceId ?? playersById.size + 1}`;
      player = playersById.get(id) ?? { id, name: row.name, team: row.team };
      isNew = !playersById.has(id);
    }

    // Prefer a Latin-script name once we have one; keep the Hebrew name too.
    if (row.nameHebrew) {
      player.nameHebrew = row.nameHebrew;
    } else if (row.name && row.name !== player.name) {
      player.name = row.name;
    }
    player.team = row.team;
    if (row.teamId) player.teamId = row.teamId;
    if (row.shirtNumber) player.shirtNumber = row.shirtNumber;

    playersById.set(player.id, player);
    if (isNew) addedPlayers++;
    else updatedPlayers++;

    const prev = prevByPlayerId.get(player.id);
    if (prev && prev.price !== row.price) {
      priceChanges.push({ name: player.name, from: prev.price, to: row.price });
    }

    newEntries.push({
      playerId: player.id,
      sourceName: row.name,
      sourceId: row.sourceId,
      team: row.team,
      teamId: row.teamId,
      shirtNumber: row.shirtNumber,
      position: row.position || prev?.position || "?",
      price: row.price,
      totalPoints: row.totalPoints ?? prev?.totalPoints,
      avgPoints: row.avgPoints ?? prev?.avgPoints,
      ownershipPct: row.ownershipPct ?? prev?.ownershipPct,
      status: row.status ?? prev?.status,
    });
  }

  const now = new Date().toISOString();
  writePlayersDb({ updatedAt: now, players: Array.from(playersById.values()) });
  writeLeaguePrices({
    league,
    updatedAt: now,
    source: path.basename(filePath),
    players: newEntries,
  });

  console.log(`\nImported ${newEntries.length} player rows for ${league}.`);
  console.log(
    `  Canonical players: +${addedPlayers} new, ${updatedPlayers} matched/updated` +
      (matchedAcrossLeagues > 0 ? ` (${matchedAcrossLeagues} matched to the other league by team+shirt#).` : ".")
  );
  if (priceChanges.length > 0) {
    console.log(`  Price changes (${priceChanges.length}):`);
    for (const c of priceChanges.slice(0, 30)) {
      const arrow = c.to > c.from ? "▲" : "▼";
      console.log(`    ${arrow} ${c.name}: ${c.from} -> ${c.to}`);
    }
    if (priceChanges.length > 30) console.log(`    ...and ${priceChanges.length - 30} more.`);
  } else {
    console.log("  No price changes vs. previous import.");
  }
  if (unmappedHeaders.size > 0) {
    console.log(`  Unrecognized columns (ignored): ${Array.from(unmappedHeaders).join(", ")}`);
  }
  console.log(
    `\nSaved: data/players.json, data/${league === "euroleague" ? "euroleague-fantasy" : "sport5-fantasy"}/prices.json (+ dated history snapshot)\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
