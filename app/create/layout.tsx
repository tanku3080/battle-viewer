import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
