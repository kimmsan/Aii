import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildPlainText, type SrtMode } from "@/lib/subtitles";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const modeParam = req.nextUrl.searchParams.get("mode") ?? "bilingual";
    const mode: SrtMode = ["khmer", "bilingual", "source"].includes(modeParam)
      ? (modeParam as SrtMode)
      : "bilingual";

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

    const text = "\ufeff" + buildPlainText(project.segments, mode);
    const suffix = mode === "khmer" ? "ខ្មែរ" : mode === "bilingual" ? "ពីរភាសា" : "ដើម";
    const fileName = `${project.name || "transcript"}-txt-${suffix}.txt`;

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="transcript-${id.slice(0, 8)}.txt"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (err) {
    console.error("[api/projects/:id/txt] failed:", err);
    return NextResponse.json({ error: "មិនអាចបង្កើតឯកសារអត្ថបទបានទេ" }, { status: 500 });
  }
}
