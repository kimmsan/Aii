import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { retranslateSegment } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const khmerText = await retranslateSegment(db, id);
    return NextResponse.json({ khmerText });
  } catch (err) {
    console.error("[api/segments/:id/retranslate] failed:", err);
    return NextResponse.json({ error: "ការបកប្រែឡើងវិញបរាជ័យ សូមព្យាយាមម្តងទៀត" }, { status: 500 });
  }
}
