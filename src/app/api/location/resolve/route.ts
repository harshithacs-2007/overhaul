import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { resolveLocationQuery } from "@/lib/engineering/geocode";
import { OpenMeteoClimateProvider } from "@/lib/engineering/openMeteoClimate";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  query: z.string().min(2).max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  countryCode: z.string().max(8).optional(),
  includeClimate: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`location-climate:${ip}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { query, includeClimate } = parsed.data;
    let latitude = parsed.data.latitude;
    let longitude = parsed.data.longitude;
    let countryCode = parsed.data.countryCode;
    let location = null;
    let alternatives: unknown[] = [];
    let geocodeError = null;

    if (query) {
      const geo = await resolveLocationQuery(query);
      if (!geo.ok) {
        if (latitude == null || longitude == null) {
          return NextResponse.json(
            { error: geo.error, message: geo.message, alternatives: geo.alternatives ?? [] },
            { status: geo.error === "not_found" ? 404 : 400 }
          );
        }
        geocodeError = geo;
      } else {
        location = geo.location;
        alternatives = geo.alternatives;
        latitude = geo.location.coordinates.latitude;
        longitude = geo.location.coordinates.longitude;
        countryCode = geo.location.countryCode ?? countryCode;
      }
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "invalid_query", message: "Provide query or latitude/longitude" },
        { status: 400 }
      );
    }

    let climate = null;
    if (includeClimate) {
      const provider = new OpenMeteoClimateProvider();
      climate = await provider.getClimateContext({
        latitude,
        longitude,
        countryCode,
      });
    }

    return NextResponse.json({
      location,
      alternatives,
      climate,
      geocodeError,
      meta: { noFabrication: true },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "provider_failure",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
