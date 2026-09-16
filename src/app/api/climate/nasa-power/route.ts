import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finite(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`nasa-power:${ip}`, 12, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const url = new URL(request.url);
  const latitude = finite(url.searchParams.get("latitude"));
  const longitude = finite(url.searchParams.get("longitude"));
  const year = Number(url.searchParams.get("year") || "2025");
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || !Number.isInteger(year) || year < 2001 || year > new Date().getUTCFullYear() - 1) {
    return NextResponse.json({ error: "Valid coordinates and a complete historical year are required." }, { status: 400 });
  }

  const endpoint = new URL("https://power.larc.nasa.gov/api/temporal/hourly/point");
  endpoint.searchParams.set("parameters", "T2M,ALLSKY_SFC_SW_DWN");
  endpoint.searchParams.set("community", "SB");
  endpoint.searchParams.set("longitude", longitude.toFixed(4));
  endpoint.searchParams.set("latitude", latitude.toFixed(4));
  endpoint.searchParams.set("start", `${year}0101`);
  endpoint.searchParams.set("end", `${year}1231`);
  endpoint.searchParams.set("format", "JSON");
  endpoint.searchParams.set("time-standard", "LST");

  try {
    const response = await fetch(endpoint, { next: { revalidate: 86400 } });
    if (!response.ok) return NextResponse.json({ error: `NASA POWER returned HTTP ${response.status}.` }, { status: 502 });
    const payload = await response.json() as {
      properties?: {
        parameter?: {
          T2M?: Record<string, number>;
          ALLSKY_SFC_SW_DWN?: Record<string, number>;
        };
      };
    };
    const temperatures = payload.properties?.parameter?.T2M || {};
    const solar = payload.properties?.parameter?.ALLSKY_SFC_SW_DWN || {};
    const timestamps = Object.keys(temperatures).sort();
    const series = timestamps.map((timestamp) => {
      const temperatureC = Number(temperatures[timestamp]);
      const solarKWhM2 = Number(solar[timestamp]);
      if (!Number.isFinite(temperatureC)) return null;
      return { timestamp, outdoorTempC: temperatureC, solarIrradianceKWhM2: Number.isFinite(solarKWhM2) && solarKWhM2 >= 0 ? solarKWhM2 : 0 };
    }).filter((item): item is { timestamp: string; outdoorTempC: number; solarIrradianceKWhM2: number } => Boolean(item));

    if (series.length < 8000) return NextResponse.json({ error: "NASA POWER returned an incomplete annual series." }, { status: 502 });
    return NextResponse.json({ source: "NASA POWER Hourly Sustainable Buildings", year, latitude, longitude, timeStandard: "LST", series });
  } catch (error) {
    console.error("NASA POWER request failed", error);
    return NextResponse.json({ error: "NASA POWER could not be reached." }, { status: 502 });
  }
}
