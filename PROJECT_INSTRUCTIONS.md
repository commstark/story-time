# Story Time — Project Instructions

> This document exists so Claude (or any AI assistant) can quickly understand the full project and contribute effectively without needing to explore the codebase from scratch. Keep it updated as the project evolves.

---

## 1. App Summary

**Story Time** is a mobile-first web app that lets parents record a bedtime story using their voice, then automatically transcribes it, cleans it up, extracts 3 key visual moments, and generates watercolor-style illustrations for each moment using AI. The finished product is a personal illustrated storybook saved to the family's library.

The experience is designed around a **"secret reveal"**: the parent records the story at night, the app processes it overnight, and the family gathers in the morning to reveal the illustrated storybook together.

---

## 2. Tech Stack

### Frontend
| Library | Version | Purpose |
|---|---|---|
| React | 19.2 | UI framework |
| TypeScript | 5.9 | Type safety throughout |
| Vite | 7.3 | Build tool and dev server |
| Tailwind CSS | 4.1 | Styling (via `@tailwindcss/vite` plugin) |
| Lucide React | 0.563 | Icons throughout the UI |

### Backend (Vercel Serverless Functions)
| Library | Version | Purpose |
|---|---|---|
| `@vercel/node` | 5.6 | Types for Vercel request/response |
| `@fal-ai/client` | 1.9 | fal.ai SDK for image generation |
| `@vercel/blob` | 2.2 | Permanent image storage on Vercel Blob |

### External APIs
| Service | Used For |
|---|---|
| **OpenAI Whisper** (`whisper-1`) | Audio transcription — called directly from browser |
| **OpenAI GPT-4o** | Transcript cleaning + story moment extraction — called directly from browser |
| **fal.ai FLUX Schnell** (`fal-ai/flux/schnell`) | Image generation — called via `/api/generate-image` serverless function |
| **Vercel Blob** | Permanent image storage — images uploaded via `/api/upload-image` |

### Deployment
- **Vercel** — both the static React frontend and the serverless API functions
- **No database** — all story data stored in browser `localStorage`

---

## 3. Environment Variables

### Client-side (prefixed with `VITE_`, accessible in browser code)
| Variable | Required | Purpose |
|---|---|---|
| `VITE_OPENAI_API_KEY` | ✅ Yes | OpenAI API key for Whisper transcription and GPT-4o calls. Called directly from the browser (`dangerouslyAllowBrowser: true`). |

### Server-side (Vercel serverless functions only, never exposed to browser)
| Variable | Required | Purpose |
|---|---|---|
| `FAL_AI_API_KEY` | ✅ Yes | fal.ai API key for FLUX Schnell image generation. |
| `BLOB_READ_WRITE_TOKEN` | ✅ Yes | Vercel Blob token for permanent image storage. Without this, image generation succeeds but images cannot be stored and panels will be skipped. |

**Important:** `VITE_OPENAI_API_KEY` is exposed to the browser bundle. This is an intentional tradeoff for simplicity — it's a personal family app, not a public product. If this ever becomes public-facing, OpenAI calls should be moved server-side.

---

## 4. File Structure

```
app/
├── api/                          # Vercel serverless functions
│   ├── generate-image.ts         # POST — generates one image via fal.ai FLUX Schnell
│   ├── upload-image.ts           # POST — downloads fal.ai image and uploads to Vercel Blob
│   └── test-upload.ts            # Debug/test endpoint (not used in production flow)
│
├── src/
│   ├── App.tsx                   # Root component — owns all state and screen routing
│   ├── main.tsx                  # React entry point
│   ├── App.css                   # All app styles (single CSS file, no CSS modules)
│   │
│   ├── types.ts                  # TypeScript interfaces: Story, StoryPanel, StoryMoment, CharacterDescription
│   │
│   ├── services/
│   │   └── storyProcessor.ts     # Core processing pipeline — transcription, cleaning, moment extraction, image gen
│   │
│   └── screens/
│       ├── HomeScreen.tsx        # Landing screen — shows record/reveal/library buttons
│       ├── RecordingScreen.tsx   # Audio recording UI with timer, pause, cancel
│       ├── ProcessingScreen.tsx  # Shows progress steps while storyProcessor runs
│       ├── RevealScreen.tsx      # Panel-by-panel reveal experience
│       ├── LibraryScreen.tsx     # Grid of all saved stories
│       ├── StoryViewScreen.tsx   # Story detail — read text or view pictures (tabs)
│       └── RecoveryScreen.tsx    # Prompt to resume an incomplete story (component exists, but recovery logic is in App.tsx/HomeScreen)
│
├── public/
│   └── moon.svg                  # App icon
│
├── vercel.json                   # Vercel config — sets maxDuration: 60 for all API routes
├── vite.config.ts                # Minimal Vite config (React plugin only)
├── package.json
└── tsconfig.json
```

### Key File Roles

**`App.tsx`** — Single source of truth for all app state. Owns: current screen, current story being processed, pending story (awaiting reveal), library array, incomplete story (for resume). Persists everything to `localStorage`. All screen transitions happen here.

