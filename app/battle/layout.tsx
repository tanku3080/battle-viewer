import type { Metadata } from "next";
import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export const metadata: Metadata = {
  title: "Battle Viewer | 閲覧",
  description: "Battle JSONを時系列で閲覧します。",
};

export default function BattleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
