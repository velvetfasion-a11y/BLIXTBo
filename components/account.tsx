"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Boot } from "@/components/boot";
import { IconChevron } from "@/components/icons";
import { SignIn } from "@/components/sign-in";
import { useStore } from "@/lib/store";

export function Account() {
  const store = useStore();
  const router = useRouter();
  const signedInOnArrival = useRef<boolean | null>(null);

  useEffect(() => {
    document.title = "Logga in · Blixtbo";
  }, []);

  useEffect(() => {
    if (!store.ready) return;
    if (signedInOnArrival.current === null) signedInOnArrival.current = Boolean(store.user);
    if (signedInOnArrival.current && store.user) router.replace("/hem");
  }, [store.ready, store.user, router]);

  if (!store.ready || store.user) return <Boot />;

  return (
    <div className="min-h-dvh bg-paper px-6 py-8 sm:px-10">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-soft">
          <IconChevron className="h-4 w-4" />
          Tillbaka
        </Link>
        <div className="enter mt-10">
          <p className="text-sm font-medium text-pine">Konto</p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Logga in</h1>
          <p className="mt-3 text-sm leading-relaxed text-soft">
            Ett konto räcker. Profilen återanvänds hos varje hyresvärd. Inget lösenord att komma ihåg.
          </p>
          <div className="mt-8">
            <SignIn />
          </div>
        </div>
      </div>
    </div>
  );
}
