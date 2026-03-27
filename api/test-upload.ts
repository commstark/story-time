import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Test endpoint to verify blob storage configuration
 * GET /api/test-upload
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const checks = {
    timestamp: new Date().toISOString(),
    env: {
      BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN ? 'SET ✓' : 'MISSING ✗',
      FAL_AI_API_KEY: !!process.env.FAL_AI_API_KEY ? 'SET ✓' : 'MISSING ✗',
      VITE_BLOB_READ_WRITE_TOKEN: !!process.env.VITE_BLOB_READ_WRITE_TOKEN ? 'SET ✓' : 'MISSING ✗',
    },
    apiRoutes: {
      generateImage: '/api/generate-image',
      uploadImage: '/api/upload-image',
    },
    status: 'OK'
  }

  // Check if all required env vars are present
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    checks.status = 'WARNING: BLOB_READ_WRITE_TOKEN not set - images will use temporary URLs'
  }
  
  if (!process.env.FAL_AI_API_KEY) {
    checks.status = 'ERROR: FAL_AI_API_KEY not set - image generation will fail'
  }

  const statusCode = checks.status.startsWith('ERROR') ? 500 : 200

  return res.status(statusCode).json(checks)
}
