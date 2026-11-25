"use client";

import { useCallback, useContext, useEffect, useState, createContext } from "react";

type LocationState = { path: string; query: string };

function readLocation(): LocationState {
  const raw = (window.location.hash || "#/").replace(/^#/, "");
  const split = raw.indexOf("?");
  const pathPart = (split === -1 ? raw : raw.slice(0, split)) || "/";
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return { path, query: split === -1 ? "" : raw.slice(split + 1) };
}

const LocationContext = createContext<LocationState>({ path: "/", query: "" });

export function HashRouter({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<LocationState>(readLocation);

  useEffect(() => {
    const sync = () => setLocation(readLocation());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return <LocationContext.Provider value={location}>{children}</LocationContext.Provider>;
}

export function usePathname() {
  return useContext(LocationContext).path;
}

export function useSearchParams() {
  const { query } = useContext(LocationContext);
  return new URLSearchParams(query);
}

function navigate(href: string, mode: "push" | "replace") {
  const bare = href.startsWith("#") ? href.slice(1) : href;
  const hash = bare.startsWith("/") ? bare : `/${bare}`;
  const next = `#${hash}`;
  if (window.location.hash === next) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  if (mode === "replace") {
    window.history.replaceState(null, "", next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = hash;
}

export function useRouter() {
  const push = useCallback((href: string) => navigate(href, "push"), []);
  const replace = useCallback((href: string) => navigate(href, "replace"), []);
  const back = useCallback(() => window.history.back(), []);
  return { push, replace, back };
}

export default function Link({
  href,
  children,
  className,
  onClick,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...rest}
      href={`#${href.startsWith("/") ? href : `/${href}`}`}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        navigate(href, "push");
      }}
    >
      {children}
    </a>
  );
}
