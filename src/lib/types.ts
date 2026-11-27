// Shared types for the Khmer video translator app

export type ProjectStatus = "EXTRACTING" | "TRANSCRIBING" | "TRANSLATING" | "READY" | "FAILED";

export interface VtSegment {
  id: string;
  projectId: string;
  idx: number;
  startMs: number;
  endMs: number;
  sourceText: string;
  khmerText: string | null;
}

export interface VtProject {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  status: ProjectStatus;
  progress: number;
  stageDetail: string | null;
  error: string | null;
  synopsis: string | null;
  dubStatus: string | null;
  dubProgress: number;
  dubError: string | null;
  dubAudioPath: string | null;
  dubVideoPath: string | null;
  dubHardsubPath: string | null;
  dubVoice: string | null;
  createdAt: string;
  segments: VtSegment[];
}

export interface VtProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  durationSec: number | null;
  createdAt: string;
  error: string | null;
  _count: { segments: number };
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  EXTRACTING: "កំពុងដកសំឡេង",
  TRANSCRIBING: "កំពុងចម្លងសំឡេង",
  TRANSLATING: "កំពុងបកប្រែ",
  READY: "រួចរាល់",
  FAILED: "បរាជ័យ",
};

// dubbing voices (quality of Khmer pronunciation may vary per voice)
export const DUB_VOICES: { id: string; label: string }[] = [
  { id: "tongtong", label: "Tongtong · លំនាំដើម" },
  { id: "xiaochen", label: "Xiaochen" },
  { id: "chuichui", label: "Chuichui" },
  { id: "jam", label: "Jam" },
  { id: "kazi", label: "Kazi" },
  { id: "douji", label: "Douji" },
  { id: "luodo", label: "Luodo" },
];

export const ACTIVE_STATUSES: ProjectStatus[] = ["EXTRACTING", "TRANSCRIBING", "TRANSLATING"];

export function msToClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
