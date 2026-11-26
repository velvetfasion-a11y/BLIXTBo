import type { Metadata } from "next";
import { Account } from "@/components/account";

export const metadata: Metadata = {
  robots: { index: false },
  alternates: { canonical: "/konto" },
};

export default function Page() {
  return <Account />;
}
