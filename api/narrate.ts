import type { VercelRequest, VercelResponse } from '@vercel/node'
import { list, put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'

/**
 * Story audio and translations, generated once and cached in Vercel Blob.
 *
 * POST /api/narrate { action: 'narrate', storyId, voiceId?, style?, language? }
 *   → { audioUrl, alignmentUrl? }  ElevenLabs text-to-speech (alignment = per-character timings for read-along)
 * POST /api/narrate { action: 'translate', storyId, language }
 *   → { title, text }  GPT translation of the cleaned story
 * POST /api/narrate { action: 'jingle', kind: 'intro' | 'outro' }
 *   → { audioUrl }  5-second ElevenLabs sound-effects jingle
 *
 * Requires `Authorization: Bearer <supabase access token>`. Stories are read with the
 * caller's token, so row-level security limits everything to the caller's own stories.
 */

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'
// Guards against accidentally spending a month of credits on one request
const MAX_CHARS = 12_000

const MODELS = {
  standard: 'eleven_flash_v2_5',
  expressive: 'eleven_v3',
} as const
type Style = keyof typeof MODELS

const LANGUAGES: Record<string, string> = {
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese',
  he: 'Hebrew', zh: 'Mandarin Chinese', ja: 'Japanese', hi: 'Hindi', ar: 'Arabic',
}

const JINGLE_PROMPTS: Record<string, string> = {
  intro: "Short cheerful children's music box and xylophone jingle, playful bedtime story intro, gentle and happy",
  outro: "Short soft children's music box lullaby jingle, sleepy goodnight ending, gentle and calm, fades out",
}

type Env = {
  supabaseUrl: string
  supabaseKey: string
  elevenKey: string
  blobToken: string
  openaiKey?: string
  token: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  const elevenKey = process.env.ELEVENLABS_API_KEY
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.VITE_BLOB_READ_WRITE_TOKEN
  const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY

  if (!supabaseUrl || !supabaseKey || !elevenKey || !blobToken) {
    return res.status(503).json({
      error: 'Missing env vars: ELEVENLABS_API_KEY, BLOB_READ_WRITE_TOKEN and the Supabase vars must all be set in Vercel'
    })
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Sign in required' })

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` }
  })
  if (!userResponse.ok) return res.status(401).json({ error: 'Invalid or expired session' })

  const env: Env = { supabaseUrl, supabaseKey, elevenKey, blobToken, openaiKey, token }
  const body = req.body || {}

  try {
    switch (body.action) {
      case 'narrate':
        return res.status(200).json(await narrate(env, body))
      case 'translate':
        return res.status(200).json(await translate(env, String(body.storyId || ''), String(body.language || '')))
      case 'jingle':
        return res.status(200).json(await jingle(env, String(body.kind || '')))
      default:
        return res.status(400).json({ error: 'Unknown action' })
    }
  } catch (error: any) {
    console.error(`/api/narrate ${body.action} failed:`, error.message)
    return res.status(error.status || 502).json({ error: error.message || 'Request failed' })
  }
}

// --- Actions ---

async function narrate(env: Env, body: any) {
  const storyId = safeId(body.storyId)
  const voiceId = safeId(body.voiceId) || DEFAULT_VOICE_ID
  const style: Style = body.style === 'expressive' ? 'expressive' : 'standard'
  const language = body.language && LANGUAGES[body.language] ? String(body.language) : ''
  const modelId = MODELS[style]

  const pathname = `narrations/${storyId}-${voiceId}-${style}-${language || 'orig'}`
  const cached = await findCached(env, pathname)
  if (cached['.mp3']) {
    return { audioUrl: cached['.mp3'], alignmentUrl: cached['.json'] ?? null, cached: true }
  }

  const { title, text } = language
    ? await translate(env, storyId, language)
    : await loadStory(env, storyId)

  let script = `${title}.\n\n${text}`
  if (script.length > MAX_CHARS) {
    throw httpError(413, `Story is ${script.length} characters, over the ${MAX_CHARS} limit`)
  }

  if (style === 'expressive') {
    script = await addAudioTags(env, script)
  }

  const languageParam = language ? { language_code: language } : {}

  if (style === 'standard') {
    const result = await elevenLabsJson(env, `/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      text: script,
      model_id: modelId,
      voice_settings: { stability: 0.6, similarity_boost: 0.8, speed: 0.92 },
      ...languageParam,
    })
    const audio = Buffer.from(result.audio_base64, 'base64')
    const audioUrl = await store(env, pathname, '.mp3', audio, 'audio/mpeg')
    const alignmentUrl = await store(env, pathname, '.json', JSON.stringify(result.alignment), 'application/json')
    console.log(`Narrated ${storyId} (${style}, ${language || 'original'}): ${script.length} chars`)
    return { audioUrl, alignmentUrl, cached: false, characters: script.length }
  }

  // v3 is the expressive model; it returns audio only, so read-along is unavailable in this style
  const audio = await elevenLabsAudio(env, `/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    text: script,
    model_id: modelId,
    voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    ...languageParam,
  })
  const audioUrl = await store(env, pathname, '.mp3', audio, 'audio/mpeg')
  console.log(`Narrated ${storyId} (${style}, ${language || 'original'}): ${script.length} chars`)
  return { audioUrl, alignmentUrl: null, cached: false, characters: script.length }
}

async function translate(env: Env, rawStoryId: string, language: string) {
  const storyId = safeId(rawStoryId)
  const languageName = LANGUAGES[language]
  if (!storyId || !languageName) throw httpError(400, 'storyId and a supported language are required')

  const pathname = `translations/${storyId}-${language}`
  const cached = await findCached(env, pathname)
  if (cached['.json']) {
    const response = await fetch(cached['.json'])
    if (response.ok) return response.json() as Promise<{ title: string, text: string }>
  }

  const story = await loadStory(env, storyId)
  const result = await openai(env, [
    {
      role: 'system',
      content: `Translate this bedtime story, which a parent told their child, into ${languageName}.
Keep the parent's voice, simple vocabulary a young child understands, and the paragraph breaks.
Keep character names as they are. Do not add, remove or embellish anything.
Return JSON: { "title": "...", "text": "..." }`
    },
    { role: 'user', content: JSON.stringify(story) },
  ])
  const translation = { title: String(result.title || story.title), text: String(result.text || '') }
  if (!translation.text) throw httpError(502, 'Translation came back empty')

  await store(env, pathname, '.json', JSON.stringify(translation), 'application/json')
  return translation
}

async function jingle(env: Env, kind: string) {
  const prompt = JINGLE_PROMPTS[kind]
  if (!prompt) throw httpError(400, 'Unknown jingle')

  const pathname = `jingles/${kind}-v1`
  const cached = await findCached(env, pathname)
  if (cached['.mp3']) return { audioUrl: cached['.mp3'], cached: true }

  const audio = await elevenLabsAudio(env, '/sound-generation', {
    text: prompt,
    duration_seconds: 5,
    prompt_influence: 0.6,
  })
  return { audioUrl: await store(env, pathname, '.mp3', audio, 'audio/mpeg'), cached: false }
}

// --- Helpers ---

async function loadStory(env: Env, storyId: string) {
  const response = await fetch(
    `${env.supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=title,cleaned_transcript`,
    { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.token}` } }
  )
  const rows = response.ok ? await response.json() : []
  if (!rows[0]?.cleaned_transcript) throw httpError(404, 'Story not found or has no text')
  return { title: String(rows[0].title || 'A bedtime story'), text: String(rows[0].cleaned_transcript) }
}

