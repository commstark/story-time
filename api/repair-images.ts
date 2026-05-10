import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { fal } from '@fal-ai/client'
import { put } from '@vercel/blob'

const MIN_IMAGE_BYTES = 50_000
const FAL_TIMEOUT_MS = 50_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const falKey = process.env.FAL_AI_API_KEY
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN

  if (!supabaseUrl || !supabaseKey || !falKey || !blobToken) {
    return res.status(500).json({ error: 'Missing env vars. Need VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FAL_AI_API_KEY, BLOB_READ_WRITE_TOKEN' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  fal.config({ credentials: falKey })

  // Get all stories with panels
  const { data: stories, error } = await supabase
    .from('stories')
    .select('id, panels, moments')
    .not('panels', 'eq', '[]')

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch stories', details: error.message })
  }

  const results: { storyId: string; panel: number; status: string }[] = []

  for (const story of stories || []) {
    const panels = story.panels as { index: number; imageUrl: string; caption: string }[]
    const moments = story.moments as { index: number; description: string; characters: { name: string; appearance: string; position: string }[]; setting: string; mood: string }[]

    if (!panels || !moments) continue

    let updated = false

    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i]
      if (!panel.imageUrl) {
        results.push({ storyId: story.id, panel: panel.index, status: 'skipped: no URL' })
        continue
      }

      // Check image size
      try {
        const headRes = await fetch(panel.imageUrl, { method: 'HEAD' })
        if (!headRes.ok) {
          results.push({ storyId: story.id, panel: panel.index, status: 'skipped: URL 404' })
          continue
        }
        const size = parseInt(headRes.headers.get('content-length') || '0', 10)
        if (size >= MIN_IMAGE_BYTES) {
          continue // Image is fine
        }

        console.log(`Story ${story.id} panel ${panel.index}: ${size} bytes — regenerating`)

        // Find matching moment for the prompt
        const moment = moments.find(m => m.index === panel.index)
        if (!moment) {
          results.push({ storyId: story.id, panel: panel.index, status: 'skipped: no matching moment' })
          continue
        }

        const allChars = moments[0]?.characters || []
        const charRef = allChars.map(c => `${c.name}: ${c.appearance}`).join('. ')
        const stylePrefix = "children's book watercolor illustration, soft warm colors, consistent characters, whimsical, gentle lighting — "
        const prompt = `${stylePrefix}${moment.description}. Characters: ${charRef}. Setting: ${moment.setting}. Mood: ${moment.mood}.`

        // Generate new image
        const result = await Promise.race([
          fal.subscribe('fal-ai/flux/schnell', {
            input: { prompt, image_size: 'square_hd', num_inference_steps: 4, num_images: 1 }
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), FAL_TIMEOUT_MS))
        ]) as any

        const tempUrl = result.data?.images?.[0]?.url || result.images?.[0]?.url
        if (!tempUrl) {
          results.push({ storyId: story.id, panel: panel.index, status: 'failed: no URL from fal.ai' })
          continue
        }

        // Download and validate
        const imgRes = await fetch(tempUrl)
        const imgBuffer = await imgRes.arrayBuffer()
        if (imgBuffer.byteLength < MIN_IMAGE_BYTES) {
          results.push({ storyId: story.id, panel: panel.index, status: `failed: regenerated image still too small (${imgBuffer.byteLength} bytes)` })
          continue
        }

        // Upload to Vercel Blob
        const filename = `story-${story.id}-repair-${panel.index}.jpg`
        const blob = await put(filename, imgBuffer, { access: 'public', token: blobToken, contentType: 'image/jpeg', addRandomSuffix: true })

        panels[i] = { ...panel, imageUrl: blob.url }
        updated = true
        results.push({ storyId: story.id, panel: panel.index, status: `repaired: ${blob.url.substring(0, 60)}...` })

      } catch (err: any) {
        results.push({ storyId: story.id, panel: panel.index, status: `error: ${err.message}` })
      }
    }

    if (updated) {
      const { error: updateErr } = await supabase
        .from('stories')
        .update({ panels })
        .eq('id', story.id)
      if (updateErr) {
        results.push({ storyId: story.id, panel: -1, status: `DB update failed: ${updateErr.message}` })
      }
    }
  }

  const repaired = results.filter(r => r.status.startsWith('repaired')).length
  const failed = results.filter(r => r.status.startsWith('failed') || r.status.startsWith('error')).length

  return res.status(200).json({
    summary: `${repaired} repaired, ${failed} failed, ${stories?.length || 0} stories scanned`,
    details: results
  })
}
