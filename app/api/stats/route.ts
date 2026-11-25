import { NextResponse } from "next/server";

export async function GET() {
  const api = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080";
  const secret = process.env.APP_SECRET || "dev-only-change-me";
  try {
    const response = await fetch(`${api.replace(/\/$/, "")}/internal/ops/stats`, {
      headers: { "X-Blixtbo-Stats": secret },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ source: "unavailable", umami: false, visitorsPerDay: null, registrationsPerDay: [], payingCustomers: null, revenue: null, events: [] });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ source: "unavailable", umami: false, visitorsPerDay: null, registrationsPerDay: [], payingCustomers: null, revenue: null, events: [] });
  }
}
