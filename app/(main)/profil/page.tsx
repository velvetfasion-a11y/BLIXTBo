import { Suspense } from "react";
import { Boot } from "@/components/boot";
import { Profile } from "@/components/profile";

export default function Page() {
  return (
    <Suspense fallback={<Boot />}>
      <Profile />
    </Suspense>
  );
}
