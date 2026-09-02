import { readLeaguePrices, readPlayersDb } from "./store";
import { LEAGUES, type League, type LeaguePlayerEntry, type Player } from "./types";

export interface MergedPlayerRow {
  id: string;
  name: string;
  nameHebrew?: string;
  team: string;
  nationality?: string;
  byLeague: Partial<
    Record<
      League,
      {
        price: number;
        position: string;
        totalPoints?: number;
        avgPoints?: number;
        ownershipPct?: number;
        status?: string;
      }
    >
  >;
}

export interface MergedData {
  updatedAt: Record<League, string>;
  rows: MergedPlayerRow[];
}

export function getMergedPlayers(): MergedData {
  const db = readPlayersDb();
  const sheets = Object.fromEntries(LEAGUES.map((l) => [l, readLeaguePrices(l)])) as Record<
    League,
    ReturnType<typeof readLeaguePrices>
  >;

  const entriesByLeagueAndPlayer = Object.fromEntries(
    LEAGUES.map((l) => [l, new Map(sheets[l].players.map((e) => [e.playerId, e]))])
  ) as Record<League, Map<string, LeaguePlayerEntry>>;

  const rows: MergedPlayerRow[] = db.players.map((p: Player) => {
    const byLeague: MergedPlayerRow["byLeague"] = {};
    for (const league of LEAGUES) {
      const entry = entriesByLeagueAndPlayer[league].get(p.id);
      if (entry) {
        byLeague[league] = {
          price: entry.price,
          position: entry.position,
          totalPoints: entry.totalPoints,
          avgPoints: entry.avgPoints,
          ownershipPct: entry.ownershipPct,
          status: entry.status,
        };
      }
    }
    return {
      id: p.id,
      name: p.name,
      nameHebrew: p.nameHebrew,
      team: p.team,
      nationality: p.nationality,
      byLeague,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    updatedAt: Object.fromEntries(LEAGUES.map((l) => [l, sheets[l].updatedAt])) as Record<League, string>,
    rows,
  };
}
