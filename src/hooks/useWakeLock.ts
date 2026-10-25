import { useEffect } from 'react'

// Keeps the screen on while `active`. The browser releases the lock whenever the page is
// hidden, so it is requested again each time the page becomes visible.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const request = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) sentinel.release().catch(() => {})
        else lock = sentinel
      } catch {
        // Denied (e.g. low battery mode); the screen just follows its normal timeout
      }
    }

    request()
    document.addEventListener('visibilitychange', request)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', request)
      lock?.release().catch(() => {})
    }
  }, [active])
}
