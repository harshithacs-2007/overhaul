import { NextResponse } from "next/server";
import {
  buildEvidencePerceptionPlan,
  type PerceptionEvidenceItem,
  type PerceptionSubject,
} from "@/lib/evidence/perception";

export const runtime = "nodejs";

function isSubject(value: unknown): value is PerceptionSubject {
  return value === "building" || value === "facility" || value === "equipment";
}

function isEvidenceItem(value: unknown): value is PerceptionEvidenceItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    (item.kind === "scan" || item.kind === "photo" || item.kind === "document") &&
    typeof item.name === "string" &&
    typeof item.type === "string" &&
    typeof item.size === "number" &&
    Number.isFinite(item.size)
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { subject?: unknown; evidence?: unknown };
    if (!isSubject(body.subject)) {
      return NextResponse.json({ error: "Invalid assessment subject" }, { status: 400 });
    }

    const evidence = Array.isArray(body.evidence) ? body.evidence.filter(isEvidenceItem) : [];
    const plan = buildEvidencePerceptionPlan(body.subject, evidence);
    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ error: "Evidence perception planning failed" }, { status: 500 });
  }
}
