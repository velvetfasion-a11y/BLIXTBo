import { LandlordMark } from "@/components/landlord-logo";
import { landlordRoster } from "@/lib/landlord-logos";

/** Every landlord and queue Blixtbo watches, with the name always visible. */
export function LandlordBoard() {
  const items = landlordRoster();

  return (
    <section aria-labelledby="hyresvardar" className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="hyresvardar" className="text-sm font-semibold tracking-tight text-ink">
          Hyresvärdar och köer vi bevakar
        </h2>
        <p className="num text-sm text-soft">{items.length}</p>
      </div>
      <p className="mt-1 text-sm leading-5 text-soft">
        Hela listan syns här. Blixtbo äger inga lägenheter och skriver inga kontrakt.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-2 py-1.5"
          >
            <span className="grid h-7 w-9 shrink-0 place-items-center">
              <LandlordMark id={item.id} name={item.name} labelled={false} className="max-h-6 max-w-9 object-contain" />
            </span>
            <span className="min-w-0 text-xs font-medium leading-tight text-ink hyphens-auto md:text-[13px]">{item.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
