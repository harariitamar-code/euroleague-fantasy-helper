"use client";

import { useMemo, useState } from "react";
import type { MergedPlayerRow } from "@/lib/data/merge";

type SortKey = "name" | "team" | "el" | "s5";
type FilterKey = "all" | "linked" | "el" | "s5";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "linked", label: "Linked" },
  { key: "el", label: "Euroleague" },
  { key: "s5", label: "Sport5" },
];

export default function PlayersTable({ rows }: { rows: MergedPlayerRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = rows;

    if (filter === "linked") {
      result = result.filter((r) => r.byLeague.euroleague && r.byLeague.sport5);
    } else if (filter === "el") {
      result = result.filter((r) => r.byLeague.euroleague);
    } else if (filter === "s5") {
      result = result.filter((r) => r.byLeague.sport5);
    }

    if (q) {
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.team.toLowerCase().includes(q) ||
          (r.nameHebrew && r.nameHebrew.includes(query.trim()))
      );
    }

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...result].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [rows, query, filter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[200px] flex-1 basis-[240px]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search player or club…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-[34px] pr-3.5 text-sm text-[var(--text)] outline-none focus:outline-2 focus:outline-[var(--accent-s5)] focus:-outline-offset-1"
          />
        </label>

        <div className="flex gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-[3px]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-[13px] py-[7px] text-[0.8rem] font-medium transition-colors ${
                filter === f.key
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)]"
                  : "text-[var(--text-dim)] hover:text-[var(--text)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[0.78rem] text-[var(--text-faint)]">
          {filtered.length} of {rows.length} players
        </span>
      </div>

      <div className="max-h-[68vh] overflow-auto rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <table className="w-full min-w-[760px] border-collapse text-[0.87rem]">
          <thead>
            <tr>
              <Th label="Player" sortKey="name" active={sortKey === "name"} dir={sortDir} onClick={toggleSort} />
              <Th label="Club" sortKey="team" active={sortKey === "team"} dir={sortDir} onClick={toggleSort} />
              <Th label="EL Credits" sortKey="el" active={sortKey === "el"} dir={sortDir} onClick={toggleSort} />
              <th className="sticky top-0 whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-[11px] text-left text-[0.7rem] uppercase tracking-[0.05em] text-[var(--text-faint)]">
                EL Pos
              </th>
              <Th label="S5 Credits" sortKey="s5" active={sortKey === "s5"} dir={sortDir} onClick={toggleSort} />
              <th className="sticky top-0 whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-[11px] text-left text-[0.7rem] uppercase tracking-[0.05em] text-[var(--text-faint)]">
                S5 Pos
              </th>
              <th className="sticky top-0 whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-[11px] text-left text-[0.7rem] uppercase tracking-[0.05em] text-[var(--text-faint)]">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const el = r.byLeague.euroleague;
              const s5 = r.byLeague.sport5;
              const status = el?.status ?? s5?.status ?? null;
              return (
                <tr key={r.id} className="[&>td]:border-b [&>td]:border-[var(--border-soft)] last:[&>td]:border-b-0 hover:[&>td]:bg-[var(--surface-2)]">
                  <td className="px-3.5 py-[9px]">
                    <span className="font-semibold">{r.name}</span>
                    {r.nameHebrew && (
                      <span dir="rtl" className="ml-2 text-[0.85em] text-[var(--text-faint)]">
                        {r.nameHebrew}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-[9px] text-[0.86em] text-[var(--text-dim)]">{r.team}</td>
                  <PriceCell price={el?.price} tone="el" />
                  <PosCell position={el?.position} tone="el" />
                  <PriceCell price={s5?.price} tone="s5" />
                  <PosCell position={s5?.position} tone="s5" />
                  <td className="whitespace-nowrap px-3.5 py-[9px] text-[0.82rem] text-[var(--text-dim)]">
                    <span
                      className={`mr-1.5 inline-block h-[7px] w-[7px] rounded-full ${statusDotClass(status)}`}
                    />
                    {status ?? "no data"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-[var(--text-faint)]">No players match that search.</div>
        )}
      </div>
    </div>
  );
}

function sortValue(r: MergedPlayerRow, key: SortKey): string | number {
  if (key === "name") return r.name.toLowerCase();
  if (key === "team") return r.team.toLowerCase();
  if (key === "el") return r.byLeague.euroleague ? r.byLeague.euroleague.price : -1;
  return r.byLeague.sport5 ? r.byLeague.sport5.price : -1;
}

function statusDotClass(status: string | null) {
  if (status === "active") return "bg-[var(--good)]";
  if (status === "doubtful") return "bg-[var(--warn)]";
  if (status === "injured" || status === "out") return "bg-[var(--bad)]";
  return "bg-[var(--text-faint)]";
}

function Th({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={`sticky top-0 cursor-pointer select-none whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-[11px] text-left text-[0.7rem] uppercase tracking-[0.05em] hover:text-[var(--text)] ${
        active ? "text-[var(--text)]" : "text-[var(--text-faint)]"
      }`}
    >
      {label}
      {active && <span className="ml-[3px] text-[0.65rem] opacity-70">{dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

function PriceCell({ price, tone }: { price: number | undefined; tone: "el" | "s5" }) {
  if (price === undefined) {
    return <td className="px-3.5 py-[9px] font-[family-name:var(--font-mono)] tabular-nums text-[var(--text-faint)]">—</td>;
  }
  const color = tone === "el" ? "text-[var(--accent-el)]" : "text-[var(--accent-s5)]";
  return (
    <td className={`px-3.5 py-[9px] font-[family-name:var(--font-mono)] font-semibold tabular-nums ${color}`}>
      {price.toFixed(1)}
    </td>
  );
}

function PosCell({ position, tone }: { position: string | undefined; tone: "el" | "s5" }) {
  if (!position) {
    return (
      <td className="px-3.5 py-[9px]">
        <span className="inline-block rounded-full border border-[var(--border)] px-[7px] py-px text-[0.72rem] font-semibold text-[var(--text-dim)] opacity-35">
          —
        </span>
      </td>
    );
  }
  const cls =
    tone === "el"
      ? "border-[var(--accent-el)] text-[var(--accent-el)] bg-[var(--accent-el-bg)]"
      : "border-[var(--accent-s5)] text-[var(--accent-s5)] bg-[var(--accent-s5-bg)]";
  return (
    <td className="px-3.5 py-[9px]">
      <span
        className={`inline-block rounded-full border px-[7px] py-px font-[family-name:var(--font-mono)] text-[0.72rem] font-semibold ${cls}`}
      >
        {position}
      </span>
    </td>
  );
}
