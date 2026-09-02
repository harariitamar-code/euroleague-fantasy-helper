import path from "node:path";
import type { League } from "./types";

export const DATA_ROOT = path.join(process.cwd(), "data");

export const PLAYERS_FILE = path.join(DATA_ROOT, "players.json");
export const TEAMS_FILE = path.join(DATA_ROOT, "teams.json");
export const PLAYER_ALIASES_FILE = path.join(DATA_ROOT, "player-aliases.json");

export function leagueDir(league: League): string {
  const dirName = league === "euroleague" ? "euroleague-fantasy" : "sport5-fantasy";
  return path.join(DATA_ROOT, dirName);
}

export function leaguePricesFile(league: League): string {
  return path.join(leagueDir(league), "prices.json");
}

export function leagueHistoryDir(league: League): string {
  return path.join(leagueDir(league), "history");
}

export function leagueHistoryFile(league: League, dateStr: string): string {
  return path.join(leagueHistoryDir(league), `${dateStr}.json`);
}
