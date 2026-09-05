"use client";

import { useMemo, useState } from "react";
import { LEAGUE_LABELS } from "@/lib/data/types";

export interface PriceDiffRow {
  id: string;
  name: string;
  nameHebrew?: string;
  team: string;
  priceEuroleague: number;
  priceSport5: number;
  /** priceEuroleague - priceSport5. Positive = pricier in Euroleague. */
  diff: number;
}

type SortKey = "gap" | "name" | "team" | "priceEuroleague" | "priceSport5";

export default function PriceDiffTable({ rows }: { rows: PriceDiffRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("gap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [cheaperIn, setCheaperIn] = useState<"any" | "euroleague" | "sport5">("any");
  const [minPrice, setMinPrice] = useState(0);

  const maxPrice = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.priceEuroleague, r.priceSport5), 0),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = rows;
    if (q) {
      result = result.filter(
        (r) => r.name.toLowerCase().includes(q) || r.team.toLowerCase().includes(q)
      );
    }
    if (cheaperIn === "euroleague") {
      result = result.filter((r) => r.diff < 0); // cheaper in euroleague
    } else if (cheaperIn === "sport5") {
      result = result.filter((r) => r.diff > 0); // cheaper in sport5
    }
    if (minPrice > 0) {
      // Keep a player only if they're not a scrub in *either* game -
      // a big gap where one side is a bench-warmer isn't a useful "deal".
      result = result.filter(
        (r) => r.priceEuroleague >= minPrice && r.priceSport5 >= minPrice
      );
    }
    const sorted = [...result].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "gap":
          return (Math.abs(a.diff) - Math.abs(b.diff)) * dir;
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "team":
          return a.team.localeCompare(b.team) * dir;
        case "priceEuroleague":
          return (a.priceEuroleague - b.priceEuroleague) * dir;
        case "priceSport5":
          return (a.priceSport5 - b.priceSport5) * dir;
        default:
          return 0;
      }
    });
    return sorted;
  }, [rows, query, sortKey, sortDir, cheaperIn, minPrice]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "gap" ? "desc" : "asc");
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search player or team..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-sm rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <div className="flex rounded border border-neutral-700 text-sm">
          <FilterButton
            label="All"
            active={cheaperIn === "any"}
            onClick={() => setCheaperIn("any")}
          />
          <FilterButton
            label="Deal in Euroleague"
            active={cheaperIn === "euroleague"}
            onClick={() => setCheaperIn("euroleague")}
          />
          <FilterButton
            label="Deal in Sport5"
            active={cheaperIn === "sport5"}
            onClick={() => setCheaperIn("sport5")}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          Min price
          <input
            type="range"
            min={0}
            max={maxPrice}
            step={1}
            value={minPrice}
            onChange={(e) => setMinPrice(Number(e.target.value))}
            className="w-32 accent-neutral-100"
          />
          <span className="w-6 text-right tabular-nums text-neutral-200">{minPrice}</span>
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <Th label="Player" onClick={() => toggleSort("name")} />
              <Th label="Team" onClick={() => toggleSort("team")} />
              <Th label="Euroleague Price" onClick={() => toggleSort("priceEuroleague")} />
              <Th label="Sport5 Price" onClick={() => toggleSort("priceSport5")} />
              <Th label="Gap" onClick={() => toggleSort("gap")} />
              <th className="px-3 py-2 text-left font-medium">Cheaper In</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800 hover:bg-neutral-900/60">
                <td className="px-3 py-2">
                  {r.name}
                  {r.nameHebrew && <span className="ml-2 text-neutral-500">{r.nameHebrew}</span>}
                </td>
                <td className="px-3 py-2 text-neutral-400">{r.team}</td>
                <td className="px-3 py-2">{r.priceEuroleague}</td>
                <td className="px-3 py-2">{r.priceSport5}</td>
                <td className="px-3 py-2 font-medium">{Math.abs(r.diff)}</td>
                <td className="px-3 py-2">
                  {r.diff === 0 ? (
                    <span className="text-neutral-600">—</span>
                  ) : r.diff < 0 ? (
                    <span className="text-emerald-400">{LEAGUE_LABELS.euroleague}</span>
                  ) : (
                    <span className="text-emerald-400">{LEAGUE_LABELS.sport5}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">{filtered.length} players shown</p>
    </div>
  );
}

function Th({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left font-medium hover:text-neutral-200"
      onClick={onClick}
    >
      {label}
    </th>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 first:rounded-l last:rounded-r ${
        active ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
