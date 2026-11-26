"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Boot } from "@/components/boot";
import { Landing } from "@/components/landing";
import { SignIn } from "@/components/sign-in";
import { useStore } from "@/lib/store";

export function Welcome() {
  const store = useStore();
  const router = useRouter();
  const signedInOnArrival = useRef<boolean | null>(null);

  useEffect(() => {
    if (!store.ready) return;
    if (signedInOnArrival.current === null) signedInOnArrival.current = Boolean(store.user);
    if (signedInOnArrival.current && store.user) router.replace("/hem");
  }, [store.ready, store.user, router]);

  useEffect(() => {
    document.title = "Blixtbo";
  }, []);

  if (!store.ready || store.user) return <Boot />;

  return <Landing signIn={<SignIn />} />;
}
