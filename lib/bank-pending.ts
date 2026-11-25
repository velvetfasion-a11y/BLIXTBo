"use client";

import { useSyncExternalStore } from "react";

type Pending = { name: string; email: string };

let pending: Pending | null = null;
const listeners = new Set<() => void>();

export function setBankPending(value: Pending | null) {
  pending = value;
  listeners.forEach((listener) => listener());
}

export function useBankPending() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => null,
  );
}
