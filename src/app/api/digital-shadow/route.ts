import { NextResponse } from "next/server";
import {
  buildDigitalShadow,
  buildEquipmentExpectations,
  type ExpectedSignal,
  type ShadowObservation,
  type ShadowSubject,
} from "@/lib/engineering/digitalShadow";

export const runtime = "nodejs";

type RequestBody = {
  subject: ShadowSubject;
  observations?: ShadowObservation[];
  expectedSignals?: ExpectedSignal[];
  equipment?: {
    ratedCapacityKW?: number;
    expectedEfficiency?: number;
    expectedPowerKW?: number;
    toleranceRelative?: number;
  };
};

function isSubject(value: unknown): value is ShadowSubject {
  return value === "building" || value === "facility" || value === "equipment";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    if (!isSubject(body?.subject)) {
      return NextResponse.json({ error: "Invalid assessment subject" }, { status: 400 });
    }

    const observations = Array.isArray(body.observations) ? body.observations : [];
    const expectedSignals = Array.isArray(body.expectedSignals)
      ? body.expectedSignals
      : body.equipment
        ? buildEquipmentExpectations(body.equipment)
        : [];

    const result = buildDigitalShadow(body.subject, observations, expectedSignals);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: "Digital Shadow assessment failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
