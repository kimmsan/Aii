"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Languages, Mic, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SiteHeader } from "@/components/vt/site-header";
import { UploadZone } from "@/components/vt/upload-zone";
import { ProcessingView } from "@/components/vt/processing-view";
import { EditorView } from "@/components/vt/editor-view";
import { ProjectList } from "@/components/vt/project-list";
import { useToast } from "@/hooks/use-toast";
import { ACTIVE_STATUSES, type VtProject, type VtProjectSummary } from "@/lib/types";

type View = "home" | "processing" | "editor";

const FEATURES = [
  {
    icon: Mic,
    title: "ចម្លងសំឡេងជាអត្ថបទ",
    desc: "AI ស្តាប់សំឡេងក្នុងវីដេអូរបស់អ្នក ហើយចម្លងជាអត្ថបទដោយដាច់អៈពេលវេលាច្បាស់លាស់។",
  },
  {
    icon: Languages,
    title: "បកប្រែជាភាសាខ្មែរ",
    desc: "អត្ថបទត្រូវបកប្រែជាភាសាខ្មែរធម្មជាតិដោយ AI និងអាចកែសម្រួលបានទាំងស្រុង។",
  },
  {
    icon: Download,
    title: "ទាញយក SRT រួចរាល់",
    desc: "ទាញយកឯកសារ SRT ខ្មែរ ឬពីរភាសា និងអត្ថបទ — ដាក់ក្នុងវីដេអូបានភ្លាមៗ។",
  },
];

const STEPS = [
  "អាប់ឡូកវីដេអូឬឯកសារសំឡេងរបស់អ្នក",
  "AI ចម្លងសំឡេង បន្ទាប់មកបកប្រែជាភាសាខ្មែរ",
  "កែសម្រួលអត្ថបទ រួចទាញយកឯកសារ SRT",
];

export default function HomePage() {
  const { toast } = useToast();
  const [view, setView] = useState<View>("home");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [project, setProject] = useState<VtProject | null>(null);
  const [projects, setProjects] = useState<VtProjectSummary[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const onToast = useCallback(
    (title: string, desc?: string, variant?: "default" | "destructive") => {
      toast({ title, description: desc, variant });
    },
    [toast],
  );

  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data = (await res.json()) as { projects: VtProjectSummary[] };
      setProjects(data.projects ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  // poll processing status
  useEffect(() => {
    if (view !== "processing" || !currentId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/projects/${currentId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { project: VtProject };
        if (cancelled) return;
        setProject(data.project);
        if (data.project.status === "READY") {
          setView("editor");
          void refreshProjects();
        }
      } catch {
        // transient network error — keep polling
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [view, currentId, refreshProjects]);

  const handleUploaded = useCallback((id: string) => {
    setCurrentId(id);
    setProject(null);
    setView("processing");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const openProject = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error("not found");
        const data = (await res.json()) as { project: VtProject };
        setCurrentId(id);
        setProject(data.project);
        setView(
          data.project.status === "READY" || ACTIVE_STATUSES.includes(data.project.status)
            ? data.project.status === "READY"
              ? "editor"
              : "processing"
            : "processing",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        onToast("មិនអាចបើកគម្រោងបានទេ", "សូមព្យាយាមម្តងទៀត។", "destructive");
      }
    },
    [onToast],
  );

  const handleRefresh = useCallback(async () => {
    if (!currentId) return;
    try {
      const res = await fetch(`/api/projects/${currentId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { project: VtProject };
      setProject(data.project);
    } catch {
      // ignore transient errors
    }
  }, [currentId]);

  const goHome = useCallback(() => {
    setView("home");
    setCurrentId(null);
    setProject(null);
    void refreshProjects();
    window.scrollTo({ top: 0 });
  }, [refreshProjects]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader onHome={goHome} />

      <main className="flex-1">
        {view === "home" && (
          <>
            {/* hero */}
            <section className="border-b border-border/60 bg-gradient-to-b from-accent/60 via-background to-background">
              <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6 sm:py-16" ref={listRef}>
                <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-accent-foreground shadow-sm">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  ដំណើរការដោយ AI · លឿន និងងាយស្រួល
                </span>
                <h1 className="font-display mx-auto max-w-3xl text-3xl font-extrabold leading-snug sm:text-4xl lg:text-5xl lg:leading-snug">
                  បកប្រែវីដេអូទៅជា<span className="text-primary">ភាសាខ្មែរ</span> ដោយស្វ័យប្រវត្តិ
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
                  អាប់ឡូកវីដេអូឬសំឡេងរបស់អ្នក — AI នឹងស្តាប់ ចម្លងជាអត្ថបទ បកប្រែជាភាសាខ្មែរ
                  ហើយបង្កើតអក្សរខ្មែរក្រោម (Subtitle) និងឯកសារ SRT សម្រាប់អ្នក។
                </p>
              </div>
            </section>

            {/* upload */}
            <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10" aria-label="អាប់ឡូកវីដេអូ">
              <UploadZone onUploaded={handleUploaded} onError={(m) => onToast("អាប់ឡូកមិនសម្រេច", m, "destructive")} />
            </section>

            {/* features */}
            <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-label="លក្ខណៈពិសេស">
              <div className="grid gap-4 sm:grid-cols-3">
                {FEATURES.map((f) => (
                  <Card key={f.title} className="shadow-sm transition-shadow hover:shadow-md">
                    <CardContent className="p-5 sm:p-6">
                      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        <f.icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h3 className="font-display text-base font-bold">{f.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* how it works */}
            <section className="mx-auto max-w-6xl px-4 py-8 pb-12 sm:px-6" aria-label="របៀបប្រើ">
              <h2 className="font-display mb-5 text-center text-xl font-bold sm:text-2xl">
                មធ្យោបាយប្រើ ៣ ជំហាន
              </h2>
              <ol className="grid gap-4 sm:grid-cols-3">
                {STEPS.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
                  >
                    <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed">{step}</p>
                  </li>
                ))}
              </ol>
            </section>

            {/* recent projects */}
            <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
              <ProjectList projects={projects} onOpen={(id) => void openProject(id)} />
            </section>
          </>
        )}

        {view === "processing" && currentId && (
          <ProcessingView
            project={
              project ?? {
                id: currentId,
                name: "កំពុងដំណើរការ…",
                originalName: "",
                mimeType: "",
                sizeBytes: 0,
                durationSec: null,
                status: "EXTRACTING",
                progress: 1,
                stageDetail: null,
                error: null,
                synopsis: null,
                dubStatus: null,
                dubProgress: 0,
                dubError: null,
                dubAudioPath: null,
                dubVideoPath: null,
                dubHardsubPath: null,
                dubVoice: null,
                createdAt: new Date().toISOString(),
                segments: [],
              }
            }
            onBack={goHome}
            onRetry={goHome}
          />
        )}

        {view === "editor" && project && project.status === "READY" && (
          <EditorView project={project} onBack={goHome} onRefresh={handleRefresh} onToast={onToast} />
        )}
      </main>

      <footer className="mt-auto border-t border-border/60 bg-secondary/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-left">
          <p>បកប្រែវីដេអូជាភាសាខ្មែរ · ដំណើរការដោយ AI</p>
          <p>គាំទ្រទម្រង់ MP4, MOV, WEBM, MKV, MP3, WAV, M4A</p>
        </div>
      </footer>
    </div>
  );
}
