import Link from "next/link";

export function SiteFooter({ flush = false }: { flush?: boolean }) {
  return (
    <footer className={flush ? "mt-10 border-t border-line py-5 text-sm text-soft" : "border-t border-line px-6 py-5 text-sm text-soft"}>
      <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
        <p>Blixtbo</p>
        <div className="flex items-center gap-4">
          <Link href="/guider" className="font-medium text-ink">
            Guider
          </Link>
          <Link href="/hjalp" className="font-medium text-ink">
            Hjälp
          </Link>
        </div>
      </div>
    </footer>
  );
}
