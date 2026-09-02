import fs from "node:fs";
import path from "node:path";
import {
  DATA_ROOT,
  PLAYER_ALIASES_FILE,
  PLAYERS_FILE,
  TEAMS_FILE,
  leagueDir,
  leagueHistoryDir,
  leagueHistoryFile,
  leaguePricesFile,
} from "./paths";
import type { League, LeaguePriceSheet, PlayerAliases, PlayersDb, TeamsDb } from "./types";

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  const raw = fs.readFileSync(file, "utf-8");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw) as T;
}

function writeJson(file: string, data: unknown) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function readPlayersDb(): PlayersDb {
  ensureDir(DATA_ROOT);
  return readJson<PlayersDb>(PLAYERS_FILE, {
    updatedAt: new Date(0).toISOString(),
    players: [],
  });
}

export function writePlayersDb(db: PlayersDb) {
  writeJson(PLAYERS_FILE, db);
}

export function readLeaguePrices(league: League): LeaguePriceSheet {
  ensureDir(leagueDir(league));
  return readJson<LeaguePriceSheet>(leaguePricesFile(league), {
    league,
    updatedAt: new Date(0).toISOString(),
    players: [],
  });
}

export function writeLeaguePrices(sheet: LeaguePriceSheet) {
  writeJson(leaguePricesFile(sheet.league), sheet);
  ensureDir(leagueHistoryDir(sheet.league));
  const dateStr = sheet.updatedAt.slice(0, 10); // YYYY-MM-DD
  writeJson(leagueHistoryFile(sheet.league, dateStr), sheet);
}

export function readTeamsDb(): TeamsDb {
  return readJson<TeamsDb>(TEAMS_FILE, { teams: [] });
}

export function readPlayerAliases(): PlayerAliases {
  const raw = readJson<{ aliases?: PlayerAliases }>(PLAYER_ALIASES_FILE, { aliases: {} });
  return raw.aliases ?? {};
}
