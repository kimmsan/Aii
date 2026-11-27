import { NextRequest, NextResponse } from "next/server";
import { createReadStream, promises as fsPromises } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

async function serveFile(
  req: NextRequest,
  filePath: string,
  notFoundMessage: string,
) {
  let stat;
  try {
    stat = await fsPromises.stat(filePath);
  } catch {
    return NextResponse.json({ error: notFoundMessage }, { status: 404 });
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    let start = match?.[1] ? parseInt(match[1], 10) : 0;
    let end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
    if (start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    const stream = createReadStream(filePath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": mime,
        "Cache-Control": "no-store",
      },
    });
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Type": mime,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const variant = req.nextUrl.searchParams.get("variant") ?? "original";
    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "រកមិនឃើញគម្រោង" }, { status: 404 });
    }

    if (variant === "dubbed" || variant === "dubbed-audio" || variant === "hardsub") {
      const target =
        variant === "dubbed"
          ? project.dubVideoPath
          : variant === "hardsub"
            ? project.dubHardsubPath
            : project.dubAudioPath;
      if (!target) {
        return NextResponse.json({ error: "មិនទាន់មានសំឡេងខ្មែរដែលបានបង្កើត" }, { status: 404 });
      }
      return serveFile(req, target, "រកមិនឃើញឯកសារសំឡេងខ្មែរ");
    }

    return serveFile(req, project.filePath, "រកមិនឃើញឯកសារវីដេអូ");
  } catch (err) {
    console.error("[api/projects/:id/video] failed:", err);
    return NextResponse.json({ error: "មិនអាចចាក់វីដេអូបានទេ" }, { status: 500 });
  }
}
