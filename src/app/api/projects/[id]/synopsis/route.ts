import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateSynopsis } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!project) {
      return NextResponse.json({ error: "រកមិនឃើញគម្រោង" }, { status: 404 });
    }
    if (project.status !== "READY") {
      return NextResponse.json({ error: "ការបកប្រែមិនទាន់រួចរាល់នៅឡើយទេ" }, { status: 400 });
    }
    const synopsis = await generateSynopsis(db, id);
    return NextResponse.json({ synopsis });
  } catch (err) {
    console.error("[api/projects/:id/synopsis] failed:", err);
    return NextResponse.json({ error: "មិនអាចបង្កើតសេចក្តីសង្ខេបបានទេ សូមព្យាយាមម្តងទៀត" }, { status: 500 });
  }
}
