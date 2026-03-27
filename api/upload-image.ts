import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put } from '@vercel/blob'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  console.log('📥 /api/upload-image called')

  try {
    const { imageUrl, index } = req.body

    if (!imageUrl) {
      console.error('❌ No image URL provided in request body')
      return res.status(400).json({ error: 'No image URL provided' })
    }

    console.log(`🔍 Uploading image ${index} from: ${imageUrl.substring(0, 80)}...`)

    const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || process.env.VITE_BLOB_READ_WRITE_TOKEN

    if (!BLOB_TOKEN) {
      console.error('❌ BLOB_READ_WRITE_TOKEN not set — cannot store image permanently')
      return res.status(503).json({
        error: 'BLOB_READ_WRITE_TOKEN not configured — add it to Vercel env vars'
      })
    }

    console.log('📡 Fetching image from fal.ai...')
    const imageResponse = await fetch(imageUrl)
    
    if (!imageResponse.ok) {
      console.error(`❌ Failed to fetch image: ${imageResponse.status}`)
      throw new Error(`Failed to fetch image from fal.ai: ${imageResponse.status}`)
    }
    
    const imageBuffer = await imageResponse.arrayBuffer()
    console.log(`✓ Downloaded ${imageBuffer.byteLength} bytes`)
    
    // Upload to Vercel Blob
    const filename = `story-${Date.now()}-${index}.jpg`
    console.log(`⬆️  Uploading to Vercel Blob as: ${filename}`)
    
    const blob = await put(filename, imageBuffer, {
      access: 'public',
      token: BLOB_TOKEN,
      contentType: 'image/jpeg'
    })
    
    console.log(`✅ Uploaded to Vercel Blob: ${blob.url}`)
    
    return res.status(200).json({ url: blob.url })

  } catch (error: any) {
    console.error('❌ Upload error:', error.message)
    console.error('Full error:', error)
    return res.status(500).json({ 
      error: error.message || 'Upload failed',
      details: error.toString()
    })
  }
}
