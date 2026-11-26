"use client";

import { useEffect, useState, type ComponentType } from "react";

function SignInPlaceholder() {
  return (
    <div className="min-h-48" aria-busy="true">
      <p className="text-sm text-soft" role="status">
        Laddar inloggning…
      </p>
      <div className="mt-3 flex flex-col gap-3" aria-hidden>
        <div className="h-12 rounded-full border border-line bg-white" />
        <div className="h-12 rounded-full border border-line bg-white" />
      </div>
    </div>
  );
}

function afterWindowLoad(run: () => void) {
  if (document.readyState === "complete") {
    run();
    return () => undefined;
  }
  window.addEventListener("load", run, { once: true });
  return () => window.removeEventListener("load", run);
}

/** Sign-in pulls in Firebase. Load it after the window load so it does not compete with the first paint. */
export function LandingSignIn() {
  const [SignIn, setSignIn] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cancelLoad = afterWindowLoad(() => {
      void import("@/components/sign-in").then((mod) => {
        if (!cancelled) setSignIn(() => mod.SignIn);
      });
    });
    return () => {
      cancelled = true;
      cancelLoad();
    };
  }, []);

  if (!SignIn) return <SignInPlaceholder />;
  return <SignIn />;
}
