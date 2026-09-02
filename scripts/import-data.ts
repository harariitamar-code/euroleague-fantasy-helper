#!/usr/bin/env -S npx tsx
/**
 * Import a CSV/XLSX export of player prices into the local data store.
 *
 * Usage:
 *   npm run import -- --league euroleague --file ./incoming/euroleague.csv
 *   npm run import -- --league sport5 --file ./incoming/sport5.xlsx
 *
 * The file needs one row per player with (in any order, any casing)
 * columns roughly named: name, team, position, price, and optionally
 * points/avg/ownership/status/nationality. See src/lib/data/normalize.ts
 * for recognized header aliases.
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { normalizeRow, parseNumber } from "../src/lib/data/normalize";
import { slugify } from "../src/lib/data/slugify";
import { readPlayersDb, readLeaguePrices, writePlayersDb, writeLeaguePrices } from "../src/lib/data/store";
import type { League, LeaguePlayerEntry } from "../src/lib/data/types";

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

async function readRows(filePath: string): Promise<Record<string, unknown>[]> {
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

  throw new Error(`Unsupported file type: ${ext}. Use .csv or .xlsx`);
}

function normalizeStatus(raw: string | undefined): LeaguePlayerEntry["status"] {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s.includes("injur") || s.includes("out")) return "out";
  if (s.includes("doubt") || s.includes("quest")) return "doubtful";
  if (s.includes("active") || s.includes("fit") || s.includes("ok")) return "active";
  return "unknown";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const league = args.league as League;
  const filePath = args.file;

  if (league !== "euroleague" && league !== "sport5") {
    console.error('Missing/invalid --league. Use --league euroleague OR --league sport5');
    process.exit(1);
  }
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`Missing/invalid --file. Got: ${filePath ?? "(none)"}`);
    process.exit(1);
  }

  const rows = await readRows(filePath);
  if (rows.length === 0) {
    console.error("No rows found in file.");
    process.exit(1);
  }

  const playersDb = readPlayersDb();
  const prevPrices = readLeaguePrices(league);
  const prevByPlayerId = new Map(prevPrices.players.map((p) => [p.playerId, p]));
  const playersById = new Map(playersDb.players.map((p) => [p.id, p]));
  // Also index existing canonical players by name+team for matching, since
  // a re-import won't carry our internal ids.
  const playersByNameTeam = new Map(
    playersDb.players.map((p) => [`${slugify(p.name)}::${slugify(p.team)}`, p])
  );

  const unmappedHeaders = new Set<string>();
  let addedPlayers = 0;
  let updatedPlayers = 0;
  const priceChanges: { name: string; from: number; to: number }[] = [];
  const newEntries: LeaguePlayerEntry[] = [];

  for (const raw of rows) {
    const { fields, unmapped } = normalizeRow(raw);
    unmapped.forEach((h) => unmappedHeaders.add(h));

    if (!fields.name || !fields.price) {
      continue; // skip rows we can't use (e.g. blank/footer rows)
    }

    const team = fields.team ?? "Unknown";
    const matchKey = `${slugify(fields.name)}::${slugify(team)}`;
    let player = playersByNameTeam.get(matchKey);

    if (!player) {
      const id = slugify(fields.name, team);
      player = playersById.get(id) ?? {
        id,
        name: fields.name,
        team,
      };
      const isNew = !playersById.has(id);
      player.team = team;
      if (fields.nationality) player.nationality = fields.nationality;
      playersById.set(id, player);
      playersByNameTeam.set(matchKey, player);
      if (isNew) addedPlayers++;
      else updatedPlayers++;
    } else {
      if (player.team !== team) player.team = team;
      if (fields.nationality) player.nationality = fields.nationality;
      updatedPlayers++;
    }

    const price = parseNumber(fields.price) ?? 0;
    const prev = prevByPlayerId.get(player.id);
    if (prev && prev.price !== price) {
      priceChanges.push({ name: player.name, from: prev.price, to: price });
    }

    newEntries.push({
      playerId: player.id,
      sourceName: fields.name,
      team,
      position: fields.position ?? prev?.position ?? "?",
      price,
      totalPoints: parseNumber(fields.totalPoints) ?? prev?.totalPoints,
      avgPoints: parseNumber(fields.avgPoints) ?? prev?.avgPoints,
      ownershipPct: parseNumber(fields.ownershipPct) ?? prev?.ownershipPct,
      status: normalizeStatus(fields.status) ?? prev?.status,
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
  console.log(`  Canonical players: +${addedPlayers} new, ${updatedPlayers} matched/updated.`);
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
  console.log(`\nSaved: data/players.json, data/${league === "euroleague" ? "euroleague-fantasy" : "sport5-fantasy"}/prices.json (+ dated history snapshot)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
