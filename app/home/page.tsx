import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-between px-4 py-10 bg-[#0b1020] text-[#f5f5f5]">
      <header className="text-center mt-10">
        <h1 className="text-4xl font-semibold mb-2">
          戦場タイムライン・ビューワ
        </h1>
        <p className="opacity-70">Battle Timeline Visualizer</p>
      </header>

      <section className="flex flex-col gap-4 text-center">
        <Link
          href="/battle"
          className="px-8 py-3 bg-blue-600 rounded-lg text-white font-semibold hover:bg-blue-700"
        >
          閲覧
        </Link>

        <Link
          href="/create"
          className="px-8 py-3 bg-violet-600 rounded-lg text-white font-semibold hover:bg-violet-700"
        >
          作成
        </Link>
      </section>

      <footer className="text-xs opacity-60 mb-4">
        © {new Date().getFullYear()} 戦況オタク製作所
      </footer>
    </main>
  );
}
