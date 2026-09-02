import { getMergedPlayers } from "@/lib/data/merge";
import { LEAGUE_LABELS } from "@/lib/data/types";
import PlayersTable from "./players-table";

export const dynamic = "force-dynamic";

export default function PlayersPage() {
  const data = getMergedPlayers();
  const hasAnyData = data.rows.length > 0;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold">Euroleague Fantasy Players</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {LEAGUE_LABELS.euroleague} last updated:{" "}
          {formatDate(data.updatedAt.euroleague)} · {LEAGUE_LABELS.sport5} last updated:{" "}
          {formatDate(data.updatedAt.sport5)}
        </p>

        {!hasAnyData ? (
          <div className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-300">
            No player data yet. Import a CSV/XLSX file with:
            <pre className="mt-3 overflow-x-auto rounded bg-black p-3 text-sm text-neutral-200">
              npm run import -- --league euroleague --file ./incoming/players.csv{"\n"}
              npm run import -- --league sport5 --file ./incoming/players.xlsx
            </pre>
          </div>
        ) : (
          <PlayersTable rows={data.rows} />
        )}
      </div>
    </main>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (d.getTime() === 0) return "never";
  return d.toLocaleString();
}
