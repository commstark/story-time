import type { Story, StoryMoment, StoryPanel } from '../types'
import * as storage from './storyStorage'
import OpenAI from 'openai'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

// Trigger phrases
const START_PHRASE = 'once upon a time'
const END_PHRASE = 'the end'

type StatusCallback = (status: Story['status']) => void

// Progress saving helpers — now async via storyStorage
async function saveProgressData(storyId: string, story: Partial<Story>) {
  try {
    const { audioBlob, ...saveableStory } = story as any
    await storage.saveProgress(storyId, saveableStory)
    console.log(`Progress saved at stage: ${story.status}`)
  } catch (err) {
    console.error('Failed to save progress:', err)
  }
}

export function getProgressForStory(storyId: string): Promise<Partial<Story> | null> {
  return storage.getProgress(storyId)
}

export async function hasProgressForStory(storyId: string): Promise<boolean> {
  const progress = await storage.getProgress(storyId)
  return progress !== null
}

export async function processStory(
  story: Story,
  onStatus: StatusCallback
): Promise<Story> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
  })

  const storyId = story.id

  console.log('Progress will be saved at each step. If something fails, your work is preserved!')

  try {
    // Step 1: Transcribe audio (or resume from saved transcript)
    let storyContent: string

    if (story.transcript) {
      console.log('Resuming from saved transcript')
      storyContent = story.transcript
      onStatus('transcribing')
    } else {
      if (!story.audioBlob) {
        throw new Error('No audio to process')
      }

      onStatus('transcribing')
      const transcript = await transcribeAudio(openai, story.audioBlob)

      await saveProgressData(storyId, { ...story, transcript, status: 'transcribing' })

      const lowerTranscript = transcript.toLowerCase()
      if (!lowerTranscript.includes(START_PHRASE)) {
        throw new Error('Story must start with "Once upon a time..."')
      }

      storyContent = extractStoryContent(transcript)
      await saveProgressData(storyId, { ...story, transcript: storyContent, status: 'transcribing' })
    }

    // Step 2: Clean transcript (or resume from saved)
    let title: string
    let cleanedTranscript: string

    if (story.cleanedTranscript && story.title) {
      console.log('Resuming from cleaned transcript')
      title = story.title
      cleanedTranscript = story.cleanedTranscript
      onStatus('cleaning')
    } else {
      onStatus('cleaning')
      const cleanResult = await cleanTranscript(openai, storyContent)
      title = cleanResult.title
      cleanedTranscript = cleanResult.cleanedTranscript

      await saveProgressData(storyId, {
        ...story,
        transcript: storyContent,
        title,
        cleanedTranscript,
        status: 'cleaning'
      })
    }

    // Step 3: Extract 3 key moments (or resume from saved)
    let moments: StoryMoment[]

    if (story.storyMoments && story.storyMoments.length > 0) {
      console.log('Resuming from extracted moments')
      moments = story.storyMoments
      onStatus('extracting')
    } else {
      onStatus('extracting')
      moments = await extractMoments(openai, cleanedTranscript)

      await saveProgressData(storyId, {
        ...story,
        transcript: storyContent,
        title,
        cleanedTranscript,
        storyMoments: moments,
        status: 'extracting'
      })
    }

    // Step 4: Generate images (or continue from partial)
    onStatus('generating')
    const existingPanels = story.panels || []
    const panels = await generatePanels(moments, storyId, existingPanels)

    // Clear progress on success
    await storage.clearProgress(storyId)

    return {
      ...story,
      audioBlob: undefined,
      title,
      transcript: storyContent,
      cleanedTranscript,
      storyMoments: moments,
      panels,
      status: 'ready',
      revealed: false
    }
  } catch (error) {
    console.error('Story processing failed at:', story.status || 'unknown stage')
    throw error
  }
}

async function transcribeAudio(openai: OpenAI, audioBlob: Blob): Promise<string> {
  const file = new File([audioBlob], 'story.webm', { type: 'audio/webm' })

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'en',
    response_format: 'text'
  })

  return transcription as unknown as string
}

