import { getMergedPlayers } from "@/lib/data/merge";
import PlayersTable from "./players-table";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  const d = new Date(iso);
  if (d.getTime() === 0) return "never";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function PlayersPage() {
  const data = getMergedPlayers();
  const rows = data.rows;
  const total = rows.length;
  const teams = new Set(rows.map((r) => r.team)).size;
  const linked = rows.filter((r) => r.byLeague.euroleague && r.byLeague.sport5).length;
  const elOnly = rows.filter((r) => r.byLeague.euroleague && !r.byLeague.sport5).length;
  const s5Only = rows.filter((r) => r.byLeague.sport5 && !r.byLeague.euroleague).length;

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-[1180px] px-6 py-10 pb-16 sm:px-8">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b-[3px] border-[var(--text)] pb-[22px]">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold uppercase leading-[0.92] tracking-[0.01em] text-balance">
              Courtside Ledger
            </h1>
            <p className="mt-1.5 max-w-[46ch] text-[0.95rem] text-[var(--text-dim)]">
              One sheet, two fantasy games — every tracked Euroleague player&apos;s price and
              position, official Fantasy Challenge next to Sport5 Fantasy.
            </p>
            <div className="mt-2.5 flex gap-4 font-[family-name:var(--font-mono)] text-[0.72rem] uppercase tracking-[0.05em]">
              <span className="flex items-center gap-1.5 text-[var(--text-dim)]">
                <span className="inline-block h-[9px] w-[9px] rounded-sm bg-[var(--accent-el)]" />
                Euroleague Fantasy Challenge
              </span>
              <span className="flex items-center gap-1.5 text-[var(--text-dim)]">
                <span className="inline-block h-[9px] w-[9px] rounded-sm bg-[var(--accent-s5)]" />
                Sport5 Euroleague Fantasy
              </span>
            </div>
          </div>
          <div className="text-right font-[family-name:var(--font-mono)] text-[0.78rem] leading-[1.6] text-[var(--text-faint)]">
            EL PRICES UPDATED{" "}
            <strong className="font-semibold text-[var(--text-dim)]">
              {formatDate(data.updatedAt.euroleague)}
            </strong>
            <br />
            S5 PRICES UPDATED{" "}
            <strong className="font-semibold text-[var(--text-dim)]">
              {formatDate(data.updatedAt.sport5)}
            </strong>
          </div>
        </header>

        <section className="mb-7 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--border)] shadow-[var(--shadow)] sm:grid-cols-5">
          <StatTile label="Tracked players" value={total} />
          <StatTile label="Clubs" value={teams} />
          <StatTile label="Priced in both games" value={linked} />
          <StatTile label="Euroleague only" value={elOnly} tone="el" />
          <StatTile label="Sport5 only" value={s5Only} tone="s5" />
        </section>

        {total === 0 ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-dim)]">
            No player data yet. Import a CSV/XLSX/JSON export with:
            <pre className="mt-3 overflow-x-auto rounded bg-[var(--surface-2)] p-3 font-[family-name:var(--font-mono)] text-sm">
              npm run import -- --league euroleague --file ./incoming/euroleague.json{"\n"}
              npm run import -- --league sport5 --file ./incoming/sport5.json
            </pre>
          </div>
        ) : (
          <PlayersTable rows={rows} />
        )}

        <p className="mt-4 max-w-[70ch] text-[0.78rem] leading-[1.6] text-[var(--text-faint)]">
          {linked} players have been matched across both leagues by club + shirt number; the rest
          are one-league-only until the next cross-referenced import. Positions: G guard, F
          forward, C center, HC head coach (Sport5 prices its coaching staff too).
        </p>
      </div>
    </main>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "el" | "s5";
}) {
  const numColor =
    tone === "el" ? "text-[var(--accent-el)]" : tone === "s5" ? "text-[var(--accent-s5)]" : "text-[var(--text)]";
  return (
    <div className="flex flex-col gap-1 bg-[var(--surface)] px-[18px] py-4">
      <span
        className={`font-[family-name:var(--font-mono)] text-[1.9rem] leading-none font-semibold tabular-nums ${numColor}`}
      >
        {value}
      </span>
      <span className="text-[0.72rem] uppercase tracking-[0.06em] text-[var(--text-faint)]">{label}</span>
    </div>
  );
}
