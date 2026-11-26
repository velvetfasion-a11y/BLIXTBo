import type { Metadata } from "next";
import { Suspense } from "react";
import { Boot } from "@/components/boot";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  robots: { index: false },
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Boot />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
