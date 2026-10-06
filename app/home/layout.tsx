import { AuthActivityGuard } from "@/components/auth/AuthActivityGuard";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthActivityGuard>{children}</AuthActivityGuard>;
}
