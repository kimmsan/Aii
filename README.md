# Khmer Video Translator (Aii)

AI-powered video translation studio with a **Khmer-language UI**. Upload a video (or audio) file and the app will:

1. **Transcribe** — extract audio with ffmpeg, transcribe it with AI speech recognition (auto chunking for long media)
2. **Translate** — translate every segment into Khmer with an LLM (natural meaning-based translation, keeps laughter as `ហាហា`, never drops content)
3. **Subtitles** — download ready-made SRT files (source / Khmer / bilingual) and plain text exports
4. **Dub** — generate a Khmer voice-over with TTS (7 voices), aligned to the original timing
5. **Export MP4** — rebuild the video with **only the Khmer audio track** (original audio fully removed) and optionally burn Khmer subtitles (hardsub) into the MP4

ភាសាខ្មែរ៖ បញ្ចូលវីដេអូ → ស្រង់អត្ថបទ → បកប្រែជាភាសាខ្មែរ → ទាញយក SRT → បង្កើតសំឡេងខ្មែរ (លុបសំឡេងដើម) → ទាញយក MP4 ថ្មី។

## Tech stack

- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS 4** + **shadcn/ui**
- **Prisma + SQLite** (project & segment storage)
- **ffmpeg** (audio extraction, chunking, dubbing mux, hardsub via libass)
- **z-ai-web-dev-sdk** — ASR (speech-to-text), LLM translation, TTS (text-to-speech)

## Project structure

```
src/
  app/                     Next.js App Router
    api/projects/          upload, list, detail, delete
    api/projects/[id]/     video stream (Range), srt, txt, synopsis, dub, hardsub
    api/segments/[id]/     edit segment, retranslate one segment
  components/vt/           app UI (upload zone, processing view, editor, project list)
  components/ui/           shadcn/ui primitives used by the app
  lib/
    pipeline.ts            ffmpeg extract → chunked ASR → segmentation → LLM translation
    dubbing.ts             per-segment TTS → timing alignment → adelay/amix mux → MP4 export
    subtitles.ts           SRT / plain-text builders (khmer | bilingual | source)
    db.ts                  Prisma client
    zai.ts                 ZAI SDK helper
prisma/schema.prisma       Project + Segment models
scripts/                   end-to-end test scripts (ffmpeg sample generation)
```

## Getting started

### Prerequisites

- Node.js 20+ (or Bun)
- **ffmpeg** installed and available on `PATH` (used for audio extraction, dubbing and hardsub)
- A Khmer font (e.g. **Noto Sans Khmer**) for hardsub rendering

### Setup

```bash
# 1. install dependencies
npm install        # or: bun install

# 2. configure the database
echo 'DATABASE_URL="file:./prisma/db/custom.db"' > .env

# 3. create the schema
npx prisma generate
npx prisma db push

# 4. run the dev server
npm run dev        # http://localhost:3000
```

The AI capabilities (ASR / translation / TTS) are provided by the bundled `z-ai-web-dev-sdk`; no separate API key is required in this environment. To run elsewhere, wire `src/lib/zai.ts` to your own provider.

### Production build

```bash
npm run build
npm start
```

## Usage

1. Open the site and upload a file — supported: **MP4, MOV, WEBM, MKV, MP3, WAV, M4A**, up to **200 MB**
2. Wait for processing: **EXTRACTING → TRANSCRIBING → TRANSLATING → READY** (live progress in the UI)
3. Review / edit any segment in the subtitle editor; single segments can be re-translated with one click
4. Generate a Khmer synopsis with AI
5. Pick a voice (7 Khmer-capable voices) and click **បង្កើតសំឡេងខ្មែរ** to dub
6. Download:
   - **SRT ដើម** (source-language transcript), **SRT ខ្មែរ**, **SRT ពីរភាសា**
   - plain text exports (`.txt`)
   - **MP4 with Khmer audio** (original audio removed) — `?variant=dubbed`
   - **MP4 with burned-in Khmer subtitles** (hardsub) — `?variant=hardsub`
   - Khmer audio only (`.m4a`) — `?variant=dubbed-audio`
7. In the player, switch between **សំឡេងដើម** (original) and **សំឡេងខ្មែរ** (dubbed) to compare

## Key features in detail

- **Timing-preserving dubbing** — each TTS segment is retried with faster speech if it overruns its slot, then placed at the exact original offset (`adelay`) and mixed into a single track
- **Full audio replacement** — the exported MP4 contains exactly one audio track (Khmer); the original language audio is removed, not muted
- **Meaning-based translation** — the LLM prompt enforces natural Khmer phrasing, converts laughter markers, and forbids omissions
- **Resumable pipeline** — every project keeps its state machine status; failed stages can be retried
- **HTTP Range streaming** — video endpoints support seeking via `206 Partial Content`

## API summary

| Endpoint | Description |
| --- | --- |
| `GET/POST /api/projects` | List / upload projects |
| `GET/DELETE /api/projects/:id` | Project detail (segments, status) / delete |
| `GET /api/projects/:id/video?variant=` | Stream `original` / `dubbed` / `dubbed-audio` / `hardsub` |
| `GET /api/projects/:id/srt?mode=` | SRT download (`source` / `khmer` / `bilingual`) |
| `GET /api/projects/:id/txt?mode=` | Plain text download |
| `POST /api/projects/:id/dub` | Start Khmer dubbing |
| `POST /api/projects/:id/hardsub` | Burn Khmer subtitles into the dubbed MP4 |
| `PATCH /api/segments/:id` | Edit a segment |
| `POST /api/segments/:id/retranslate` | Re-translate one segment |

## License

MIT
