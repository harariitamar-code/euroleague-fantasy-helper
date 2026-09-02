/** Turn a player name (+ optional disambiguator) into a stable id slug. */
export function slugify(...parts: (string | undefined)[]): string {
  return parts
    .filter((p): p is string => Boolean(p && p.trim().length > 0))
    .join("-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
