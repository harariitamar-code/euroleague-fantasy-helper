/**
 * Core data model.
 *
 * A single canonical player record is shared between both fantasy games.
 * Each game (league) then has its own price list that references players
 * by `playerId`, since price, position-eligibility and status can differ
 * between the official Euroleague Fantasy Challenge and Sport5 Fantasy.
 */

export type League = "euroleague" | "sport5";

export const LEAGUES: League[] = ["euroleague", "sport5"];

export const LEAGUE_LABELS: Record<League, string> = {
  euroleague: "Euroleague Fantasy Challenge",
  sport5: "Sport5 Euroleague Fantasy",
};

/** A Euroleague club, with its id in each fantasy game's own API. See data/teams.json. */
export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  sport5TeamId: number;
  euroleagueTeamId: number;
}

export interface TeamsDb {
  teams: Team[];
}

/** Canonical, game-agnostic player identity. */
export interface Player {
  /** Stable slug id, e.g. "nikola-mirotic-mta". Never reassign once set. */
  id: string;
  name: string;
  /** Name as shown in the Sport5 app (Hebrew), if that's a source for this player. */
  nameHebrew?: string;
  /** Club this player is currently registered to, e.g. "Real Madrid". */
  team: string;
  /** Canonical team id (see data/teams.json), when known. */
  teamId?: string;
  /** Jersey/shirt number, used (with team) to line up identity across leagues. */
  shirtNumber?: number;
  nationality?: string;
  /** Free-form notes, e.g. alternate spellings, injury notes carried over. */
  notes?: string;
}

/** A player's price/status within one specific fantasy game. */
export interface LeaguePlayerEntry {
  playerId: string;
  /** Display name as it appeared in the source file (for traceability). */
  sourceName: string;
  /** This league's own internal id for the player, if the source provides one. */
  sourceId?: string;
  team: string;
  /** Canonical team id (see data/teams.json), when known. */
  teamId?: string;
  shirtNumber?: number;
  /** Position as defined by this league's game rules: "G", "F", "C", or "HC" (head coach). */
  position: string;
  price: number;
  /** Total fantasy points scored so far this season, if provided. */
  totalPoints?: number;
  /** Average fantasy points per game, if provided. */
  avgPoints?: number;
  /** Ownership percentage, if provided. */
  ownershipPct?: number;
  status?: "active" | "injured" | "doubtful" | "out" | "unknown";
}

export interface LeaguePriceSheet {
  league: League;
  updatedAt: string; // ISO timestamp
  /** Free-form label of the import source, e.g. the imported filename. */
  source?: string;
  players: LeaguePlayerEntry[];
}

export interface PlayersDb {
  updatedAt: string;
  players: Player[];
}

/**
 * Manual overrides for cross-league identity matching, for the handful of
 * players automatic team+shirt-number matching gets wrong or can't resolve
 * (e.g. ambiguous duplicate shirt numbers within a club). Keyed by
 * "<league>:<sourceId>" -> canonical player id. See data/player-aliases.json.
 */
export type PlayerAliases = Record<string, string>;
