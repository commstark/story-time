import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Daily ping (Vercel cron) so the free-tier Supabase project
 * never hits the 7-day inactivity pause.
 * GET /api/keep-alive
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    return res.status(500).json({ status: 'ERROR: Supabase env vars not set' })
  }

  try {
    const response = await fetch(`${url}/rest/v1/stories?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    })
    return res.status(response.ok ? 200 : 502).json({
      status: response.ok ? 'OK' : `Supabase returned ${response.status}`,
      timestamp: new Date().toISOString()
    })
  } catch (err: any) {
    return res.status(502).json({ status: `ERROR: ${err.message}` })
  }
}
