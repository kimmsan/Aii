import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDubPipeline } from "@/lib/dubbing";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    // optional JSON body { voice?: string } — invalid values fall back to default
    let voice: unknown;
    try {
      const body = (await req.json()) as { voice?: unknown };
      voice = body?.voice;
    } catch {
      voice = undefined;
    }
    const project = await db.project.findUnique({
      where: { id },
      include: { segments: { where: { khmerText: { not: "" } }, select: { id: true } } },
    });
    if (!project) {
      return NextResponse.json({ error: "រកមិនឃើញគម្រោង" }, { status: 404 });
    }
    if (project.status !== "READY") {
      return NextResponse.json({ error: "ការបកប្រែមិនទាន់រួចរាល់នៅឡើយទេ" }, { status: 400 });
    }
    if (project.segments.length === 0) {
      return NextResponse.json({ error: "មិនមានអត្ថបទខ្មែរសម្រាប់បង្កើតសំឡេង" }, { status: 400 });
    }

    await db.project.update({
      where: { id },
      data: { dubStatus: "processing", dubProgress: 1, dubError: null },
    });
    void runDubPipeline(db, id, voice);

    return NextResponse.json({ ok: true, dubStatus: "processing" }, { status: 202 });
  } catch (err) {
    console.error("[api/projects/:id/dub] failed:", err);
    return NextResponse.json({ error: "មិនអាចចាប់ផ្តើមបង្កើតសំឡេងបានទេ" }, { status: 500 });
  }
}
