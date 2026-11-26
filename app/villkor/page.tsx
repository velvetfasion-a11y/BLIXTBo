import type { Metadata } from "next";
import { Terms } from "@/components/terms";

const description = "Köpvillkor för Blixtbo Premium: pris, uppsägning, ångerrätt och återbetalning.";

export const metadata: Metadata = {
  title: "Villkor",
  description,
  alternates: { canonical: "/villkor" },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Blixtbo",
    url: "/villkor",
    title: "Villkor | Blixtbo",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Villkor | Blixtbo",
    description,
  },
};

export default function Page() {
  return <Terms />;
}