function extractStoryContent(transcript: string): string {
  const lower = transcript.toLowerCase()

  const startIndex = lower.indexOf(START_PHRASE)
  if (startIndex === -1) {
    return transcript
  }

  let endIndex = lower.lastIndexOf(END_PHRASE)

  if (endIndex > startIndex) {
    endIndex = endIndex + END_PHRASE.length
    return transcript.substring(startIndex, endIndex).trim()
  }

  return transcript.substring(startIndex).trim()
}

async function cleanTranscript(openai: OpenAI, transcript: string): Promise<{ title: string, cleanedTranscript: string }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You clean up bedtime story transcripts while PRESERVING THE PARENT'S EXACT WORDS.

This is critical: A parent told this story to their child. Their words are precious and must be kept exactly as spoken. Their children will read this years from now.

DO:
- Remove filler words: "um", "uh", "like", "you know", "so", "well" (when used as filler)
- Remove repeated/stuttered words: "the the" → "the"
- Remove child interruptions: "Daddy I need water", "What's that?"
- Remove parent asides: "Hold on sweetie", "One second", "Where was I"
- Fix obvious transcription errors ONLY if the intended word is 100% clear
- Add paragraph breaks at natural story beats
- Generate a short catchy title (3-6 words)

DO NOT:
- Rewrite sentences
- Add words that weren't spoken
- Change the storyteller's vocabulary or style
- "Improve" the prose
- Make it sound more "book-like"

The output should be the parent's authentic voice, just cleaned up.

Return JSON:
{
  "title": "Short Catchy Title",
  "cleanedTranscript": "The cleaned story text with their exact words..."
}`
      },
      {
        role: 'user',
        content: transcript
      }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('Failed to clean transcript')

  return JSON.parse(content)
}

async function extractMoments(openai: OpenAI, transcript: string): Promise<StoryMoment[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You extract EXACTLY 3 key visual moments from bedtime stories for illustration.

For each moment, provide:
1. A brief description of what's happening
2. Characters present with DETAILED appearance descriptions (be specific: colors, clothing, features)
3. The setting/background
4. The mood (silly, adventurous, peaceful, exciting, etc.)

CRITICAL RULES:
- You MUST return EXACTLY 3 moments, no more, no less
- Character descriptions must be CONSISTENT across all 3 moments
- If the bear is "a large brown bear with a red scarf" in moment 1, use that EXACT description in moments 2 and 3

Return a JSON object with a "moments" array containing exactly 3 objects:
{
  "moments": [
    {
      "index": 1,
      "description": "Scene 1 description",
      "characters": [{"name": "Bobby", "appearance": "detailed appearance", "position": "position in scene"}],
      "setting": "Setting description",
      "mood": "mood"
    },
    {
      "index": 2,
      "description": "Scene 2 description",
      "characters": [{"name": "Bobby", "appearance": "SAME detailed appearance", "position": "position"}],
      "setting": "Setting description",
      "mood": "mood"
    },
    {
      "index": 3,
      "description": "Scene 3 description",
      "characters": [{"name": "Bobby", "appearance": "SAME detailed appearance", "position": "position"}],
      "setting": "Setting description",
      "mood": "mood"
    }
  ]
}`
      },
      {
        role: 'user',
        content: transcript
      }
    ],
    temperature: 0.5,
    response_format: { type: 'json_object' }
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('Failed to extract story moments')

  const parsed = JSON.parse(content)

  let moments: StoryMoment[] | undefined

  if (Array.isArray(parsed)) {
    moments = parsed
  } else if (typeof parsed === 'object' && parsed !== null) {
    if (parsed.index !== undefined && parsed.description) {
      moments = [parsed]
    } else {
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) {
          moments = parsed[key]
          break
        }
      }
    }
  }

  if (!moments || moments.length === 0) {
    throw new Error('Could not parse story moments from AI response')
  }

  // Ensure we have exactly 3 moments
  while (moments.length < 3) {
    const lastMoment = moments[moments.length - 1]
    moments.push({
      ...lastMoment,
      index: moments.length + 1,
      description: lastMoment.description + ' (continued)'
    })
  }

  return moments
}

