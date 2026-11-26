import type { Metadata } from "next";
import { Help } from "@/components/help";

export const metadata: Metadata = {
  title: "Hjälp · Blixtbo",
  description: "Så fungerar Blixtbo, betalning, avslut och radering av uppgifter.",
};

export default function Page() {
  return <Help />;
}
