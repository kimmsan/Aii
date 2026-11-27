"use client";

import { useCallback, useRef, useState } from "react";
import { CloudUpload, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onUploaded: (id: string) => void;
  onError: (message: string) => void;
}

const ACCEPTED =
  "video/mp4,video/quicktime,video/webm,video/x-matroska,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg";
const MAX_SIZE = 200 * 1024 * 1024;

function uploadWithProgress(
  file: File,
  onProgress: (ratio: number) => void,
): Promise<{ id: string; name: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/projects");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText) as { id?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && res.id) {
          resolve({ id: res.id, name: file.name });
        } else {
          reject(new Error(res.error ?? "ការអាប់ឡូកបរាជ័យ"));
        }
      } catch {
        reject(new Error("ការអាប់ឡូកបរាជ័យ"));
      }
    };
    xhr.onerror = () => reject(new Error("កំហុសបណ្តាញ សូមព្យាយាមម្តងទៀត"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export function UploadZone({ onUploaded, onError }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const startUpload = useCallback(
    async (file: File) => {
      const ext = (file.name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
      const allowed = [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"];
      if (!allowed.includes(ext)) {
        onError("ទម្រង់ឯកសារមិនត្រឹមត្រូវទេ។ សូមប្រើ MP4, MOV, WEBM, MKV, MP3, WAV ឬ M4A។");
        return;
      }
      if (file.size > MAX_SIZE) {
        onError(`ឯកសារធំពេក (${Math.round(file.size / 1024 / 1024)}MB)។ ទំហំអតិបរមា៖ 200MB។`);
        return;
      }
      setUploading(true);
      setProgress(0);
      try {
        const res = await uploadWithProgress(file, (r) => setProgress(Math.round(r * 100)));
        onUploaded(res.id);
      } catch (err) {
        onError(err instanceof Error ? err.message : "ការអាប់ឡូកបរាជ័យ");
      } finally {
        setUploading(false);
      }
    },
    [onUploaded, onError],
  );

  return (
    <Card className="border-2 border-dashed border-primary/30 bg-card shadow-sm transition-colors">
      <CardContent className="p-6 sm:p-8">
        <div
          role="button"
          tabIndex={0}
          aria-label="អាប់ឡូកឯកសារវីដេអូ"
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !uploading) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file && !uploading) void startUpload(file);
          }}
          className={cn(
            "flex min-h-56 cursor-pointer flex-col items-center justify-center gap-4 rounded-xl px-6 py-8 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dragging
              ? "bg-accent ring-2 ring-primary/40"
              : "hover:bg-accent/60",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
              <div className="w-full max-w-sm">
                <div
                  className="h-2.5 w-full overflow-hidden rounded-full bg-secondary"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  កំពុងអាប់ឡូក… {progress}%
                </p>
              </div>
            </>
          ) : (
            <>
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <CloudUpload className="h-8 w-8" aria-hidden="true" />
              </span>
              <div>
                <p className="text-base font-semibold sm:text-lg">
                  អូសនិងទម្លាក់ឯកសារវីដេអូនៅទីនេះ
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  ឬចុចដើម្បីជ្រើសរើសឯកសារពីឧបករណ៍របស់អ្នក
                </p>
              </div>
              <Button type="button" size="lg" className="mt-1 pointer-events-none" tabIndex={-1}>
                <Film className="mr-2 h-4 w-4" aria-hidden="true" />
                ជ្រើសរើសឯកសារ
              </Button>
              <p className="text-xs text-muted-foreground">
                ទម្រង់៖ MP4, MOV, WEBM, MKV, MP3, WAV, M4A · ទំហំអតិបរមា៖ 200MB
              </p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void startUpload(file);
            e.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}
