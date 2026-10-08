import type { Metadata } from "next";
import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export const metadata: Metadata = {
  title: "Battle Viewer | Battle Hub",
  description: "Browse battles published to Battle Hub.",
};

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
