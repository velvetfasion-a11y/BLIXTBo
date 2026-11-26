"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Boot } from "@/components/boot";
import { SignIn } from "@/components/sign-in";
import { useStore } from "@/lib/store";

export function Account() {
  const store = useStore();
  const router = useRouter();
  const signedInOnArrival = useRef<boolean | null>(null);

  useEffect(() => {
    if (!store.ready) return;
    if (signedInOnArrival.current === null) signedInOnArrival.current = Boolean(store.user);
    if (signedInOnArrival.current && store.user) router.replace("/hem");
  }, [store.ready, store.user, router]);

  if (!store.ready || store.user) return <Boot />;

  return (
    <div className="min-h-dvh bg-paper px-4 py-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[400px] flex-col justify-center">
        <SignIn variant="page" />
      </div>
    </div>
  );
}
