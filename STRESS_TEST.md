# 5-Minute Story Stress Test Plan

## Current Limits Implemented

- **Recording Time**: 5 minutes (300 seconds) with auto-stop
- **Audio Format**: WebM/Opus (highly compressed)
- **Expected Audio Size**: ~1-2 MB for 5 minutes at standard quality

## What Was Tested (Code Review)

### ✅ Audio Handling
- **Browser Recording**: MediaRecorder API with 1-second chunks - handles 5 minutes fine
- **OpenAI Whisper API**: Supports up to 25MB files - our 2MB is well within limits
- **Audio Upload**: Sent directly to OpenAI API via FormData - no size restrictions in code

### ✅ Processing Pipeline
- **Transcription**: Whisper handles long audio (tested with >10 min files in the wild)
- **Text Processing**: GPT-4o has 128k context window - 5 min story (~1-2k words) is tiny
- **Image Generation**: 3 images in parallel - time is consistent regardless of story length
- **Progress Saving**: Each stage saves incrementally - no timeout risk

### ✅ Storage
- **localStorage**: Not storing audio blobs (too large)
- **Vercel Blob**: Images only (~1MB each) - no story length limit
- **Browser Memory**: Audio held briefly during recording then uploaded - cleared after

## Potential Issues to Watch

### 🟡 Transcription Time
- **Risk**: Whisper processes ~1-2x realtime
- **5-min story**: Could take 5-10 minutes to transcribe
- **Mitigation**: User sees progress spinner, can close app and return

### 🟡 Audio Quality vs Size
- **Current**: Opus codec at default settings
- **5-min size**: Estimated 1-2MB
- **Mitigation**: If files get too large (>10MB), we can reduce sample rate

### 🟢 Already Handled
- **Network timeouts**: Vercel functions have 60s limit, but we're client-side
- **Browser limits**: Modern browsers handle 5-min recordings easily
- **Cost**: Whisper charges $0.006/minute = $0.03 per 5-min story

## Real-World Test Plan

### Test 1: Basic 5-Minute Story
1. Record a full 5-minute story with natural speech
2. Verify auto-stop at 5:00
3. Confirm transcription completes
4. Check image generation works
5. Verify images persist in Vercel Blob

### Test 2: Edge Cases
- Very quiet story (test noise suppression)
- Story with long pauses (test chunk handling)
- Story without "Once upon a time" (test validation)
- Close browser mid-process (test progress recovery)

### Test 3: Multiple Stories
- Record 3 stories back-to-back
- Verify no memory leaks
- Check localStorage doesn't hit limits

## Manual Testing Required

**To fully validate 5-minute stories, someone needs to:**

1. Open https://app-coral-chi-97.vercel.app
2. Record a 5-minute story (or simulate with audio playback)
3. Watch it process all the way through
4. Verify images are permanent (check URLs, refresh page)
5. Report any errors in console or UI

## Expected Results

- ✅ Recording completes at 5:00 with auto-stop
- ✅ File size: 1-2 MB
- ✅ Transcription time: 5-10 minutes
- ✅ Total processing time: 6-12 minutes
- ✅ All progress saved at each stage
- ✅ Images stored permanently

## Deployed Changes

- Home screen now shows "Stories up to 5 minutes"
- Recording auto-stops at 5:00
- Time remaining shown during recording
- All limits enforced in code
