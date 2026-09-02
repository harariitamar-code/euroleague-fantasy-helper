import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
      <h1 className="text-3xl font-semibold">Euroleague Fantasy Helper</h1>
      <p className="mt-3 max-w-md text-neutral-400">
        Track players and prices for the official Euroleague Fantasy Challenge and
        Sport5 Euroleague Fantasy, and build the best possible squad for each.
      </p>
      <Link
        href="/players"
        className="mt-8 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-neutral-200"
      >
        View players
      </Link>
    </main>
  );
}
