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

/** Canonical, game-agnostic player identity. */
export interface Player {
  /** Stable slug id, e.g. "nikola-mirotic-mta". Never reassign once set. */
  id: string;
  name: string;
  /** Club this player is currently registered to, e.g. "Real Madrid". */
  team: string;
  /** Short club code if known, e.g. "MAD". Optional. */
  teamCode?: string;
  nationality?: string;
  /** Free-form notes, e.g. alternate spellings, injury notes carried over. */
  notes?: string;
}

/** A player's price/status within one specific fantasy game. */
export interface LeaguePlayerEntry {
  playerId: string;
  /** Display name as it appeared in the source file (for traceability). */
  sourceName: string;
  team: string;
  /** Position as defined by this league's game rules (e.g. "G", "F", "C"). */
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
