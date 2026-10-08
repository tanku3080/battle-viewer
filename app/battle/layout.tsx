import type { Metadata } from "next";
import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export const metadata: Metadata = {
  title: "Battle Viewer | Viewer",
  description: "View and play a Battle JSON timeline.",
};

export default function BattleLayout({ children }: { children: React.ReactNode }) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
