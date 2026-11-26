import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/mark";

export const metadata: Metadata = {
  title: "Sidan finns inte",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-6 py-16">
      <div className="w-full max-w-md">
        <Wordmark />
        <h1 className="mt-10 font-serif text-4xl tracking-[-0.03em]">Sidan finns inte</h1>
        <p className="mt-3 text-sm leading-relaxed text-soft">Adressen leder ingenstans. Gå tillbaka till startsidan.</p>
        <Link href="/" className="mt-6 inline-flex text-sm font-medium text-pine">
          Till startsidan
        </Link>
      </div>
    </div>
  );
}
