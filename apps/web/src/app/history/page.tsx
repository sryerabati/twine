import { AuthGate } from "@/components/auth/auth-gate";
import { BrandShell } from "@/components/brand-shell";
import { HistoryView } from "@/components/history/history-view";

export default function HistoryPage() {
  return (
    <BrandShell>
      <AuthGate>
        <HistoryView />
      </AuthGate>
    </BrandShell>
  );
}
