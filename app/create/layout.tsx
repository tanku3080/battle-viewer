import type { Metadata } from "next";
import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export const metadata: Metadata = {
  title: "Battle Viewer | Creator",
  description: "Create and edit Battle JSON.",
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
