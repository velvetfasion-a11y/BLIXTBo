import { LandlordLogo } from "@/components/landlord-logo";

export function SourceMark({ id, name, size = 52 }: { id: string; name: string; size?: number }) {
  return <LandlordLogo id={id} name={name} size={size} />;
}
