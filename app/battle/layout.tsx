import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export default function BattleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
