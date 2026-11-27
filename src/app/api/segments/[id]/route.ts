import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { khmerText?: unknown };
    if (typeof body.khmerText !== "string") {
      return NextResponse.json({ error: "អត្ថបទខ្មែរមិនត្រឹមត្រូវ" }, { status: 400 });
    }
    const segment = await db.segment.update({
      where: { id },
      data: { khmerText: body.khmerText.trim() },
    });
    return NextResponse.json({ segment });
  } catch (err) {
    console.error("[api/segments/:id] patch failed:", err);
    return NextResponse.json({ error: "មិនអាចរក្សាទុកការកែប្រែបានទេ" }, { status: 500 });
  }
}