async function addAudioTags(env: Env, script: string): Promise<string> {
  const result = await openai(env, [
    {
      role: 'system',
      content: `You prepare bedtime stories for an expressive text-to-speech voice.
Insert a few ElevenLabs v3 audio tags in square brackets where they fit naturally, such as
[softly], [whispers], [excited], [giggles], [gasps], [sighs], [sleepy], [pause].
Use at most one tag every two or three sentences, and end sleepy and calm.
Do NOT change, add or remove any of the story's words. Return JSON: { "text": "..." }`
    },
    { role: 'user', content: script },
  ])
  return String(result.text || script)
}

async function openai(env: Env, messages: { role: string, content: string }[]) {
  if (!env.openaiKey) throw httpError(503, 'OPENAI_API_KEY not set in Vercel')
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', messages, temperature: 0.3, response_format: { type: 'json_object' } }),
  })
  if (!response.ok) throw httpError(502, `OpenAI returned ${response.status}`)
  const data = await response.json()
  return JSON.parse(data.choices?.[0]?.message?.content || '{}')
}

async function elevenLabsAudio(env: Env, path: string, body: unknown): Promise<Buffer> {
  const response = await elevenLabsFetch(env, path, body, 'audio/mpeg')
  return Buffer.from(await response.arrayBuffer())
}

async function elevenLabsJson(env: Env, path: string, body: unknown): Promise<any> {
  const response = await elevenLabsFetch(env, path, body, 'application/json')
  return response.json()
}

async function elevenLabsFetch(env: Env, path: string, body: unknown, accept: string) {
  const response = await fetch(`${ELEVENLABS_API}${path}`, {
    method: 'POST',
    headers: { 'xi-api-key': env.elevenKey, 'Content-Type': 'application/json', Accept: accept },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw httpError(502, `ElevenLabs returned ${response.status}: ${detail.slice(0, 300)}`)
  }
  return response
}

// Each cache key is a folder; files inside it are keyed by extension
async function findCached(env: Env, folder: string): Promise<Record<string, string>> {
  const { blobs } = await list({ prefix: `${folder}/`, token: env.blobToken, limit: 10 })
  const found: Record<string, string> = {}
  for (const blob of blobs) {
    const ext = blob.pathname.slice(blob.pathname.lastIndexOf('.'))
    found[ext] = blob.url
  }
  return found
}

// The random filename keeps public URLs unguessable, since these are private family stories
async function store(env: Env, folder: string, ext: string, data: Buffer | string, contentType: string): Promise<string> {
  const blob = await put(`${folder}/${randomUUID()}${ext}`, data, {
    access: 'public',
    token: env.blobToken,
    contentType,
    addRandomSuffix: false,
  })
  return blob.url
}

function safeId(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^A-Za-z0-9_-]/g, '') : ''
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}
