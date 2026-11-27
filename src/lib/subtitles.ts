// SRT subtitle generation helpers

export function msToSrtTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const msec = total % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msec, 3)}`;
}

export function msToClockTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}`;
}

export type SrtMode = "khmer" | "bilingual" | "source";

export interface SrtSegment {
  idx: number;
  startMs: number;
  endMs: number;
  sourceText: string;
  khmerText: string | null;
}

export function buildSrt(segments: SrtSegment[], mode: SrtMode): string {
  const lines: string[] = [];
  let n = 1;
  for (const seg of segments) {
    const khmer = (seg.khmerText ?? "").trim();
    const source = seg.sourceText.trim();
    let body: string;
    if (mode === "khmer") {
      body = khmer || source;
    } else if (mode === "bilingual") {
      body = khmer ? `${khmer}\n${source}` : source;
    } else {
      body = source;
    }
    if (!body) continue;
    lines.push(String(n++));
    lines.push(`${msToSrtTime(seg.startMs)} --> ${msToSrtTime(seg.endMs)}`);
    lines.push(body);
    lines.push("");
  }
  return lines.join("\n");
}

export function buildPlainText(segments: SrtSegment[], mode: SrtMode): string {
  const out: string[] = [];
  for (const seg of segments) {
    const khmer = (seg.khmerText ?? "").trim();
    const source = seg.sourceText.trim();
    if (mode === "khmer") {
      out.push(khmer || source);
    } else if (mode === "bilingual") {
      out.push(khmer ? `${khmer}\n${source}` : source);
    } else {
      out.push(source);
    }
  }
  return out.join("\n\n");
}
