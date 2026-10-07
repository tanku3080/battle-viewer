import type { Metadata } from "next";
import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export const metadata: Metadata = {
  title: "Battle Viewer | ホーム",
  description: "Battle Viewerのホーム画面です。",
};

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
