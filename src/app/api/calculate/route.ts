import { NextResponse } from "next/server";
import { fetchCurrentClimate, fetchFutureClimate2035 } from "@/lib/climate";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { runPipeline, compareRankingOrders } from "@/lib/calculations/pipeline";
import { wizardInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`calculate:${ip}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = wizardInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const [todayClimate, futureClimate] = await Promise.all([
      fetchCurrentClimate(input.latitude, input.longitude),
      fetchFutureClimate2035(input.latitude, input.longitude),
    ]);

    const today = runPipeline(input, todayClimate);
    const future = runPipeline(input, futureClimate);
    const comparison = compareRankingOrders(today.actions, future.actions);

    return NextResponse.json({
      today,
      future,
      comparison,
      meta: {
        noML: true,
        engine: "deterministic-physics",
        rateLimitRemaining: rl.remaining,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Calculation failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