**`storyProcessor.ts`** — The entire AI pipeline in one file. Six exported/internal functions:
- `processStory()` — top-level orchestrator, called by ProcessingScreen
- `transcribeAudio()` — Whisper API call
- `extractStoryContent()` — trims to "once upon a time...the end"
- `cleanTranscript()` — GPT-4o call to remove filler words, generate title
- `extractMoments()` — GPT-4o call to extract 3 illustrated scenes
- `generatePanels()` — loops over moments, calls generate + upload helpers
- `generateAndUploadImage()` — single-panel helper with retry logic (added Feb 2026)
- `saveProgress()` / `loadProgress()` / `clearProgress()` — localStorage helpers for resume

**`api/generate-image.ts`** — Calls `fal.subscribe()` wrapped in a 50s `Promise.race()` timeout. Returns `{ imageUrl }` on success.

**`api/upload-image.ts`** — Fetches the fal.ai temp URL, uploads the bytes to Vercel Blob, returns `{ url }` with the permanent blob URL.

---

## 5. How the Pipeline Works

### Step 0 — Recording
- User taps "Tell a New Story" → `RecordingScreen`
- Uses `MediaRecorder` API with `audio/webm;codecs=opus`
- Max 5 minutes (auto-stops at 300s)
- User must say **"Once upon a time"** to start and **"The End"** to end — validated in transcription step
- On stop: passes `audioBlob` to `App.tsx` → transitions to Processing

### Step 1 — Transcription (`transcribing`)
- `storyProcessor.ts` calls `openai.audio.transcriptions.create()` with `whisper-1`
- **Runs in browser** with `VITE_OPENAI_API_KEY`
- After transcription: validates presence of "once upon a time" (throws if missing)
- Trims transcript to just the story content between the trigger phrases
- Progress saved to `localStorage` at key `story_progress_<id>`

### Step 2 — Cleaning (`cleaning`)
- GPT-4o call with a strict system prompt
- Removes: filler words (um, uh, like), stutters, child interruptions, parent asides
- **Does NOT rewrite** — preserves the parent's exact words and style
- Also generates a short title (3–6 words)
- Returns: `{ title, cleanedTranscript }`
- Progress saved

### Step 3 — Moment Extraction (`extracting`)
- GPT-4o call that identifies **exactly 3** key visual moments from the story
- Each moment has: `description`, `characters` (with detailed appearance for consistency), `setting`, `mood`
- Character appearances are intentionally verbose to maintain consistency across images
- Returns a `StoryMoment[]` array of exactly 3 items (padded with duplicates if AI returns fewer)
- Progress saved

### Step 4 — Image Generation (`generating`)
- Loops over 3 moments, processes **one at a time** (sequential, not parallel)
- For each panel:
  1. **Generate** — POST to `/api/generate-image` with watercolor-style prompt
     - Uses FLUX Schnell (4 inference steps, 1024×1024 square)
     - Server-side: `fal.subscribe()` wrapped in 50s `Promise.race()` timeout
     - **Retries up to 3 times** (attempts 1–2: full prompt, attempt 3: simpler fallback prompt)
     - Backoff: 1.5s after attempt 1, 3s after attempt 2
     - Returns validated `https://` URL or fails
  2. **Upload** — POST to `/api/upload-image` with the temp fal.ai URL
     - Server downloads the fal.ai image bytes
     - Uploads to Vercel Blob as `story-<timestamp>-<index>.jpg`
     - Returns the permanent blob URL
     - **Retries once** if first upload fails
  3. If both generate + upload fail after all retries → **panel is skipped** (not thrown)
  4. Progress saved after each successful panel
- Story is saved to library even if only 1 or 2 panels succeeded

### Step 5 — Save & Reveal
- `processStory()` returns the completed `Story` object
- `App.tsx` → `handleProcessingComplete()`:
  - Saves story to `PENDING_KEY` in localStorage (for the reveal flow)
  - Adds to the library array (also persisted to `STORIES_KEY`)
  - Clears the in-progress `story_progress_<id>` key
- App returns to Home screen, which shows a "Reveal Today's Story!" button
- Reveal: panel-by-panel slideshow in `RevealScreen.tsx`
- After reveal: story marked `revealed: true` in library

### Resume Flow
- On app load, `App.tsx` scans `localStorage` for `story_progress_*` keys
- If found with a transcript (meaning it got past audio): shows "Resume Incomplete Story" on HomeScreen
- Resuming rehydrates the partial `Story` object and re-enters `processStory()` — it skips already-completed steps

---

## 6. Known Issues & Recent Changes

### Feb 27, 2026 — Bug Fixes (image reliability + timeout)

**Bug 1 fixed: Stories not saving due to image generation failure**
- Previously: any image generation failure threw an error, killing the whole pipeline and losing the story
- Fixed: `generatePanels()` now skips failed panels instead of throwing — story saves with 1–3 panels

