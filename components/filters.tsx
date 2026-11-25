"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { IconChevron } from "@/components/icons";
import { Button, cx } from "@/components/ui";
import { kr } from "@/lib/format";
import { CITIES, passesFilters } from "@/lib/profile";
import { useStore } from "@/lib/store";

const ROOMS = [
  { id: "any", label: "Alla" },
  { id: "1", label: "1" },
  { id: "2", label: "2" },
  { id: "3", label: "3" },
  { id: "4", label: "4" },
  { id: "5+", label: "5+" },
] as const;

const SIZES = [0, 35, 45, 60, 75];

export function Filters() {
  const store = useStore();
  const router = useRouter();

  useEffect(() => {
    document.title = "Filter · Blixtbo";
  }, []);

  const count = useMemo(() => {
    const applied = new Set(store.applications.map((item) => item.listingId));
    return store.listings.filter(
      (listing) => passesFilters(listing, store.filters, store.sources) && !applied.has(listing.id) && !store.dismissed.includes(listing.id),
    ).length;
  }, [store.applications, store.dismissed, store.filters, store.listings, store.sources]);

  const filters = store.filters;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-3xl flex-col px-5 py-5 md:px-8 md:py-8">
      <Link href="/hem" className="inline-flex items-center gap-1 text-sm text-soft">
        <IconChevron className="h-4 w-4" />
        Flödet
      </Link>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-[-0.03em]">Filter</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-soft">
            Bara bostäder som klarar det här visas. Bevakningen använder samma urval när något nytt publiceras.
          </p>
        </div>
        <button type="button" className="text-sm text-soft" onClick={() => store.clearFilters()}>
          Rensa
        </button>
      </div>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="text-sm font-medium">Områden</h2>
          <p className="mt-1 text-sm text-soft">Tomt urval betyder alla städer.</p>
          <div className="mt-4 space-y-5">
            {CITIES.map((city) => {
              const allOn = city.areas.every((area) => filters.areas.includes(area));
              return (
                <div key={city.city}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-soft">{city.city}</p>
                    <button type="button" className="text-sm font-medium" onClick={() => store.setCityAreas(city.areas, !allOn)}>
                      {allOn ? "Avmarkera" : "Alla"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {city.areas.map((area) => {
                      const on = filters.areas.includes(area);
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => store.toggleArea(area)}
                          className={cx("rounded-full px-3 py-2 text-sm", on ? "bg-ink text-paper" : "bg-card text-ink ring-1 ring-line")}
                        >
                          {area}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">Högsta hyra</h2>
            <p className="num text-sm font-medium">{kr(filters.maxRent)} / mån</p>
          </div>
          <input
            type="range"
            min={5000}
            max={20000}
            step={250}
            value={filters.maxRent}
            onChange={(event) => store.setFilters({ maxRent: Number(event.target.value) })}
            className="mt-4 w-full accent-ink"
            aria-label="Högsta hyra"
          />
          <div className="mt-1 flex justify-between text-xs text-faint">
            <span>5 000 kr</span>
            <span>20 000 kr</span>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium">Rum</h2>
          <div className="mt-3 grid grid-cols-6 gap-2">
            {ROOMS.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => store.setFilters({ rooms: room.id })}
                className={cx("h-11 rounded-2xl text-sm", filters.rooms === room.id ? "bg-ink text-paper" : "bg-card ring-1 ring-line")}
              >
                {room.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium">Minsta storlek</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => store.setFilters({ minSqm: size })}
                className={cx("rounded-full px-3 py-2 text-sm", filters.minSqm === size ? "bg-ink text-paper" : "bg-card ring-1 ring-line")}
              >
                {size === 0 ? "Alla" : `${size} m²`}
              </button>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Lägst våning</h2>
            <p className="text-sm text-soft">{filters.minFloor === 0 ? "Ingen begränsning" : `Våning ${filters.minFloor} eller högre`}</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-paper-deep" onClick={() => store.setFilters({ minFloor: Math.max(0, filters.minFloor - 1) })} aria-label="Lägre våning">
              −
            </button>
            <span className="num w-4 text-center">{filters.minFloor}</span>
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-ink text-paper" onClick={() => store.setFilters({ minFloor: Math.min(12, filters.minFloor + 1) })} aria-label="Högre våning">
              +
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium">Inflytt senast</h2>
          <p className="mt-1 text-sm text-soft">Döljer bostäder som blir lediga efter datumet.</p>
          <input
            type="date"
            value={filters.moveIn}
            onChange={(event) => store.setFilters({ moveIn: event.target.value })}
            className="mt-3 h-12 w-full rounded-2xl border border-line bg-card px-4"
          />
        </section>
      </div>

      <div className="mt-8 pb-2">
        <Button size="lg" className="w-full" onClick={() => router.push("/hem")}>
          Visa {count} {count === 1 ? "bostad" : "bostäder"}
        </Button>
      </div>
    </div>
  );
}
