# Deployment Checklist

## Vercel Environment Variables

Go to your Vercel project → **Settings** → **Environment Variables** and add:

### Required for all environments (Production, Preview, Development):

```
# Client-side (VITE_ prefix - safe to expose)
VITE_OPENAI_API_KEY=sk-proj-...
VITE_BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Server-side ONLY (no VITE_ prefix - kept secret)
FAL_AI_API_KEY=<your-fal-api-key>
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

**⚠️ Security:** `FAL_AI_API_KEY` has NO `VITE_` prefix — this keeps it server-side only. Never add `VITE_FAL_AI_API_KEY` or the key will leak to the browser.

### Get your FAL API key:
1. Go to https://fal.ai/dashboard
2. Create account / sign in
3. Go to API Keys section
4. Copy your key

### Get Vercel Blob token:
1. In Vercel dashboard → Storage tab
2. Click "Create Database" → Select "Blob"
3. Create a new Blob store (name it anything, e.g., "storytime-images")
4. Once created, go to the Blob store → ".env.local" tab
5. Copy the `BLOB_READ_WRITE_TOKEN` value
6. Add it to your project's Environment Variables (Settings → Environment Variables)

**⚠️ CRITICAL:** Without `BLOB_READ_WRITE_TOKEN`, images use temporary fal.ai URLs that expire in ~1 hour!

---

## Verify Production Setup

After deploying, test your API routes:

**1. Check env vars:**
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

If you see "MISSING ✗", add the missing env vars in Vercel dashboard.

**2. Check Vercel function logs:**
- Go to your deployment in Vercel
- Click "Functions" tab
- Look for errors from `/api/generate-image` and `/api/upload-image`

---

## Testing Locally

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your API keys in `.env`

3. Run dev server:
   ```bash
   npm run dev
   ```

4. Check browser console for errors:
   - ✅ Should see: `✓ Generated image 1/3`
   - ❌ Watch for: `⚠️ VITE_FAL_AI_API_KEY is not configured!`

---

## Common Issues

### "Images load then stop with no error"
- **Cause:** `FAL_AI_API_KEY` not set in Vercel (or set with `VITE_` prefix by mistake)
- **Fix:** Add `FAL_AI_API_KEY` (NO `VITE_` prefix) to Vercel env vars and redeploy

### "Image generation failed: 401 Unauthorized"
- **Cause:** Invalid FAL API key on server
- **Fix:** Regenerate key at fal.ai/dashboard and update `FAL_AI_API_KEY` in Vercel

### "API returned 500"
- **Cause:** Server-side error in `/api/generate-image`
- **Fix:** Check Vercel function logs for details

### "Images disappear after a while"
- **Cause:** Blob upload failing, using temp URLs
- **Fix:** Check `BLOB_READ_WRITE_TOKEN` is set correctly

---

## Deployment Flow

1. Commit your changes:
   ```bash
   git add .
   git commit -m "Fix image generation error handling"
   git push
   ```

2. Vercel auto-deploys on push

3. Check deployment logs in Vercel dashboard

4. Test a story generation on production URL

---

## Debug Mode

Open browser console (F12) and watch for:
- `✓ Generated image 1/3` (success)
- `❌ Image generation failed` (error with details)
- `📦 Uploaded to Vercel Blob` (storage success)
- `⚠️ Using temporary fal.ai URL` (storage issue)
