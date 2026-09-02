/**
 * Parsers for the raw JSON dumps pulled directly from each fantasy game's
 * own API, plus the shape both feed into for the common upsert pipeline.
 */
import type { LeaguePlayerEntry, Team } from "./types";

export interface SourceRow {
  sourceId?: string;
  /** Best available name — English/Latin script when we have it. */
  name: string;
  /** Hebrew display name, when the source is Sport5 (or we know it separately). */
  nameHebrew?: string;
  team: string;
  teamId?: string;
  shirtNumber?: number;
  /** Normalized position: "G" | "F" | "C" | "HC" | raw fallback string. */
  position: string;
  price: number;
  totalPoints?: number;
  avgPoints?: number;
  ownershipPct?: number;
  status?: LeaguePlayerEntry["status"];
}

/** True if `text` contains no Hebrew characters (i.e. looks like Latin script). */
function isLatinName(text: string): boolean {
  return !/[\u0591-\u05F4]/.test(text);
}

// ---- Sport5 Euroleague Fantasy ----------------------------------------

const SPORT5_POSITION: Record<number, string> = { 1: "G", 2: "F", 3: "C", 4: "HC" };

interface Sport5Player {
  id: number;
  teamId: number;
  name: string;
  price: number;
  shirtNumber: number;
  position: number;
  injuredStatus: number;
  expelledStatus: number;
  missingStatus: number;
}

interface Sport5Team {
  id: number;
  name: string;
  players: Sport5Player[];
}

interface Sport5Export {
  data: Sport5Team[];
}

export function isSport5Shape(json: unknown): json is Sport5Export {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0] as Record<string, unknown>;
  return Array.isArray(first?.players) && typeof first?.id === "number";
}

function sport5Status(p: Sport5Player): SourceRow["status"] {
  if (p.injuredStatus === 1) return "injured";
  if (p.expelledStatus === 1) return "out";
  if (p.missingStatus === 2) return "doubtful";
  return "active";
}

export function parseSport5(json: Sport5Export, teamsBySport5Id: Map<number, Team>): SourceRow[] {
  const rows: SourceRow[] = [];
  for (const team of json.data) {
    const canonicalTeam = teamsBySport5Id.get(team.id);
    for (const p of team.players) {
      rows.push({
        sourceId: String(p.id),
        name: p.name,
        nameHebrew: isLatinName(p.name) ? undefined : p.name,
        team: canonicalTeam?.name ?? team.name,
        teamId: canonicalTeam?.id,
        shirtNumber: p.shirtNumber,
        position: SPORT5_POSITION[p.position] ?? String(p.position),
        price: p.price / 1_000_000,
        status: sport5Status(p),
      });
    }
  }
  return rows;
}

// ---- Official Euroleague Fantasy Challenge -----------------------------

interface EuroleaguePlayer {
  id: number;
  first_name: string;
  last_name: string;
  quotation: number;
  jersey: string | null;
  avg_pts: number;
  popularity: number;
  position: { id: number; name: string };
  team: { id: number; name: string; abbreviation: string };
  is_injured: boolean;
  probability_of_playing: number;
}

interface EuroleagueExport {
  data: EuroleaguePlayer[];
}

const EUROLEAGUE_POSITION: Record<string, string> = {
  Guard: "G",
  Forward: "F",
  Center: "C",
  "Head Coach": "HC",
};

export function isEuroleagueShape(json: unknown): json is EuroleagueExport {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0] as Record<string, unknown>;
  return typeof first?.quotation === "number" && typeof first?.first_name === "string";
}

function euroleagueStatus(p: EuroleaguePlayer): SourceRow["status"] {
  if (p.is_injured) return "injured";
  if (p.probability_of_playing < 1 && p.probability_of_playing > 0) return "doubtful";
  if (p.probability_of_playing === 0) return "out";
  return "active";
}

export function parseEuroleague(
  json: EuroleagueExport,
  teamsByEuroleagueId: Map<number, Team>
): SourceRow[] {
  return json.data.map((p) => {
    const canonicalTeam = teamsByEuroleagueId.get(p.team.id);
    const jersey = p.jersey ? Number.parseInt(p.jersey, 10) : undefined;
    return {
      sourceId: String(p.id),
      name: `${p.first_name} ${p.last_name}`.trim(),
      team: canonicalTeam?.name ?? p.team.name,
      teamId: canonicalTeam?.id,
      shirtNumber: Number.isFinite(jersey) ? jersey : undefined,
      position: EUROLEAGUE_POSITION[p.position.name] ?? p.position.name,
      price: p.quotation,
      avgPoints: p.avg_pts,
      ownershipPct: p.popularity,
      status: euroleagueStatus(p),
    };
  });
}
