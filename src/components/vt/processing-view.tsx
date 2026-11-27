"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { VtProject } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProcessingViewProps {
  project: VtProject;
  onBack: () => void;
  onRetry: () => void;
}

const STEPS: { key: string; label: string; statuses: string[] }[] = [
  { key: "extract", label: "ដកសំឡេងពីវីដេអូ", statuses: ["EXTRACTING", "TRANSCRIBING", "TRANSLATING", "READY"] },
  { key: "transcribe", label: "ចម្លងសំឡេងជាអត្ថបទ", statuses: ["TRANSCRIBING", "TRANSLATING", "READY"] },
  { key: "translate", label: "បកប្រែទៅជាភាសាខ្មែរ", statuses: ["TRANSLATING", "READY"] },
];

const STATUS_TIP: Record<string, string> = {
  EXTRACTING: "កំពុងដកសំឡេងពីឯកសារវីដេអូ… សូមរង់ចាំមួយសន្ទុះ",
  TRANSCRIBING: "កំពុងស្តាប់សំឡេងនិងចម្លងជាអត្ថបទ…",
  TRANSLATING: "កំពុងបកប្រែអត្ថបទទៅជាភាសាខ្មែរដោយ AI…",
  READY: "ការបកប្រែរួចរាល់ហើយ!",
  FAILED: "ការដំណើរការបានបរាជ័យ",
};

export function ProcessingView({ project, onBack, onRetry }: ProcessingViewProps) {
  const failed = project.status === "FAILED";
  const ready = project.status === "READY";
  const currentStep = project.status === "EXTRACTING" ? 0 : project.status === "TRANSCRIBING" ? 1 : project.status === "TRANSLATING" ? 2 : ready ? 3 : 2;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Button variant="ghost" onClick={onBack} className="mb-6 -ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
        ត្រឡប់ទៅទំព័រដើម
      </Button>

      <Card className={cn("shadow-sm", failed && "border-destructive/40")}>
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <span
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
                failed ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground",
              )}
            >
              {failed ? (
                <AlertTriangle className="h-7 w-7" aria-hidden="true" />
              ) : ready ? (
                <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden="true" />
              ) : (
                <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <h2 className="font-display truncate text-lg font-bold sm:text-xl">
                {project.name}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {STATUS_TIP[project.status] ?? "កំពុងដំណើរការ…"}
              </p>
            </div>
          </div>

          {failed ? (
            <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">កំហុស៖</p>
              <p className="mt-1 break-words text-sm text-foreground/80">
                {project.error ?? "មិនស្គាល់មូលហេតុ"}
              </p>
            </div>
          ) : (
            <>
              <div
                className="mt-6 h-2.5 w-full overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuenow={project.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.max(4, project.progress)}%` }}
                />
              </div>
              <p className="mt-2 text-right text-sm font-medium text-muted-foreground">
                {project.progress}%
              </p>

              <ol className="mt-4 space-y-3">
                {STEPS.map((step, i) => {
                  const done = currentStep > i || ready;
                  const active = currentStep === i && !ready;
                  return (
                    <li key={step.key} className="flex items-center gap-3 text-sm">
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                      ) : active ? (
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                      ) : (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border" />
                      )}
                      <span className={cn(done || active ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          {failed && (
            <div className="mt-6 flex gap-3">
              <Button onClick={onRetry} variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                សូមព្យាយាមឯកសារផ្សេងទៀត
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
