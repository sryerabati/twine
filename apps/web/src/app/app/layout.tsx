import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";

export default function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
