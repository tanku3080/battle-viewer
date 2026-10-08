import type { Metadata } from "next";
import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export const metadata: Metadata = {
  title: "Battle Viewer | Home",
  description: "Battle Viewer home screen.",
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
