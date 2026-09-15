import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import type { NormalizedRecord } from "@/lib/data/types";
import type { BuildingState, EquipmentState } from "@/lib/engineering/physicsSimulation";
import { simulateBuildingRecord, simulateEquipmentRecord } from "@/lib/engineering/physicsAdapters";

export const runtime = "nodejs";

type SimulationPayload = {
  subject: "building" | "facility" | "equipment";
  record: NormalizedRecord;
  retrofit: Partial<BuildingState> | Partial<EquipmentState>;
};

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeRecord(record: unknown): NormalizedRecord | null {
  if (!record || typeof record !== "object") return null;
  const candidate = record as Partial<NormalizedRecord>;
  if (typeof candidate.datasetId !== "string" || !candidate.datasetId) return null;
  if (!candidate.variables || typeof candidate.variables !== "object") return null;
  return {
    datasetId: candidate.datasetId,
    sourceRow: validNumber(candidate.sourceRow) ? candidate.sourceRow : undefined,
    timestamp: typeof candidate.timestamp === "string" ? candidate.timestamp : undefined,
    location: candidate.location,
    subjectType: candidate.subjectType,
    variables: candidate.variables,
    provenance: Array.isArray(candidate.provenance)
      ? candidate.provenance.filter(
          (item) =>
            item &&
            typeof item === "object" &&
            typeof item.sourcePath === "string" &&
            ["measured", "provided", "inferred", "derived"].includes(item.confidence)
        )
      : [],
  };
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`simulate:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });

  try {
    const body = (await req.json()) as Partial<SimulationPayload>;
    if (body.subject !== "building" && body.subject !== "facility" && body.subject !== "equipment") {
      return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
    }
    const record = sanitizeRecord(body.record);
    if (!record || !body.retrofit || typeof body.retrofit !== "object") {
      return NextResponse.json({ error: "Invalid simulation payload" }, { status: 400 });
    }

    const result =
      body.subject === "equipment"
        ? simulateEquipmentRecord(record, body.retrofit as Partial<EquipmentState>)
        : simulateBuildingRecord(record, body.retrofit as Partial<BuildingState>);

    return NextResponse.json({
      result,
      meta: {
        engine: "deterministic-physics",
        subject: body.subject,
        rateLimitRemaining: rl.remaining,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Simulation failed", message: error instanceof Error ? error.message : "Unknown simulation error" },
      { status: 500 }
    );
  }
}
