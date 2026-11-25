import { Suspense } from "react";
import { AdminShell } from "@/components/admin";
import { Boot } from "@/components/boot";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Boot />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
