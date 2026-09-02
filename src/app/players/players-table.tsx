"use client";

import { useMemo, useState } from "react";
import type { MergedPlayerRow } from "@/lib/data/merge";
import type { League } from "@/lib/data/types";

type SortKey = "name" | "team" | "priceEuroleague" | "priceSport5";

export default function PlayersTable({ rows }: { rows: MergedPlayerRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = rows;
    if (q) {
      result = rows.filter(
        (r) => r.name.toLowerCase().includes(q) || r.team.toLowerCase().includes(q)
      );
    }
    const sorted = [...result].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "team":
          return a.team.localeCompare(b.team) * dir;
        case "priceEuroleague":
          return ((a.byLeague.euroleague?.price ?? -1) - (b.byLeague.euroleague?.price ?? -1)) * dir;
        case "priceSport5":
          return ((a.byLeague.sport5?.price ?? -1) - (b.byLeague.sport5?.price ?? -1)) * dir;
        default:
          return 0;
      }
    });
    return sorted;
  }, [rows, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="mt-6">
      <input
        type="text"
        placeholder="Search player or team..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-sm rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <Th label="Player" onClick={() => toggleSort("name")} />
              <Th label="Team" onClick={() => toggleSort("team")} />
              <Th label="Euroleague Price" onClick={() => toggleSort("priceEuroleague")} />
              <Th label="Sport5 Price" onClick={() => toggleSort("priceSport5")} />
              <th className="px-3 py-2 text-left font-medium">EL Pos</th>
              <th className="px-3 py-2 text-left font-medium">S5 Pos</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
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
                <PriceCell league="euroleague" entry={r.byLeague.euroleague} />
                <PriceCell league="sport5" entry={r.byLeague.sport5} />
                <td className="px-3 py-2 text-neutral-400">{r.byLeague.euroleague?.position ?? "-"}</td>
                <td className="px-3 py-2 text-neutral-400">{r.byLeague.sport5?.position ?? "-"}</td>
                <td className="px-3 py-2 text-neutral-400">
                  {r.byLeague.euroleague?.status ?? r.byLeague.sport5?.status ?? "-"}
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
    <th className="cursor-pointer select-none px-3 py-2 text-left font-medium hover:text-neutral-200" onClick={onClick}>
      {label}
    </th>
  );
}

function PriceCell({
  entry,
}: {
  league: League;
  entry?: MergedPlayerRow["byLeague"][League];
}) {
  if (!entry) return <td className="px-3 py-2 text-neutral-600">-</td>;
  return <td className="px-3 py-2">{entry.price}</td>;
}