async function generatePanels(
  moments: StoryMoment[],
  storyId: string,
  existingPanels: StoryPanel[] = []
): Promise<StoryPanel[]> {
  const allCharacters = moments[0].characters
  const characterRef = allCharacters
    .map(c => `${c.name}: ${c.appearance}`)
    .join('. ')

  const completedPanels: StoryPanel[] = [...existingPanels]
  const completedIndices = new Set(completedPanels.map(p => p.index))

  console.log(`Starting image generation. Already have ${completedPanels.length}/3 images`)

  for (const moment of moments) {
    if (completedIndices.has(moment.index)) {
      console.log(`Image ${moment.index}/3 already exists, skipping`)
      continue
    }

    const characterPositions = moment.characters
      .map(c => `${c.name} is ${c.position}`)
      .join('. ')

    const stylePrefix = "children's book watercolor illustration, soft warm colors, consistent characters, whimsical, gentle lighting — "
    const fullPrompt = `${stylePrefix}${moment.description}. Characters: ${characterRef}. ${characterPositions}. Setting: ${moment.setting}. Mood: ${moment.mood}.`
    const simplePrompt = `${stylePrefix}Cheerful scene: ${moment.description.split('.')[0]}. Bright colors, friendly characters, kid-friendly.`

    const permanentUrl = await generateAndUploadImage(fullPrompt, simplePrompt, moment.index)

    if (!permanentUrl) {
      console.warn(`Skipping panel ${moment.index}/3 — could not generate or store image after all retries`)
      continue
    }

    const panel: StoryPanel = {
      index: moment.index,
      imageUrl: permanentUrl,
      caption: moment.description
    }

    completedPanels.push(panel)

    // Save progress after each successful panel
    const progressData = await storage.getProgress(storyId)
    await storage.saveProgress(storyId, {
      ...progressData,
      panels: completedPanels,
      status: 'generating'
    })

    console.log(`Image ${moment.index}/3 complete and saved`)
  }

  return completedPanels.sort((a, b) => a.index - b.index)
}

async function generateAndUploadImage(
  fullPrompt: string,
  simplePrompt: string,
  imageIndex: number
): Promise<string | null> {
  const MAX_GEN_ATTEMPTS = 3

  let tempUrl: string | null = null

  for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
    const prompt = attempt < MAX_GEN_ATTEMPTS ? fullPrompt : simplePrompt
    const label = attempt < MAX_GEN_ATTEMPTS ? 'full' : 'simple fallback'

    try {
      console.log(`Image ${imageIndex}: generation attempt ${attempt}/${MAX_GEN_ATTEMPTS} (${label} prompt)`)

      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `API returned ${response.status}`)
      }

      const { imageUrl } = await response.json()

      if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
        throw new Error('API returned invalid or missing image URL')
      }

      tempUrl = imageUrl
      console.log(`Image ${imageIndex} generated on attempt ${attempt}`)
      break

    } catch (err: any) {
      console.error(`Image ${imageIndex} generation attempt ${attempt} failed:`, err.message)
      if (attempt < MAX_GEN_ATTEMPTS) {
        await delay(1500 * attempt)
      }
    }
  }

  if (!tempUrl) {
    console.error(`Image ${imageIndex}: all ${MAX_GEN_ATTEMPTS} generation attempts failed`)
    return null
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`Image ${imageIndex}: blob upload attempt ${attempt}`)

      const uploadResponse = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: tempUrl, index: imageIndex })
      })

      if (!uploadResponse.ok) {
        const errData = await uploadResponse.json().catch(() => ({}))
        throw new Error(errData.error || `Upload returned ${uploadResponse.status}`)
      }

      const { url } = await uploadResponse.json()

      if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        throw new Error('Upload succeeded but returned invalid URL')
      }

      console.log(`Image ${imageIndex} stored permanently at: ${url}`)
      return url

    } catch (err: any) {
      console.error(`Image ${imageIndex} blob upload attempt ${attempt} failed:`, err.message)
      if (attempt < 2) {
        await delay(1000)
      }
    }
  }

  console.error(`Image ${imageIndex}: blob upload failed after 2 attempts — panel will be skipped`)
  return null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
