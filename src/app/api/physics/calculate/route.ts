import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { physicsRunInputSchema } from "@/lib/physics/validation";
import { runPhysics } from "@/lib/physics/run";
import type { PhysicsRunInput } from "@/lib/physics/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`physics:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = physicsRunInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid physics input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const input: PhysicsRunInput & { volumeM3?: number } = {
      indoorTempC: data.indoorTempC,
      outdoorTempC: data.outdoorTempC,
      outdoorTempSource: data.outdoorTempSource,
      surfaces: data.surfaces,
      ventilation: data.ventilation,
      solar: data.solar,
      hvac: data.hvac,
      mode: data.mode,
      volumeM3: data.volumeM3,
    };

    const result = runPhysics(input);
    return NextResponse.json({ result, meta: { deterministic: true, phase: 4 } });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Physics calculation failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
