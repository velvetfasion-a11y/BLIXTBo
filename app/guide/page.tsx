import type { Metadata } from "next";
import { Wizard } from "@/components/wizard";

export const metadata: Metadata = {
  robots: { index: false },
  alternates: { canonical: "/guide" },
};

export default function Page() {
  return <Wizard />;
}
