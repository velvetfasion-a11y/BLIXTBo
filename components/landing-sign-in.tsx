"use client";

import { useEffect, useState, type ComponentType } from "react";
import { AuthCardSkeleton } from "@/components/auth-card";

function SignInPlaceholder() {
  return <AuthCardSkeleton />;
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
