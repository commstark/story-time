import { supabase } from '../lib/supabase'

export type JingleKind = 'intro' | 'outro'
export type NarrationStyle = 'standard' | 'expressive'

export interface Narration {
  audioUrl: string
  alignmentUrl: string | null
}

export interface Alignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

export interface Usage {
  used: number
  limit: number
  tier: string
  resetsAt: number | null
}

export const LANGUAGES: { code: string, label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'he', label: 'עברית' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ar', label: 'العربية' },
]

const STYLE_KEY = 'storyTimeNarrationStyle'

export function getNarrationStyle(): NarrationStyle {
  try {
    return localStorage.getItem(STYLE_KEY) === 'expressive' ? 'expressive' : 'standard'
  } catch {
    return 'standard'
  }
}

export function setNarrationStyle(style: NarrationStyle) {
  try {
    localStorage.setItem(STYLE_KEY, style)
  } catch {
    // Preference just won't persist
  }
}

async function post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in to use narration')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`)
  return result as T
}

// Generation is slow and costs credits, so share in-flight requests and results per session
const cache = new Map<string, Promise<unknown>>()

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let pending = cache.get(key) as Promise<T> | undefined
  if (!pending) {
    pending = load()
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
  }
  return pending
}

export function getNarration(storyId: string, voiceId: string | undefined, style: NarrationStyle, language?: string): Promise<Narration> {
  return once(`narrate:${storyId}:${voiceId}:${style}:${language || ''}`, () =>
    post<Narration>('/api/narrate', { action: 'narrate', storyId, voiceId, style, language })
  )
}

export function getJingleUrl(kind: JingleKind): Promise<string> {
  return once(`jingle:${kind}`, () =>
    post<{ audioUrl: string }>('/api/narrate', { action: 'jingle', kind }).then(r => r.audioUrl)
  )
}

export function translateStory(storyId: string, language: string): Promise<{ title: string, text: string }> {
  return once(`translate:${storyId}:${language}`, () =>
    post<{ title: string, text: string }>('/api/narrate', { action: 'translate', storyId, language })
  )
}

export function getAlignment(url: string): Promise<Alignment> {
  return once(`alignment:${url}`, async () => {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Could not load read-along timings')
    return response.json() as Promise<Alignment>
  })
}

export async function cloneVoice(name: string, recording: Blob): Promise<string> {
  const buffer = new Uint8Array(await recording.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000))
  }
  const { voiceId } = await post<{ voiceId: string }>('/api/voice', {
    action: 'clone',
    name,
    audioBase64: btoa(binary),
    mimeType: recording.type,
    consent: true,
  })
  return voiceId
}

export function getUsage(): Promise<Usage> {
  return post<Usage>('/api/voice', { action: 'usage' })
}

// iOS only lets audio start from a tap; playing silence during the tap unlocks the element
// so later tracks can start after network requests finish.
let silentUrl: string | null = null
export function unlockAudio(audio: HTMLAudioElement) {
  if (!silentUrl) {
    const sampleRate = 8000
    const samples = sampleRate / 10
    const buffer = new ArrayBuffer(44 + samples * 2)
    const view = new DataView(buffer)
    const writeText = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
    writeText(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); writeText(8, 'WAVE')
    writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
    writeText(36, 'data'); view.setUint32(40, samples * 2, true)
    silentUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
  }
  audio.src = silentUrl
  audio.play().catch(() => {})
}

export function isUnlockClip(audio: HTMLAudioElement): boolean {
  return silentUrl !== null && audio.src === silentUrl
}

const DEFAULT_VOICE_KEY = 'storyTimeDefaultVoice'

// Voice for stories with no author; undefined means the stock storyteller voice
export function getDefaultVoiceId(): string | undefined {
  try {
    return localStorage.getItem(DEFAULT_VOICE_KEY) || undefined
  } catch {
    return undefined
  }
}

export function setDefaultVoiceId(voiceId: string | undefined) {
  try {
    if (voiceId) localStorage.setItem(DEFAULT_VOICE_KEY, voiceId)
    else localStorage.removeItem(DEFAULT_VOICE_KEY)
  } catch {
    // Preference just won't persist
  }
}

export function voiceForStory(story: { author?: { id: string } }, authors: { id: string, voiceId?: string }[]): string | undefined {
  return authors.find(a => a.id === story.author?.id)?.voiceId ?? getDefaultVoiceId()
}
