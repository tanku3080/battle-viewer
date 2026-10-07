import type { Metadata } from "next";
import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export const metadata: Metadata = {
  title: "Battle Viewer | 作成",
  description: "Battle JSONを作成・編集します。",
};

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
