// Shared Z-AI SDK client (backend only)
export type ZaiClient = Awaited<ReturnType<typeof createZai>>;

async function createZai() {
  const mod = await import("z-ai-web-dev-sdk");
  const ZAI = (mod as unknown as { default: { create: () => Promise<unknown> } }).default;
  return (await ZAI.create()) as {
    audio: {
      asr: { create: (opts: { file_base64: string }) => Promise<{ text?: string }> };
      tts: {
        create: (opts: {
          input: string;
          voice: string;
          speed: number;
          response_format: string;
          stream: boolean;
        }) => Promise<Response>;
      };
    };
    chat: {
      completions: {
        create: (opts: {
          messages: { role: string; content: string }[];
          thinking?: { type: string };
        }) => Promise<{ choices?: { message?: { content?: string } }[] }>;
      };
    };
  };
}

const globalForZai = globalThis as unknown as { __vtZai?: Promise<ZaiClient> };

export function getZai(): Promise<ZaiClient> {
  if (!globalForZai.__vtZai) {
    globalForZai.__vtZai = createZai();
  }
  return globalForZai.__vtZai;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// run an SDK call with retries and backoff (handles 429 rate limits & transient 5xx)
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 5,
  baseDelayMs = 2000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const rateLimited = msg.includes("429") || msg.toLowerCase().includes("too many requests");
      const serverError = /\b5\d{2}\b/.test(msg) || msg.toLowerCase().includes("internal");
      if (!rateLimited && !serverError && attempt >= 1) break;
      const delay = rateLimited ? baseDelayMs * (attempt + 1) : serverError ? baseDelayMs : baseDelayMs / 2;
      await sleep(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
