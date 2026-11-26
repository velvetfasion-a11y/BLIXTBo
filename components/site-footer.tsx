import Link from "next/link";
import { COMPANY_NAME, ORG_NR, SUPPORT_EMAIL } from "@/lib/company";

const LINKS = [
  { href: "/villkor", label: "Villkor" },
  { href: "/integritet", label: "Integritet" },
  { href: "/hjalp", label: "Hjälp" },
] as const;

export function SiteFooter({ flush = false }: { flush?: boolean }) {
  return (
    <footer className={flush ? "mt-10 border-t border-line py-5 text-sm text-soft" : "border-t border-line px-6 py-5 text-sm text-soft"}>
      <div className="mx-auto flex max-w-xl flex-col gap-2">
        <p>Blixtbo drivs av {COMPANY_NAME}</p>
        {ORG_NR ? <p>Org.nr {ORG_NR}</p> : null}
        <p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-ink">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <nav aria-label="Om Blixtbo" className="flex flex-wrap gap-x-4 gap-y-2">
          {LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="font-medium text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
