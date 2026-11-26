import type { Metadata } from "next";
import { BankId } from "@/components/bankid";

export const metadata: Metadata = {
  robots: { index: false },
  alternates: { canonical: "/bankid" },
};

export default function Page() {
  return <BankId />;
}
