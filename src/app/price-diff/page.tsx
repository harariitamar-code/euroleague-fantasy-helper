import { getMergedPlayers } from "@/lib/data/merge";
import { LEAGUE_LABELS } from "@/lib/data/types";
import PriceDiffTable from "./price-diff-table";

export const dynamic = "force-dynamic";

export default function PriceDiffPage() {
  const data = getMergedPlayers();

  const rows = data.rows
    .filter((r) => r.byLeague.euroleague && r.byLeague.sport5)
    .map((r) => {
      const el = r.byLeague.euroleague!.price;
      const s5 = r.byLeague.sport5!.price;
      return {
        id: r.id,
        name: r.name,
        nameHebrew: r.nameHebrew,
        team: r.team,
        priceEuroleague: el,
        priceSport5: s5,
        diff: el - s5,
      };
    });

  const hasAnyData = rows.length > 0;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">Price Gaps Between Games</h1>
          <a href="/players" className="text-sm text-neutral-400 underline hover:text-neutral-200">
            ← Back to all players
          </a>
        </div>
        <p className="mt-1 text-sm text-neutral-400">
          Players priced in both {LEAGUE_LABELS.euroleague} and {LEAGUE_LABELS.sport5}, ranked by
          how far apart their prices are. A big gap can mean a bargain in whichever game the
          player costs less.
        </p>

        {!hasAnyData ? (
          <div className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-300">
            No players with prices in both games yet. Import price sheets for both leagues first.
          </div>
        ) : (
          <PriceDiffTable rows={rows} />
        )}
      </div>
    </main>
  );
}
