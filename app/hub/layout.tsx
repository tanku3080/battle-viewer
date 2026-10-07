import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export default function HubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
