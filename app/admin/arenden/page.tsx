import type { Metadata } from "next";
import { AdminCases } from "@/components/support-admin";

export const metadata: Metadata = {
  title: "Ärenden",
};

export default function Page() {
  return <AdminCases />;
}
