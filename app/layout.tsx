import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_JP } from "next/font/google";
import { I18nProvider } from "@/i18n/I18nProvider";
import { TauriWindowChrome } from "@/components/tauri/TauriWindowChrome";
import { VersionGate } from "@/components/tauri/VersionGate";
import { P2pReplicationWorker } from "@/components/p2p/P2pReplicationWorker";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Battle Viewer",
  description: "Battle timeline viewer and creator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${notoSansJp.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider>
          <TauriWindowChrome />
          <VersionGate />
          <P2pReplicationWorker />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
