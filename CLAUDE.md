# Bedtime Storytime App

A web app for parents to record bedtime stories told to their children, with automatic transcription, AI cleanup, and watercolor illustrations.

## Tech Stack

- **Frontend:** React 19 + Vite
- **Deployment:** Vercel (serverless functions + static hosting)
- **Transcription:** OpenAI Whisper API
- **Image Generation:** FLUX.1 Schnell via fal.ai
- **Storage:** Vercel Blob (for permanent image URLs)
- **Styling:** Tailwind CSS 4

## Architecture

### Client-Side (`src/`)
- **React app** built with Vite
- Records audio in browser using MediaRecorder API
- Calls serverless API routes for processing
- Displays story with images and text

### Server-Side (`api/`)
Vercel serverless functions (Node.js):

- **`/api/generate-image`** - Calls fal.ai to generate images (keeps API key secret)
- **`/api/upload-image`** - Downloads from fal.ai, uploads to Vercel Blob for permanence
- **`/api/test-upload`** - Debug endpoint to verify env var configuration

### Story Processing Pipeline

1. **Record** - User records audio telling a bedtime story
2. **Transcribe** - OpenAI Whisper converts speech to text
3. **Clean** - GPT-4 removes filler words while preserving parent's voice
4. **Extract Moments** - GPT-4 identifies 3 key visual scenes with consistent character descriptions
5. **Generate Images** - FLUX.1 Schnell creates 3 watercolor illustrations via `/api/generate-image`
6. **Upload to Blob** - Images uploaded to Vercel Blob via `/api/upload-image` for permanent URLs
7. **Display** - Story shown with title, text, and images

## Environment Variables

### Production (Vercel Dashboard → Settings → Environment Variables)

**Client-side (VITE_ prefix - exposed to browser):**
```
VITE_OPENAI_API_KEY=sk-proj-...
```

**Server-side (no VITE_ prefix - kept secret):**
```
FAL_AI_API_KEY=<your-fal-api-key>
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

### Local Development (`.env`)

```bash
# Client-side
VITE_OPENAI_API_KEY=sk-proj-...

# Server-side
FAL_AI_API_KEY=<your-fal-api-key>
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

**Important:** 
- `FAL_AI_API_KEY` has NO `VITE_` prefix - this keeps it server-side only for security
- `BLOB_READ_WRITE_TOKEN` is needed for permanent image storage (without it, images use temporary fal.ai URLs that expire)

## Getting API Keys

### OpenAI (Whisper transcription + GPT-4 cleanup)
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Add as `VITE_OPENAI_API_KEY`

### fal.ai (FLUX image generation)
1. Go to https://fal.ai/dashboard
2. Sign up / sign in
3. Go to API Keys section
4. Copy your key
5. Add as `FAL_AI_API_KEY` (no VITE_ prefix!)

### Vercel Blob (permanent image storage)
1. In Vercel dashboard → Your project → **Storage** tab
2. Click **"Create Database"** → Select **"Blob"**
3. Name it (e.g., "storytime-images")
4. Go to the Blob store → **".env.local" tab**
5. Copy the `BLOB_READ_WRITE_TOKEN` value
6. Add to project's Environment Variables

## Project Structure

```
app/                          ← PRODUCTION CODEBASE (use this)
├── api/
│   ├── generate-image.ts     ← Server-side FLUX image generation
│   ├── upload-image.ts       ← Server-side Vercel Blob upload
│   └── test-upload.ts        ← Debug endpoint for env var check
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx    ← Landing page
│   │   ├── RecordingScreen.tsx  ← Audio recording UI
│   │   ├── ProcessingScreen.tsx ← Progress display
│   │   └── RecoveryScreen.tsx   ← Resume from saved progress
│   ├── services/
│   │   └── storyProcessor.ts    ← Main processing logic
│   ├── types.ts              ← TypeScript interfaces
│   └── App.tsx               ← Main app component
├── DEPLOYMENT.md             ← Vercel deployment guide
├── CLAUDE.md                 ← This file
├── package.json
├── vite.config.ts
└── vercel.json               ← Vercel config (API timeout: 60s)

storytime-app/                ← OLD/UNUSED - ignore this
```

**Note:** Only `app/` is the production codebase. `storytime-app/` is legacy and should be ignored.

## Local Development

**Start dev server with API routes:**
```bash
cd app
vercel dev --listen 5173
```

**Why `vercel dev` instead of `npm run dev`?**
- `npm run dev` only runs Vite (frontend) - API routes return 404
- `vercel dev` runs both Vite + serverless functions locally

