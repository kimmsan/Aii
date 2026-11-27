import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { runPipeline, saveUploadedFile } from "@/lib/pipeline";

export const runtime = "nodejs";

const ALLOWED_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);
const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        name: true,
        status: true,
        progress: true,
        durationSec: true,
        createdAt: true,
        error: true,
        _count: { select: { segments: true } },
      },
    });
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[api/projects] list failed:", err);
    return NextResponse.json({ error: "មិនអាចទាញយកបញ្ជីគម្រោងបានទេ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "សូមជ្រើសរើសឯកសារវីដេអូឬសំឡេង" }, { status: 400 });
    }

    const originalName = file.name || "video.mp4";
    const ext = (originalName.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: `ទម្រង់ឯកសារ ${ext || "មិនស្គាល់"} មិនត្រឹមត្រូវទេ។ ទម្រង់ដែលអាចប្រើ: MP4, MOV, WEBM, MKV, MP3, WAV, M4A` },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `ឯកសារធំពេក (${Math.round(file.size / 1024 / 1024)}MB)។ ទំហំអតិបរមា៖ 200MB` },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "ឯកសារទំនេរ" }, { status: 400 });
    }

    const id = randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = await saveUploadedFile(id, originalName, buffer);

    const displayName = originalName.replace(/\.[^.]+$/, "").slice(0, 120) || "គម្រោងថ្មី";
    const project = await db.project.create({
      data: {
        id,
        name: displayName,
        originalName,
        filePath,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        status: "EXTRACTING",
        progress: 1,
        stageDetail: "extract_audio",
      },
    });

    // kick off background processing (do not await)
    void runPipeline(db, project.id);

    return NextResponse.json({ id: project.id, name: project.name }, { status: 201 });
  } catch (err) {
    console.error("[api/projects] upload failed:", err);
    return NextResponse.json({ error: "ការអាប់ឡូកបរាជ័យ សូមព្យាយាមម្តងទៀត" }, { status: 500 });
  }
}
