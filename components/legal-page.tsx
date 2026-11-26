import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { Wordmark } from "@/components/mark";

export function LegalPage({
  kicker,
  title,
  intro,
  children,
}: {
  kicker: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto w-full max-w-xl px-5 py-8 md:px-8 md:py-12">
        <Wordmark />
        <p className="mt-8 text-sm font-medium text-pine">{kicker}</p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-soft">{intro}</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
          <Link href="/" className="text-pine">
            Till start
          </Link>
          <Link href="/installningar" className="text-pine">
            Till inställningar
          </Link>
        </div>
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl tracking-[-0.03em]">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-soft">{children}</div>
    </section>
  );
}
