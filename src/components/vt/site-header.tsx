"use client";

import { Languages, Sparkles } from "lucide-react";

export function SiteHeader({ onHome }: { onHome?: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="ទៅទំព័រដើម"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Languages className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-left leading-tight">
            <span className="font-display block text-base font-bold sm:text-lg">
              បកប្រែវីដេអូជាភាសាខ្មែរ
            </span>
            <span className="block text-xs text-muted-foreground">
              AI Video Translator
            </span>
          </span>
        </button>
        <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-border bg-accent px-3 py-1 text-xs font-medium text-accent-foreground sm:flex">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          ដំណើរការដោយ AI
        </span>
      </div>
    </header>
  );
}
