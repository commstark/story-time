import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fal } from '@fal-ai/client'

// 50s — safely under Vercel's 60s hard kill limit
const FAL_TIMEOUT_MS = 50_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { prompt } = req.body

    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' })
    }

    const FAL_AI_API_KEY = process.env.FAL_AI_API_KEY

    if (!FAL_AI_API_KEY) {
      return res.status(500).json({ error: 'FAL_AI_API_KEY not configured on server' })
    }

    fal.config({ credentials: FAL_AI_API_KEY })

    // Race fal.ai against a 50s timeout so we fail fast instead of being
    // hard-killed by Vercel's 60s limit (which produces an unclean error)
    const result = await Promise.race([
      fal.subscribe('fal-ai/flux/schnell', {
        input: {
          prompt,
          image_size: 'square_hd',
          num_inference_steps: 4,
          num_images: 1
        }
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('fal.ai timed out after 50s')), FAL_TIMEOUT_MS)
      )
    ]) as any

    // fal.ai wraps response in .data on some SDK versions
    const imageUrl = result.data?.images?.[0]?.url || result.images?.[0]?.url

    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      console.error('❌ Invalid or missing imageUrl in result:', JSON.stringify(result, null, 2))
      return res.status(500).json({
        error: 'No valid image URL returned from fal.ai',
        debug: result
      })
    }

    console.log(`✓ Generated image: ${imageUrl}`)
    return res.status(200).json({ imageUrl })

  } catch (error: any) {
    console.error('Image generation error:', error.message)
    return res.status(500).json({
      error: error.message || 'Image generation failed',
      details: error.body || error.toString()
    })
  }
}
