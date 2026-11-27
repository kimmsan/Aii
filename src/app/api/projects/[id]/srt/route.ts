import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildSrt, type SrtMode } from "@/lib/subtitles";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const modeParam = req.nextUrl.searchParams.get("mode") ?? "khmer";
    const mode: SrtMode = ["khmer", "bilingual", "source"].includes(modeParam)
      ? (modeParam as SrtMode)
      : "khmer";

    const project = await db.project.findUnique({
      where: { id },
      include: { segments: { orderBy: { idx: "asc" } } },
    });
    if (!project) {
      return NextResponse.json({ error: "រកមិនឃើញគម្រោង" }, { status: 404 });
    }
    if (project.segments.length === 0) {
      return NextResponse.json({ error: "មិនមានអត្ថបទសម្រាប់ទាញយក" }, { status: 400 });
    }

    const srt = "\ufeff" + buildSrt(project.segments, mode);
    const suffix = mode === "khmer" ? "ខ្មែរ" : mode === "bilingual" ? "ពីរភាសា" : "ដើម";
    const fileName = `${project.name || "subtitle"}-srt-${suffix}.srt`;

    return new NextResponse(srt, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="subtitle-${mode}-${id.slice(0, 8)}.srt"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (err) {
    console.error("[api/projects/:id/srt] failed:", err);
    return NextResponse.json({ error: "មិនអាចបង្កើតឯកសារ SRT បានទេ" }, { status: 500 });
  }
}
