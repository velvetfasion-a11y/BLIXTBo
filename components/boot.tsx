import { Mark } from "@/components/mark";

export function Boot() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper">
      <div className="flex flex-col items-center gap-3">
        <Mark size={36} />
        <p className="text-sm tracking-[-0.02em] text-soft">Blixtbo</p>
      </div>
    </div>
  );
}
