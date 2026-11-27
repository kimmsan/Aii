"use client";

import { History, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_LABELS, msToClock, type ProjectStatus, type VtProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<ProjectStatus, string> = {
  EXTRACTING: "bg-secondary text-secondary-foreground",
  TRANSCRIBING: "bg-secondary text-secondary-foreground",
  TRANSLATING: "bg-secondary text-secondary-foreground",
  READY: "bg-primary/10 text-primary",
  FAILED: "bg-destructive/10 text-destructive",
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("km-KH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

interface ProjectListProps {
  projects: VtProjectSummary[];
  onOpen: (id: string) => void;
}

export function ProjectList({ projects, onOpen }: ProjectListProps) {
  if (projects.length === 0) return null;
  return (
    <section aria-label="គម្រោងថ្មីៗ" className="space-y-4">
      <h2 className="font-display flex items-center gap-2 text-lg font-bold">
        <History className="h-5 w-5 text-primary" aria-hidden="true" />
        គម្រោងថ្មីៗ
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((p) => {
          const busy = ["EXTRACTING", "TRANSCRIBING", "TRANSLATING"].includes(p.status);
          return (
            <Card
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onOpen(p.id);
              }}
              className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(p.createdAt)}
                    {p.durationSec ? ` · ${msToClock(Math.round(p.durationSec * 1000))}` : ""}
                    {p._count.segments > 0 ? ` · ${p._count.segments} ដំណាក់កាល` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    STATUS_STYLE[p.status],
                  )}
                >
                  {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                  {STATUS_LABELS[p.status]}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
