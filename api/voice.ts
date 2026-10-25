import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * ElevenLabs voice management.
 *
 * POST /api/voice { action: 'clone', name, audioBase64, mimeType, consent: true }
 *   → { voiceId }  Instant Voice Clone from a 1–2 minute recording
 * POST /api/voice { action: 'usage' }
 *   → { used, limit, tier, resetsAt }  credits used this billing period
 *
 * Requires `Authorization: Bearer <supabase access token>`.
 */

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'
// Vercel's request body limit is 4.5 MB; base64 adds a third
const MAX_AUDIO_BYTES = 3_000_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (!supabaseUrl || !supabaseKey || !elevenKey) {
    return res.status(503).json({ error: 'ELEVENLABS_API_KEY and the Supabase vars must be set in Vercel' })
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const userResponse = token
    ? await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } })
    : null
  if (!userResponse?.ok) return res.status(401).json({ error: 'Sign in required' })

  const body = req.body || {}

  try {
    if (body.action === 'usage') {
      const response = await fetch(`${ELEVENLABS_API}/user/subscription`, { headers: { 'xi-api-key': elevenKey } })
      if (!response.ok) throw new Error(`ElevenLabs returned ${response.status}: ${(await response.text()).slice(0, 200)}`)
      const sub = await response.json()
      return res.status(200).json({
        used: sub.character_count,
        limit: sub.character_limit,
        tier: sub.tier,
        resetsAt: sub.next_character_count_reset_unix ? sub.next_character_count_reset_unix * 1000 : null,
      })
    }

    if (body.action === 'clone') {
      if (body.consent !== true) {
        return res.status(400).json({ error: 'Confirm this is your own voice before cloning' })
      }
      const name = String(body.name || '').trim().slice(0, 40)
      const mimeType = String(body.mimeType || 'audio/webm')
      const audio = Buffer.from(String(body.audioBase64 || ''), 'base64')
      if (!name || audio.length === 0) return res.status(400).json({ error: 'name and audio are required' })
      if (audio.length > MAX_AUDIO_BYTES) return res.status(413).json({ error: 'Recording is too large; keep it under 2 minutes' })

      const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm'
      const form = new FormData()
      form.append('name', `Story Time – ${name}`)
      form.append('description', 'Bedtime story narrator voice, cloned from the parent with consent')
      form.append('remove_background_noise', 'true')
      form.append('files', new Blob([audio], { type: mimeType }), `sample.${extension}`)

      const response = await fetch(`${ELEVENLABS_API}/voices/add`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey },
        body: form,
      })
      if (!response.ok) throw new Error(`ElevenLabs returned ${response.status}: ${(await response.text()).slice(0, 300)}`)
      const { voice_id } = await response.json()
      return res.status(200).json({ voiceId: voice_id })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (error: any) {
    console.error(`/api/voice ${body.action} failed:`, error.message)
    return res.status(502).json({ error: error.message || 'Request failed' })
  }
}
