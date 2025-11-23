// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "40px 16px",
        background: "#0b1020",
        color: "#f5f5f5",
      }}
    >
      <header style={{ textAlign: "center", marginTop: 40 }}>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>
          戦場タイムライン・ビューワ
        </h1>
        <p style={{ opacity: 0.7 }}>Battle Timeline Visualizer</p>
      </header>

      <section style={{ textAlign: "center" }}>
        <Link
          href="/battle"
          style={{
            padding: "12px 32px",
            background: "#2f6bff",
            borderRadius: 8,
            textDecoration: "none",
            color: "white",
            fontWeight: 600,
          }}
        >
          戦場クリエイト
        </Link>
      </section>

      <footer style={{ fontSize: 12, opacity: 0.6, marginBottom: 16 }}>
        © {new Date().getFullYear()} 戦況オタク製作所
      </footer>
    </main>
  );
}
