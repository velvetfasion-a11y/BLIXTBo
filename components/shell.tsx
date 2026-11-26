"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Boot } from "@/components/boot";
import { IconBell, IconHome, IconList, IconUser } from "@/components/icons";
import { Wordmark } from "@/components/mark";
import { cx } from "@/components/ui";
import { useStore } from "@/lib/store";

const TABS = [
  { href: "/hem", label: "Hem", icon: IconHome },
  { href: "/koll", label: "Koll", icon: IconList },
  { href: "/notiser", label: "Notiser", icon: IconBell },
  { href: "/profil", label: "Profil", icon: IconUser },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (store.ready && !store.user) router.replace("/");
  }, [store.ready, store.user, router]);

  if (!store.ready || !store.user) return <Boot />;

  const unread = store.notifications.filter((notice) => !notice.read).length;
  const sourcesOn = store.sources.filter((source) => source.enabled).length;

  return (
    <div className="min-h-dvh bg-paper md:pl-60">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-paper px-4 py-6 md:flex">
        <Link href="/hem" className="px-2">
          <Wordmark />
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {TABS.map((tab) => {
            const active = path === tab.href || path.startsWith(`${tab.href}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium",
                  active ? "bg-card text-ink shadow-[0_1px_2px_rgba(28,25,22,0.04)]" : "text-soft hover:bg-card/70 hover:text-ink",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1">{tab.label}</span>
                {tab.href === "/notiser" && unread > 0 ? (
                  <span className="num rounded-full bg-pine px-2 py-0.5 text-xs text-white">{unread}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <div className="rounded-2xl bg-card px-3 py-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="h-2 w-2 rounded-full bg-pine" />
              Bevakning på
            </p>
            <p className="mt-1 text-xs leading-relaxed text-soft">{sourcesOn} hyresvärdar bevakas just nu.</p>
          </div>
          <footer className="mt-4 px-3 pb-2">
            <Link href="/hjalp" className="text-sm font-medium text-soft hover:text-ink">
              Hjälp
            </Link>
          </footer>
        </div>
      </aside>
      <div className="pb-28 md:pb-0">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/92 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg justify-center pt-2">
          <Link href="/hjalp" className="text-xs font-medium text-soft">
            Hjälp
          </Link>
        </div>
        <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pt-1 pb-[max(0.55rem,env(safe-area-inset-bottom))]">
          {TABS.map((tab) => {
            const active = path === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cx("relative flex flex-col items-center gap-1 py-1 text-[11px]", active ? "text-ink" : "text-faint")}
              >
                <Icon className="h-6 w-6" />
                {tab.label}
                {tab.href === "/notiser" && unread > 0 ? (
                  <span className="absolute top-0 right-[calc(50%-18px)] h-2 w-2 rounded-full bg-pine" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
