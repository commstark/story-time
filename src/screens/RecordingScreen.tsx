import { useState, useRef, useEffect } from 'react'
import { Mic, Square, X, Circle, Pause, Play } from 'lucide-react'

interface RecordingScreenProps {
  onComplete: (audioBlob: Blob) => void
  onCancel: () => void
}

export function RecordingScreen({ onComplete, onCancel }: RecordingScreenProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [interrupted, setInterrupted] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const isCancellingRef = useRef(false)
  const isUserStoppingRef = useRef(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // Not supported (iPhone Safari) or denied — continue without it
    }
  }

  const releaseWakeLock = () => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }

  // Re-request wake lock when tab becomes visible mid-recording
  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        mediaRecorderRef.current?.state === 'recording'
      ) {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      releaseWakeLock()
    }
  }, [])

  const startRecording = async () => {
    isCancellingRef.current = false
    isUserStoppingRef.current = false
    setInterrupted(false)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      })

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        releaseWakeLock()

        if (isCancellingRef.current) return

        if (!isUserStoppingRef.current) {
          // Unexpected stop (screen lock, backgrounded, OS killed stream)
          setIsRecording(false)
          setIsPaused(false)
          setInterrupted(true)
          if (timerRef.current) clearInterval(timerRef.current)
          return
        }

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        onComplete(audioBlob)
      }

      mediaRecorder.start(1000)
      setIsRecording(true)
      setDuration(0)
      await requestWakeLock()

      timerRef.current = window.setInterval(() => {
        setDuration(d => {
          const next = d + 1
          if (next >= 300) {
            stopRecording()
            return 300
          }
          return next
        })
      }, 1000)

    } catch (err) {
      console.error('Failed to start recording:', err)
      setError('Could not access microphone. Please allow microphone access.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      isUserStoppingRef.current = true  // Must be set BEFORE .stop()
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
      requestWakeLock()

      timerRef.current = window.setInterval(() => {
        setDuration(d => {
          const next = d + 1
          if (next >= 300) {
            stopRecording()
            return 300
          }
          return next
        })
      }, 1000)
    }
  }

  const handleCancelClick = () => {
    if (isRecording) {
      setShowCancelConfirm(true)
    } else {
      onCancel()
    }
  }

  const confirmCancel = () => {
    isCancellingRef.current = true

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const recorder = mediaRecorderRef.current
      recorder.onstop = null
      recorder.stop()
      recorder.stream.getTracks().forEach(track => track.stop())
      setIsRecording(false)
      setIsPaused(false)
      if (timerRef.current) clearInterval(timerRef.current)
      chunksRef.current = []
    }
    releaseWakeLock()
    setShowCancelConfirm(false)
    isCancellingRef.current = false
    onCancel()
  }

  const cancelCancelConfirm = () => {
    setShowCancelConfirm(false)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="screen recording-screen">
      <button className="btn-close" onClick={handleCancelClick}>
        <X size={24} />
      </button>

      {showCancelConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Cancel Recording?</h3>
            <p>Are you sure you want to cancel this recording and restart?</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={cancelCancelConfirm}>
                No, Continue
              </button>
              <button className="btn btn-danger" onClick={confirmCancel}>
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="recording-content">
        {error ? (
          <div className="recording-error">
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={() => setError(null)}>
              Try Again
            </button>
          </div>
        ) : interrupted ? (
          <div className="recording-interrupted">
            <p>Recording interrupted — tap to restart</p>
            <button
              className="btn-record-main"
              onClick={() => { setInterrupted(false); setDuration(0) }}
            >
              <Mic size={48} />
            </button>
            <p className="recording-hint">Your story was not saved</p>
          </div>
        ) : !isRecording ? (
          <>
            <div className="recording-prompt">
              <h2>Ready to record</h2>
              <p>Find a quiet spot and tap to begin</p>
            </div>
            <button className="btn-record-main" onClick={startRecording}>
              <Mic size={48} />
            </button>
            <p className="recording-hint">
              Remember: Start with "Once upon a time..."
            </p>
          </>
        ) : (
          <>
            <div className={`recording-active ${isPaused ? 'paused' : ''}`}>
              <Circle className="recording-indicator" size={16} />
              <span>{isPaused ? 'Paused' : 'Recording'}</span>
            </div>
            <div className="recording-duration">
              {formatDuration(duration)}
            </div>
            <div className="recording-controls">
              <button
                className="btn-pause-resume"
                onClick={isPaused ? resumeRecording : pauseRecording}
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? <Play size={24} /> : <Pause size={24} />}
              </button>
              <button className="btn-stop-main" onClick={stopRecording}>
                <Square size={32} />
              </button>
            </div>
            <p className="recording-hint">
              Say "The End" when you're done, then tap to stop
              <br />
              <span className="time-remaining">{Math.floor((300 - duration) / 60)}:{((300 - duration) % 60).toString().padStart(2, '0')} remaining</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