## Deployment

### First Time Setup

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Link project:**
   ```bash
   cd app
   vercel link
   ```

3. **Add environment variables** in Vercel dashboard (see "Environment Variables" section above)

### Deploy to Production

```bash
cd app
vercel --prod
```

Or just push to GitHub if connected - Vercel will auto-deploy.

### Verify Deployment

Check env var configuration:
```
https://your-app.vercel.app/api/test-upload
```

Should return:
```json
{
  "env": {
    "BLOB_READ_WRITE_TOKEN": "SET ✓",
    "FAL_AI_API_KEY": "SET ✓"
  },
  "status": "OK"
}
```

## Debugging

### Images not generating

**Check browser console (Cmd+Option+J on Mac):**
- Look for errors during "Generating images..." step
- Should see: `✓ Generated image 1/3`, `✓ Generated image 2/3`, etc.

**Check Vercel function logs:**
1. Go to Vercel dashboard → Your project → Deployments
2. Click latest deployment → **Functions** tab
3. Look for errors from `/api/generate-image`

**Common issues:**
- `Forbidden` error → fal.ai account out of credits (add credits at fal.ai/dashboard/billing)
- `FAL_AI_API_KEY not configured` → Add env var in Vercel dashboard
- `401 Unauthorized` → Invalid fal.ai API key, regenerate it

### Images disappear after a while

**Cause:** `BLOB_READ_WRITE_TOKEN` not set, using temporary fal.ai URLs that expire in ~1 hour

**Fix:** Set up Vercel Blob storage (see "Getting API Keys" section above)

**Verify:**
```
https://your-app.vercel.app/api/test-upload
```

Should show `BLOB_READ_WRITE_TOKEN: SET ✓`

### Upload failing

**Check browser console for:**
```
⚠️ Blob upload failed (XXX): <error message>
```

**Check Vercel function logs for `/api/upload-image`:**
- Logs each step: fetch → download → upload
- Shows byte counts and final Blob URL

## Features

### Story Recording
- Browser-based audio recording (WebM format)
- Visual waveform animation during recording
- Trigger phrases: "Once upon a time" (start), "The end" (end)

### Transcription
- OpenAI Whisper API converts speech to text
- English language assumed

### Story Cleanup
- GPT-4 removes filler words ("um", "uh", "like") while preserving parent's authentic voice
- Removes child interruptions and parent asides
- Adds natural paragraph breaks
- Generates short catchy title (3-6 words)
- **Critical:** Does NOT rewrite or "improve" - keeps parent's exact words

### Image Generation
- Extracts exactly 3 key visual moments from story
- GPT-4 creates detailed, consistent character descriptions
- FLUX.1 Schnell generates watercolor-style illustrations
- Server-side processing keeps API key secure
- Images uploaded to Vercel Blob for permanence

### Progress Saving
- Saves progress to localStorage after each step
- Can resume if process is interrupted
- Recovery screen shows last checkpoint
- Audio deleted after transcription (privacy)

## Cost Estimates (per story)

- **OpenAI Whisper:** ~$0.01 per minute of audio
- **GPT-4 (cleanup + moments):** ~$0.05 per story
- **FLUX.1 Schnell:** ~$0.015 per image × 3 = ~$0.045
- **Vercel Blob:** ~$0.001 storage per month per image

**Total per story:** ~$0.10 - $0.15 (for a 1-minute story)

## Known Limitations

- No user accounts (stories stored in localStorage only)
- No story library / browsing past stories
- English only (Whisper API set to `language: 'en'`)
- 3 images only (hardcoded)
- No audio playback of original recording (deleted after transcription for privacy)
- Watercolor style is hardcoded in prompt

## Security Notes

- ✅ FAL API key kept server-side only (no VITE_ prefix)
- ✅ Image generation goes through `/api/generate-image` proxy
- ⚠️ OpenAI API key is client-side (VITE_ prefix) - acceptable for Whisper, but monitor usage
- ✅ Vercel Blob token server-side only
- ✅ Audio files never leave user's device unencrypted (sent directly to OpenAI Whisper)
- ✅ Original audio deleted after transcription (privacy)

## Future Enhancements

- [ ] User accounts + story library
- [ ] Share stories via link
- [ ] Custom illustration styles
- [ ] Multi-language support
- [ ] Audio playback of original recording (opt-in)
- [ ] More than 3 images (configurable)
- [ ] PDF export for printing
- [ ] Mobile app (React Native)

---

**Production URL:** https://app-coral-chi-97.vercel.app  
**Last Updated:** February 19, 2026
