// Video translation pipeline: ffmpeg audio extraction -> ASR -> LLM translation
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getZai, withRetry } from "./zai";

const execFileAsync = promisify(execFile);

const DATA_ROOT = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_ROOT, "uploads");
const AUDIO_DIR = path.join(DATA_ROOT, "audio");

const CHUNK_SECONDS = 20;
const ASR_CONCURRENCY = 2;
const TRANSLATE_CONCURRENCY = 2;
const TRANSLATE_BATCH = 8;

// ---------- process helpers ----------

async function run(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, {
    maxBuffer: 32 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  return stdout;
}

async function getMediaDuration(file: string): Promise<number> {
  try {
    const out = await run("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    return parseFloat(out.trim()) || 0;
  } catch {
    return 0;
  }
}

async function hasAudioStream(file: string): Promise<boolean> {
  try {
    const out = await run("ffprobe", [
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    return out.includes("audio");
  } catch {
    return false;
  }
}

// map with limited concurrency
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- ZAI SDK helpers (backend only) ----------

// getZai is imported from ./zai (shared with dubbing pipeline)

async function transcribeAudioFile(file: string): Promise<string> {
  const zai = await getZai();
  const buf = await fs.readFile(file);
  if (buf.length === 0) return "";
  const base64 = buf.toString("base64");
  const res = await withRetry(() => zai.audio.asr.create({ file_base64: base64 }), 6, 10000);
  return (res.text ?? "").trim();
}

const TRANSLATE_SYSTEM = `You are a professional subtitle translator. Translate each numbered subtitle line into natural, fluent, spoken-style Khmer (ភាសាខ្មែរ).
Rules:
- Translate the MEANING of the story, not word-by-word. Use natural Khmer that a general audience understands.
- Translate EVERY line COMPLETELY, from beginning to end — never skip, shorten, summarize or cut any content.
- Keep the length close to the original (do not add filler), so the translation can fit the original speech duration.
- Include non-speech vocalizations too: laughter, crying, shouting, exclamations. Render them as short Khmer annotations, e.g. (សើច) for laughs, (ភ្ញាក់ផ្អើល) for surprise, (យំ) for crying. Do not drop them.
- Keep proper nouns, brand names and numbers; do not add explanations or notes that are not in the original.
- Do NOT merge or split lines; keep the same number of items with the same "i" values.
- Respond with ONLY valid JSON: an array like [{"i":0,"km":"..."}] — no markdown fences, no commentary.`;

interface TranslateItem {
  i: number;
  text: string;
}

function parseTranslationJson(raw: string, count: number): (string | null)[] {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  const out: (string | null)[] = new Array(count).fill(null);
  if (start === -1 || end === -1 || end <= start) return out;
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as { i?: number; km?: string }[];
    if (!Array.isArray(arr)) return out;
    for (const item of arr) {
      if (typeof item?.i === "number" && item.i >= 0 && item.i < count && typeof item.km === "string") {
        out[item.i] = item.km.trim();
      }
    }
  } catch {
    return out;
  }
  return out;
}

async function translateBatch(items: TranslateItem[]): Promise<(string | null)[]> {
  if (items.length === 0) return [];
  const zai = await getZai();
  const payload = JSON.stringify(items.map((it) => ({ i: it.i, text: it.text })));
  const userMsg = `Translate these ${items.length} subtitle lines into Khmer (ភាសាខ្មែរ). Return ONLY the JSON array:\n${payload}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await withRetry(
        () =>
          zai.chat.completions.create({
            messages: [
              { role: "assistant", content: TRANSLATE_SYSTEM },
              { role: "user", content: userMsg },
            ],
            thinking: { type: "disabled" },
          }),
        6,
        10000,
      );
      const raw = completion.choices?.[0]?.message?.content ?? "";
      const parsed = parseTranslationJson(raw, items.length);
      const filled = parsed.filter(Boolean).length;
      if (filled >= Math.ceil(items.length * 0.6)) return parsed;
      if (attempt === 1) return parsed;
    } catch (err) {
      console.error("[pipeline] translate attempt failed:", err);
      if (attempt === 1) return new Array(items.length).fill(null);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return new Array(items.length).fill(null);
}

// ---------- subtitle text splitting ----------

const CJK_OR_KHMER = /[\u1780-\u17FF\u3000-\u9FFF\uFF00-\uFFEF]/;

function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  // insert a break after every sentence-ending punctuation (works for CJK
  // which has no whitespace after 。)
  const marked = cleaned.replace(/([。！？])(?!\s|$)/g, "$1\u0000");
  const rough = marked
    .split(/[\u0000]|(?<=[.!?។៕…])\s+|\n+/g)
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  // merge very short fragments forward (join without a space for CJK/Khmer)
  const merged: string[] = [];
  for (const part of rough) {
    const last = merged[merged.length - 1];
    if (last && (last.length < 12 || part.length < 4)) {
      const noSpace = CJK_OR_KHMER.test(last.slice(-1)) && CJK_OR_KHMER.test(part[0] ?? "");
      merged[merged.length - 1] = noSpace ? `${last}${part}` : `${last} ${part}`;
    } else {
      merged.push(part);
    }
  }
  return merged.length ? merged : [cleaned];
}

interface DraftSegment {
  startMs: number;
  endMs: number;
  sourceText: string;
}

// sentence-terminal punctuation at the very end of a text
const TERMINAL_TAIL_RE = /[。！？!?…។៕]["'」』）)]?\s*$/;

// a chunk "continues" into the next one when its text does NOT end with
// sentence-terminal punctuation (i.e. the last sentence was cut at the 20s
// chunk boundary). Very long unpunctuated streams (ASR that emits no
// punctuation at all) are left alone to avoid merging whole transcripts.
function chunkContinues(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (TERMINAL_TAIL_RE.test(t)) return false;
  if (t.length > 80) return false;
  return true;
}

// ---------- pipeline ----------

async function updateProject(
  db: import("@prisma/client").PrismaClient,
  id: string,
  data: Record<string, unknown>,
) {
  await db.project.update({ where: { id }, data });
}

export async function runPipeline(db: import("@prisma/client").PrismaClient, projectId: string) {
  const running = (globalThis as unknown as { __vtRunning?: Set<string> }).__vtRunning ?? new Set<string>();
  (globalThis as unknown as { __vtRunning?: Set<string> }).__vtRunning = running;
  if (running.has(projectId)) return;
  running.add(projectId);

  try {
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    // 1) extract audio
    await updateProject(db, projectId, {
      status: "EXTRACTING",
      progress: 2,
      stageDetail: "extract_audio",
      error: null,
    });

    if (!(await hasAudioStream(project.filePath))) {
      throw new Error("NO_AUDIO");
    }

    const audioDir = path.join(AUDIO_DIR, projectId);
    await fs.mkdir(audioDir, { recursive: true });
    const wavPath = path.join(audioDir, "full.wav");
    await run("ffmpeg", [
      "-y", "-i", project.filePath, "-vn",
      "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le",
      wavPath,
    ]);
    const duration = await getMediaDuration(project.filePath);
    await updateProject(db, projectId, {
      durationSec: duration || (await getMediaDuration(wavPath)),
      progress: 8,
    });

    // 2) chunk audio
    const chunkPrefix = path.join(audioDir, "chunk");
    await run("ffmpeg", [
      "-y", "-i", wavPath,
      "-f", "segment", "-segment_time", String(CHUNK_SECONDS),
      "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le",
      `${chunkPrefix}_%04d.wav`,
    ]);
    const chunkFiles = (await fs.readdir(audioDir))
      .filter((f) => f.startsWith("chunk_") && f.endsWith(".wav"))
      .sort();
    if (chunkFiles.length === 0) throw new Error("NO_AUDIO_CHUNKS");

    await updateProject(db, projectId, {
      status: "TRANSCRIBING",
      progress: 12,
      stageDetail: "transcribe",
    });

    // 3) ASR per chunk
    const chunkDurations = await mapPool(chunkFiles, 4, (f) => getMediaDuration(path.join(audioDir, f)));
    const chunkTexts = await mapPool(chunkFiles, ASR_CONCURRENCY, async (file, i) => {
      const full = path.join(audioDir, file);
      let text = "";
      try {
        text = await transcribeAudioFile(full);
      } catch (err) {
        console.error(`[pipeline] ASR failed for chunk ${i}:`, err);
      }
      const done = 12 + Math.floor(((i + 1) / chunkFiles.length) * 42);
      await updateProject(db, projectId, { progress: Math.min(done, 54) });
      return text;
    });

    // 4) build subtitle segments with proportional timestamps
    const drafts: DraftSegment[] = [];
    let cursorMs = 0;
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunkDurMs = Math.round((chunkDurations[i] || CHUNK_SECONDS) * 1000);
      const startMs = cursorMs;
      const endMs = startMs + chunkDurMs;
      cursorMs = endMs;

      const sentences = splitSentences(chunkTexts[i] ?? "");
      if (sentences.length === 0) continue;
      const totalChars = sentences.reduce((a, s) => a + s.length, 0);
      if (totalChars === 0) continue;

      // if the previous chunk's last sentence was cut at the boundary, merge
      // this chunk's first sentence into it (keeps subtitles + dub timing natural)
      const mergePrev = i > 0 && drafts.length > 0 && chunkContinues(drafts[drafts.length - 1].sourceText);
      let segStart = startMs;
      let fromIdx = 0;
      if (mergePrev) {
        const share = Math.max(1, Math.round((sentences[0].length / totalChars) * (endMs - startMs)));
        const last = drafts[drafts.length - 1];
        const joiner =
          CJK_OR_KHMER.test(last.sourceText.slice(-1)) && CJK_OR_KHMER.test(sentences[0][0] ?? "") ? "" : " ";
        last.sourceText = `${last.sourceText}${joiner}${sentences[0]}`;
        last.endMs = Math.min(endMs, segStart + share);
        segStart = last.endMs;
        fromIdx = 1;
      }

      for (let k = fromIdx; k < sentences.length; k++) {
        const sentence = sentences[k];
        const share = Math.max(1, Math.round((sentence.length / totalChars) * (endMs - startMs)));
        const segEnd = Math.min(endMs, segStart + share);
        drafts.push({ startMs: segStart, endMs: segEnd, sourceText: sentence });
        segStart = segEnd;
      }
      if (drafts.length > 0) {
        drafts[drafts.length - 1].endMs = endMs;
      }
    }
    if (drafts.length === 0) {
      throw new Error("NO_SPEECH");
    }

    await db.segment.deleteMany({ where: { projectId } });
    await db.segment.createMany({
      data: drafts.map((d, idx) => ({
        projectId,
        idx,
        startMs: d.startMs,
        endMs: d.endMs,
        sourceText: d.sourceText,
        khmerText: null as string | null,
      })),
    });

    await updateProject(db, projectId, {
      status: "TRANSLATING",
      progress: 58,
      stageDetail: "translate",
    });

    // 5) translate in batches
    const segments = await db.segment.findMany({
      where: { projectId },
      orderBy: { idx: "asc" },
      select: { id: true, idx: true, sourceText: true },
    });

    const batches: TranslateItem[][] = [];
    for (let i = 0; i < segments.length; i += TRANSLATE_BATCH) {
      const slice = segments.slice(i, i + TRANSLATE_BATCH);
      batches.push(slice.map((s) => ({ i: s.idx, text: s.sourceText })));
    }

    const totalBatches = batches.length;
    await mapPool(batches, TRANSLATE_CONCURRENCY, async (batch, bIdx) => {
      const results = await translateBatch(batch);
      for (let k = 0; k < batch.length; k++) {
        const km = results[k];
        if (km) {
          await db.segment.updateMany({
            where: { projectId, idx: batch[k].i },
            data: { khmerText: km },
          });
        }
      }
      const done = 58 + Math.floor(((bIdx + 1) / totalBatches) * 40);
      await updateProject(db, projectId, { progress: Math.min(done, 98) });
    });

    await updateProject(db, projectId, {
      status: "READY",
      progress: 100,
      stageDetail: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const friendly =
      message === "NO_AUDIO"
        ? "រកមិនឃើញសំឡេងនៅក្នុងឯកសារ (No audio stream found)"
        : message === "NO_SPEECH"
          ? "រកមិនឃើញការនិយាយច្បាស់លាស់ក្នុងវីដេអូ (No clear speech detected)"
          : message === "NO_AUDIO_CHUNKS"
            ? "មិនអាចដកសំឡេងបានទេ (Audio extraction failed)"
            : `កំហុសក្នុងការដំណើរការ: ${message}`;
    console.error("[pipeline] failed:", message);
    try {
      await updateProject(db, projectId, {
        status: "FAILED",
        error: friendly,
        stageDetail: null,
      });
    } catch (dbErr) {
      console.error("[pipeline] failed to record error:", dbErr);
    }
  } finally {
    running.delete(projectId);
  }
}

export async function retranslateSegment(db: import("@prisma/client").PrismaClient, segmentId: string): Promise<string | null> {
  const seg = await db.segment.findUnique({ where: { id: segmentId } });
  if (!seg) throw new Error("SEGMENT_NOT_FOUND");
  const results = await translateBatch([{ i: 0, text: seg.sourceText }]);
  const km = results[0];
  if (km) {
    await db.segment.update({ where: { id: segmentId }, data: { khmerText: km } });
    return km;
  }
  throw new Error("TRANSLATION_FAILED");
}

export async function generateSynopsis(db: import("@prisma/client").PrismaClient, projectId: string): Promise<string> {
  const segments = await db.segment.findMany({
    where: { projectId },
    orderBy: { idx: "asc" },
    select: { sourceText: true, khmerText: true },
  });
  if (segments.length === 0) throw new Error("NO_SEGMENTS");
  const transcript = segments
    .map((s) => s.khmerText?.trim() || s.sourceText.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 12000);

  const zai = await getZai();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content:
          "You summarize video transcripts in Khmer (ភាសាខ្មែរ). Write a short, clear synopsis (3-6 sentences) that captures the story and key points. Natural, easy Khmer. Plain text only — no headings, no markdown, no lists.",
      },
      { role: "user", content: `សូមសរសេរសេចក្តីសង្ខេបសាច់រឿងរបស់វីដេអូនេះជាភាសាខ្មែរ:\n\n${transcript}` },
    ],
    thinking: { type: "disabled" },
  });
  const summary = (completion.choices?.[0]?.message?.content ?? "").trim();
  if (!summary) throw new Error("SYNOPSIS_FAILED");
  await db.project.update({ where: { id: projectId }, data: { synopsis: summary } });
  return summary;
}

// remove stage-direction annotations like (សើច) from text before TTS
function cleanTextForTts(text: string): string {
  return text
    .replace(/\((?:[^()]*?)\)/g, " ")
    .replace(/[\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function saveUploadedFile(id: string, originalName: string, buffer: Buffer): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(originalName).toLowerCase() || ".mp4";
  const filePath = path.join(UPLOAD_DIR, `${id}${ext}`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function cleanupProjectFiles(projectId: string) {
  try {
    await fs.rm(path.join(AUDIO_DIR, projectId), { recursive: true, force: true });
  } catch {
    // ignore
  }
}
