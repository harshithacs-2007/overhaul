import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Location autocomplete via Open-Meteo Geocoding API (no API key).
 */
export async function GET(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`geocode:${ip}`, 40, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }
    if (q.length > 100) {
      return NextResponse.json({ error: "Query too long" }, { status: 400 });
    }

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) {
      return NextResponse.json({ results: [], error: "Geocoder unavailable" });
    }
    const json = (await res.json()) as {
      results?: Array<{
        id: number;
        name: string;
        latitude: number;
        longitude: number;
        country?: string;
        admin1?: string;
      }>;
    };

    const results = (json.results ?? []).map((r) => ({
      id: r.id,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      {
        results: [],
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }
    );
  }
}
