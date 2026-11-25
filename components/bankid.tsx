"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Boot } from "@/components/boot";

export function BankId() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/konto");
  }, [router]);
  return <Boot />;
}
