import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BattleHubAccessButton } from "@/components/battleHub/BattleHubAccessButton";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-between px-4 py-10 bg-[#0b1020] text-[#f5f5f5]">
      <header className="w-full max-w-4xl mt-4">
        <div className="flex justify-end mb-8">
          <LogoutButton />
        </div>
        <div className="text-center">
        <h1 className="text-4xl font-semibold mb-2">
          戦場タイムライン・ビューワ
        </h1>
        <p className="opacity-70">Battle Timeline Visualizer</p>
        </div>
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

        <BattleHubAccessButton className="px-8 py-3 font-semibold" />
      </section>

      <footer className="text-xs opacity-60 mb-4">
        © {new Date().getFullYear()} 戦況オタク製作所
      </footer>
    </main>
  );
}