**Bug 2 fixed: Black screens from expired fal.ai URLs**
- Previously: if Vercel Blob upload failed (e.g., missing `BLOB_READ_WRITE_TOKEN`), the temporary fal.ai URL was silently saved to the story. fal.ai URLs expire in ~1 hour, causing black screens later.
- Fixed: `generateAndUploadImage()` now only returns a permanent blob URL. If blob upload fails after 2 attempts, `null` is returned and the panel is skipped entirely — never saves an expiring URL.
- Fixed: `upload-image.ts` now returns **503** when `BLOB_READ_WRITE_TOKEN` is missing (previously returned 200 with the temp URL, tricking the client into thinking it succeeded)

**Bug 3 fixed: Vercel serverless timeout**
- Previously: `fal.subscribe()` blocked until fal.ai responded, which could exceed Vercel's 60s hard limit, producing an unclean kill
- Fixed: `fal.subscribe()` is now wrapped in `Promise.race()` with a 50s timeout, so the function exits cleanly and returns a proper error to the client

**Retry logic added:**
- Image generation: 3 attempts total (1.5s → 3s backoff). Attempt 3 uses a simplified "safe fallback" prompt instead of the full prompt.
- Blob upload: 2 attempts (1s between)
- URL validation: every URL returned by fal.ai is validated to be a non-empty `https://` string before being accepted

### Earlier — DALL-E → FLUX Schnell Migration
- App originally used OpenAI DALL-E for image generation
- Migrated to **fal.ai FLUX Schnell** for significantly lower cost
- FLUX Schnell runs 4 inference steps at 1024×1024 (`square_hd`)
- Image generation moved from browser-direct call to server-side via `/api/generate-image` (required for API key security and fal.ai SDK compatibility)

### Earlier — Recovery Feature
- `RecoveryScreen.tsx` component exists but the actual recovery logic lives in `App.tsx` (checking localStorage on mount) and `HomeScreen.tsx` (showing the "Resume" button)
- `RecoveryScreen.tsx` is currently unused in the routing — recovery is surfaced inline on `HomeScreen` instead

---

## 7. Architectural Decisions

### Browser-direct OpenAI calls
OpenAI (Whisper + GPT-4o) is called directly from the browser using `dangerouslyAllowBrowser: true`. This exposes `VITE_OPENAI_API_KEY` in the client bundle. **This is intentional** — it's a private family app, and keeping these calls in the browser avoids Vercel function timeout risk for potentially slow operations (audio files can be large, GPT-4o can be slow). If the app ever goes public, these should move server-side.

### fal.ai via serverless, not browser
Unlike OpenAI, fal.ai image generation runs server-side in `/api/generate-image`. This is partly for API key security and partly because the fal.ai SDK behaves better in a Node environment. The tradeoff: Vercel's 60s function limit applies, hence the `Promise.race()` timeout.

### Sequential image generation (not parallel)
Images are generated one at a time, not `Promise.all()`. This is intentional:
1. Allows saving progress after each image — resume works even if the 2nd or 3rd image fails
2. Avoids hammering fal.ai with 3 concurrent requests that could all timeout together
3. Easier to show meaningful progress to the user

### localStorage as the database
No backend database. Everything lives in the browser's `localStorage`:
- `storyTimeLibrary` — the full library array
- `pendingStory` — the story awaiting reveal
- `story_progress_<id>` — in-progress story for resume

Tradeoff: stories are device-specific and will be lost if the user clears browser data. For a personal family app this is acceptable. Cross-device sync would require a real backend.

### Story panels can be 1–3 (not always 3)
After the Feb 2026 fixes, a story can complete with fewer than 3 panels if image generation/upload fails for some panels. The UI handles this gracefully (`RevealScreen` and `StoryViewScreen` both use `story.panels.length` dynamically). This is preferable to losing the whole story.

### No audio storage
Audio blobs are explicitly discarded after transcription (`audioBlob: undefined` in the returned story). This is intentional for privacy — the parent's voice recording is never persisted or uploaded. Only the cleaned text and images are kept.

### Single CSS file
All styles live in `src/App.css` — no CSS modules, no component-level styles. Simple and fast to work with for a small app.

### Trigger phrase validation
Stories must contain "once upon a time" (case-insensitive). This is validated after transcription and throws a user-friendly error if missing. "The end" is used to trim the transcript but is not required (the story just runs to the end of the recording if absent).

---

## Quick Reference: Adding a New Feature

**New screen:** Create `src/screens/NewScreen.tsx`, add it to the `Screen` type union in `App.tsx`, add a case in the JSX return, wire up navigation.

**New API route:** Create `api/new-route.ts` with a default export handler function. Vercel auto-discovers all files in `api/`. Existing `vercel.json` sets `maxDuration: 60` for all API routes.

**New env var (server-side):** Add to Vercel project settings → Environment Variables. Access via `process.env.VAR_NAME` in `api/` files.

**New env var (client-side):** Must be prefixed `VITE_`. Access via `import.meta.env.VITE_VAR_NAME` in `src/` files.

**Changing the image model:** Update `api/generate-image.ts` — change the model ID in `fal.subscribe()` and adjust `input` parameters to match the new model's schema.

**Changing story structure (more/fewer panels):** Update `extractMoments()` system prompt in `storyProcessor.ts`, update the padding logic (`while (moments.length < 3)`), update `generatePanels()` loop, and update any UI references to "3 panels" in comments.
