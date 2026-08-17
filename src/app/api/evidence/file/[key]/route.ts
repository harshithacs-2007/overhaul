import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { getEvidenceStorage } from "@/lib/evidence/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`evidence-file:${ip}`, 120, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { key: raw } = await ctx.params;
    const key = decodeURIComponent(raw);
    if (!key || key.includes("..") || key.includes("/") || key.includes("\\")) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    const storage = getEvidenceStorage();
    const found = await storage.get(key);
    if (!found) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(found.buffer), {
      status: 200,
      headers: {
        "Content-Type": found.meta.mimeType,
        "Content-Length": String(found.buffer.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${found.meta.originalFilename.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`evidence-delete:${ip}`, 40, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { key: raw } = await ctx.params;
    const key = decodeURIComponent(raw);
    if (!key || key.includes("..") || key.includes("/") || key.includes("\\")) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    const ok = await getEvidenceStorage().remove(key);
    return NextResponse.json({ removed: ok });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
