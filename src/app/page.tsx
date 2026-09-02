import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center text-[var(--text)]">
      <span className="font-[family-name:var(--font-mono)] text-[0.72rem] uppercase tracking-[0.12em] text-[var(--text-faint)]">
        Euroleague Fantasy Helper
      </span>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(2.6rem,7vw,4.2rem)] font-extrabold uppercase leading-[0.92] tracking-[0.01em] text-balance">
        Courtside Ledger
      </h1>
      <p className="mt-4 max-w-md text-[var(--text-dim)]">
        Player prices and positions for the official Euroleague Fantasy Challenge and Sport5
        Euroleague Fantasy, side by side — so you can build the best possible squad for each.
      </p>
      <Link
        href="/players"
        className="mt-8 rounded-full bg-[var(--text)] px-6 py-3 text-sm font-semibold text-[var(--bg)] transition hover:opacity-85"
      >
        View the ledger
      </Link>
    </main>
  );
}
