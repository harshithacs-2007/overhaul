import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { simulateDatasetRecord } from "@/lib/engineering/datasetPhysics";
import type { BuildingState, EquipmentState } from "@/lib/engineering/physicsSimulation";
import type { NormalizedRecord } from "@/lib/data/types";

export const runtime = "nodejs";

type RequestBody = {
  subject: "building" | "facility" | "equipment";
  records: NormalizedRecord[];
  retrofit?: Partial<BuildingState> | Partial<EquipmentState>;
};

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`simulate-record:${ip}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });

    const body = (await req.json()) as RequestBody;
    if (!body || !["building", "facility", "equipment"].includes(body.subject)) {
      return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
    }
    if (!Array.isArray(body.records) || body.records.length === 0 || body.records.length > 2000) {
      return NextResponse.json({ error: "Provide between 1 and 2000 normalized records." }, { status: 400 });
    }

    const result = simulateDatasetRecord(
      body.records,
      body.subject,
      body.retrofit ?? {},
    );

    return NextResponse.json({
      result,
      meta: {
        engine: "deterministic-physics",
        source: "normalized-dataset-records",
        rateLimitRemaining: rl.remaining,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Simulation failed" },
      { status: 400 },
    );
  }
}
