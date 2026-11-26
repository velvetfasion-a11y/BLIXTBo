"use client";

import type { CSSProperties } from "react";
import { LandlordMark } from "@/components/landlord-logo";
import { landlordRoster, type LandlordBrand } from "@/lib/landlord-logos";

const STYLE = `
@keyframes landlord-marquee {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}
@keyframes landlord-rise {
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
.landlord-track {
  animation: landlord-marquee var(--landlord-dur, 68s) linear infinite;
  will-change: transform;
}
.landlord-track[data-dir="back"] {
  animation-direction: reverse;
}
.landlord-row {
  animation: landlord-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .landlord-track,
  .landlord-row {
    animation: none !important;
    transform: none !important;
    will-change: auto;
  }
}
`;

function rowsOf(items: LandlordBrand[], count: number) {
  const rows: LandlordBrand[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => {
    rows[index % count]?.push(item);
  });
  return rows;
}

function Pill({ item, labelled }: { item: LandlordBrand; labelled: boolean }) {
  return (
    <span className="mx-2 inline-flex h-14 w-[8.75rem] shrink-0 items-center justify-center rounded-2xl bg-white px-3.5 shadow-[0_10px_28px_rgba(28,25,22,0.06)] ring-1 ring-[#1c1916]/[0.05] sm:mx-2.5 sm:h-16 sm:w-40 sm:px-4">
      <LandlordMark id={item.id} name={item.name} labelled={labelled} className="max-h-7 sm:max-h-8" />
    </span>
  );
}

function MarqueeRow({
  items,
  reverse,
  duration,
  delay,
}: {
  items: LandlordBrand[];
  reverse: boolean;
  duration: string;
  delay: string;
}) {
  const half = [...items, ...items];
  const track = [...half, ...half];
  return (
    <div
      className="landlord-row overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)]"
      style={{ animationDelay: delay }}
    >
      <div
        className="landlord-track flex w-max py-1.5"
        data-dir={reverse ? "back" : "forward"}
        style={{ "--landlord-dur": duration } as CSSProperties}
      >
        {track.map((item, index) => (
          <Pill key={`${item.id}-${index}`} item={item} labelled={index < items.length} />
        ))}
      </div>
    </div>
  );
}

function Rows({ items, count }: { items: LandlordBrand[]; count: number }) {
  const durations = ["72s", "88s", "64s"];
  return (
    <div className="flex flex-col gap-1">
      {rowsOf(items, count).filter((row) => row.length > 0).map((row, index) => (
        <MarqueeRow
          key={`${count}-${index}`}
          items={row}
          reverse={index % 2 === 1}
          duration={durations[index] ?? "76s"}
          delay={`${index * 0.14}s`}
        />
      ))}
    </div>
  );
}

export function LandlordLogoCloud() {
  const items = landlordRoster();
  return (
    <section aria-label="Hyresvärdar och bostadsköer" className="select-none">
      <style>{STYLE}</style>
      <ul className="hidden flex-wrap justify-start gap-3 motion-reduce:flex">
        {items.map((item) => (
          <li key={item.id}>
            <Pill item={item} labelled />
          </li>
        ))}
      </ul>
      <div className="motion-reduce:hidden">
        <div className="lg:hidden">
          <Rows items={items} count={2} />
        </div>
        <div className="hidden lg:block">
          <Rows items={items} count={3} />
        </div>
      </div>
    </section>
  );
}
