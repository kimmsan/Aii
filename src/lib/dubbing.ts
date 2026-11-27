// Khmer dubbing pipeline: TTS per segment -> timed audio assembly -> mux into muted video
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getZai, withRetry } from "./zai";

const execFileAsync = promisify(execFile);

const DATA_ROOT = path.join(process.cwd(), "data");
const AUDIO_DIR = path.join(DATA_ROOT, "audio");

// voices offered for dubbing; quality of Khmer pronunciation may vary per voice
export const DUB_VOICES = ["tongtong", "xiaochen", "chuichui", "jam", "kazi", "douji", "luodo"] as const;
export type DubVoice = (typeof DUB_VOICES)[number];
export const DEFAULT_DUB_VOICE: DubVoice = "tongtong";

export function normalizeVoice(voice: unknown): DubVoice {
  return typeof voice === "string" && (DUB_VOICES as readonly string[]).includes(voice)
    ? (voice as DubVoice)
    : DEFAULT_DUB_VOICE;
}

async function run(cmd: string, args: string[]): Promise<void> {
  await execFileAsync(cmd, args, {
    maxBuffer: 32 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
}

async function audioDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function ttsToFile(
  zai: Awaited<ReturnType<typeof getZai>>,
  text: string,
  outPath: string,
  speed: number,
  voice: DubVoice,
): Promise<void> {
  const response = await withRetry(
    () =>
      zai.audio.tts.create({
        input: text.slice(0, 1024),
        voice,
        speed: Math.min(2.0, Math.max(0.5, speed)),
        response_format: "wav",
        stream: false,
      }),
    8,
    15000,
  );
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(new Uint8Array(arrayBuffer));
  if (buffer.length < 200) throw new Error("TTS_EMPTY");
  await fs.writeFile(outPath, buffer);
}

async function updateDub(db: import("@prisma/client").PrismaClient, id: string, data: Record<string, unknown>) {
  await db.project.update({ where: { id }, data });
}

// simple concurrency pool
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

interface DubSlot {
  segmentId: string;
  idx: number;
  startMs: number;
  slotMs: number;
  text: string;
}

export async function runDubPipeline(
  db: import("@prisma/client").PrismaClient,
  projectId: string,
  voiceOverride?: unknown,
) {
  const running = (globalThis as unknown as { __vtDubRunning?: Set<string> }).__vtDubRunning ?? new Set<string>();
  (globalThis as unknown as { __vtDubRunning?: Set<string> }).__vtDubRunning = running;
  if (running.has(projectId)) return;
  running.add(projectId);

  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { segments: { orderBy: { idx: "asc" } } },
    });
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const translated = project.segments.filter((s) => (s.khmerText ?? "").trim().length > 0);
    if (translated.length === 0) throw new Error("NO_TRANSLATION");
    if (!(await fs.stat(project.filePath).then(() => true).catch(() => false))) {
      throw new Error("FILE_MISSING");
    }

    const voice = normalizeVoice(voiceOverride);
    await updateDub(db, projectId, {
      dubStatus: "processing",
      dubProgress: 2,
      dubError: null,
      dubVoice: voice,
    });

    // 1) prepare slots: text + available time until the next spoken segment starts
    const slots: DubSlot[] = [];
    for (let i = 0; i < translated.length; i++) {
      const seg = translated[i];
      const text = (seg.khmerText ?? "")
        .replace(/\((?:[^()]*?)\)/g, " ") // strip stage directions like (សើច) for clean speech
        .replace(/[\[\]{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      const nextStart = translated[i + 1]?.startMs ?? seg.endMs;
      const slotMs = Math.max(800, nextStart - seg.startMs);
      slots.push({ segmentId: seg.id, idx: seg.idx, startMs: seg.startMs, slotMs, text });
    }

    const zai = await getZai();
    const dubDir = path.join(AUDIO_DIR, projectId, "dub");
    await fs.mkdir(dubDir, { recursive: true });

    // 2) TTS each segment sequentially (rate-limit friendly), fitting timing
    //    by re-synthesizing faster when needed
    const chunkFiles: { path: string; startMs: number; durMs: number }[] = [];
    const total = slots.length;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const file = path.join(dubDir, `seg_${String(slot.idx).padStart(5, "0")}.wav`);
      let speed = 1.0;
      await ttsToFile(zai, slot.text, file, speed, voice);
      let dur = await audioDuration(file);
      const slotSec = slot.slotMs / 1000;
      if (dur > slotSec * 1.05) {
        const needSpeed = Math.min(2.0, Math.max(1.1, Math.round((dur / slotSec) * 10) / 10));
        try {
          await ttsToFile(zai, slot.text, file, needSpeed, voice);
          const dur2 = await audioDuration(file);
          if (dur2 > 0 && dur2 < dur) {
            speed = needSpeed;
            dur = dur2;
          }
        } catch {
          // keep first version
        }
      }
      // never cut content: allow slight overflow into the gap when the line is long
      chunkFiles[i] = { path: file, startMs: slot.startMs, durMs: Math.round(dur * 1000) };
      await updateDub(db, projectId, {
        dubProgress: 5 + Math.round(((i + 1) / total) * 80),
      });
      if (i < slots.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    const placed = chunkFiles.filter(Boolean);

    // 3) assemble the dubbed track with adelay + amix (original audio is NOT included)
    const totalMs = Math.max(
      Math.round((project.durationSec ?? 0) * 1000),
      placed.reduce((max, c) => Math.max(max, c.startMs + c.durMs), 0),
    ) + 800;
    const totalSec = Math.min(3600, totalMs / 1000);

    const dubAudioPath = path.join(AUDIO_DIR, projectId, "dubbed-track.wav");
    const args: string[] = ["-y"];
    for (const c of placed) {
      args.push("-i", c.path);
    }
    const filterParts: string[] = [];
    const mixLabels: string[] = [];
    placed.forEach((c, i) => {
      // delay to the segment start, then pad with silence so every stream
      // spans the full duration (amix duration=first then yields the full track)
      filterParts.push(
        `[${i}:a]aresample=24000,adelay=${c.startMs}:all=1,apad=whole_dur=${totalSec.toFixed(3)}[v${i}]`,
      );
      mixLabels.push(`[v${i}]`);
    });
    filterParts.push(`${mixLabels.join("")}amix=inputs=${placed.length}:normalize=0:dropout_transition=0[mix]`);
    filterParts.push(`[mix]alimiter=limit=0.95[out]`);
    args.push("-filter_complex", filterParts.join(";"), "-map", "[out]", "-t", totalSec.toFixed(3), dubAudioPath);
    await run("ffmpeg", args);
    await updateDub(db, projectId, { dubProgress: 90 });

    // 4) mux: keep original video, REPLACE the original audio track with the Khmer dub
    const hasVideo = await hasVideoStream(project.filePath);
    const outExt = hasVideo ? "mp4" : "m4a";
    const dubOutPath = path.join(AUDIO_DIR, projectId, `dubbed.${outExt}`);
    if (hasVideo) {
      await run("ffmpeg", [
        "-y", "-i", project.filePath, "-i", dubAudioPath,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
        "-shortest", "-movflags", "+faststart",
        dubOutPath,
      ]);
    } else {
      await run("ffmpeg", ["-y", "-i", dubAudioPath, "-c:a", "aac", "-b:a", "128k", dubOutPath]);
    }

    await updateDub(db, projectId, {
      dubStatus: "ready",
      dubProgress: 100,
      dubAudioPath,
      dubVideoPath: dubOutPath,
      dubError: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const friendly =
      message === "NO_TRANSLATION"
        ? "មិនមានអត្ថបទខ្មែរសម្រាប់បង្កើតសំឡេងទេ (No Khmer translation)"
        : message === "TTS_EMPTY"
          ? "មិនអាចបង្កើតសំឡេងបាន សូមព្យាយាមម្តងទៀត (TTS returned empty audio)"
          : message === "FILE_MISSING"
            ? "រកមិនឃើញឯកសារវីដេអូដើម (Original file missing)"
            : `កំហុសក្នុងការបង្កើតសំឡេង: ${message}`;
    console.error("[dub] failed:", message);
    try {
      await updateDub(db, projectId, { dubStatus: "failed", dubError: friendly });
    } catch (dbErr) {
      console.error("[dub] failed to record error:", dbErr);
    }
  } finally {
    running.delete(projectId);
  }
}

async function hasVideoStream(file: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_type",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return stdout.includes("video");
  } catch {
    return false;
  }
}
