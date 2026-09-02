/**
 * Maps loose, real-world spreadsheet column headers onto our known fields.
 * Matching is case-insensitive and ignores spaces/underscores/punctuation.
 */

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "player", "playername", "fullname"],
  team: ["team", "club", "teamname"],
  position: ["position", "pos", "role"],
  price: ["price", "value", "credits", "cost", "salary"],
  totalPoints: ["totalpoints", "points", "totalpir", "seasonpoints", "pts"],
  avgPoints: ["avgpoints", "average", "avg", "ppg", "pointspergame"],
  ownershipPct: ["ownership", "ownershippct", "owned", "selected", "selectedby"],
  status: ["status", "fitness", "injury"],
  nationality: ["nationality", "nation", "country"],
};

function canonicalKey(header: string): string {
  return header
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Build a lookup from canonical header key -> our field name. */
function buildAliasLookup(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) map.set(alias, field);
  }
  return map;
}

const ALIAS_LOOKUP = buildAliasLookup();

/**
 * Given one raw row (header -> raw value) from a CSV/XLSX, return a row
 * keyed by our known field names, plus the list of headers that couldn't
 * be mapped (so the importer can warn about them).
 */
export function normalizeRow(raw: Record<string, unknown>): {
  fields: Record<string, string>;
  unmapped: string[];
} {
  const fields: Record<string, string> = {};
  const unmapped: string[] = [];

  for (const [header, value] of Object.entries(raw)) {
    const key = canonicalKey(header);
    if (!key) continue;
    const field = ALIAS_LOOKUP.get(key);
    const strValue = value === null || value === undefined ? "" : String(value).trim();
    if (field) {
      if (strValue) fields[field] = strValue;
    } else if (strValue) {
      unmapped.push(header);
    }
  }

  return { fields, unmapped };
}

/** Parse a price-like string ("12", "12.5", "€12.5", "12,5") into a number. */
export function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9.,-]/g, "").replace(",", ".");
  if (!cleaned) return undefined;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}
