import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { db } from "@/lib/db";
import { buildSrt } from "@/lib/subtitles";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

// Burn the Khmer subtitles into the dubbed video (hardsub) using libass
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const project = await db.project.findUnique({
      where: { id },
      include: { segments: { orderBy: { idx: "asc" } } },
    });
    if (!project) {
      return NextResponse.json({ error: "រកមិនឃើញគម្រោង" }, { status: 404 });
    }
    if (!project.dubVideoPath) {
      return NextResponse.json(
        { error: "សូមបង្កើតសំឡេងខ្មែរជាមុនសិន" },
        { status: 400 },
      );
    }
    if (!project.dubVideoPath.toLowerCase().endsWith(".mp4")) {
      return NextResponse.json(
        { error: "ឯកសារសំឡេងគ្មានវីដេអូ មិនអាចចារអក្សរក្រោមបានទេ" },
        { status: 400 },
      );
    }

    const srt = buildSrt(project.segments, "khmer");
    if (!srt.trim()) {
      return NextResponse.json({ error: "មិនមានអត្ថបទខ្មែរសម្រាប់ចារ" }, { status: 400 });
    }

    const dir = path.dirname(project.dubVideoPath);
    await fs.mkdir(dir, { recursive: true });
    const srtPath = path.join(dir, "hardsub.srt");
    await fs.writeFile(srtPath, srt, "utf8");

    const outPath = path.join(dir, "dubbed-hardsub.mp4");
    const style =
      "FontName=Noto Sans Khmer,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&HB0000000,Outline=1.6,Shadow=0.6,MarginV=34,Bold=0,WrapStyle=0";

    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i", project.dubVideoPath,
        "-vf", `subtitles=${srtPath}:force_style='${style}'`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "copy",
        "-movflags", "+faststart",
        outPath,
      ],
      { timeout: 15 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 },
    );

    await db.project.update({
      where: { id },
      data: { dubHardsubPath: outPath },
    });

    return NextResponse.json({ ok: true, dubHardsubPath: outPath });
  } catch (err) {
    console.error("[api/projects/:id/hardsub] failed:", err);
    return NextResponse.json({ error: "មិនអាចចារអក្សរខ្មែរក្រោមក្នុងវីដេអូបានទេ" }, { status: 500 });
  }
}
