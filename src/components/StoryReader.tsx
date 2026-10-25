import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Languages } from 'lucide-react'
import type { Author, Story } from '../types'
import { ReadAlong } from './ReadAlong'
import { useWakeLock } from '../hooks/useWakeLock'
import {
  LANGUAGES, getAlignment, getNarration, getNarrationStyle, translateStory, unlockAudio, isUnlockClip, voiceForStory,
  type Alignment,
} from '../services/narration'

interface StoryReaderProps {
  story: Story
  authors: Author[]
}

export function StoryReader({ story, authors }: StoryReaderProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const runRef = useRef(0)
  const [language, setLanguage] = useState('')
  const [translation, setTranslation] = useState<{ title: string, text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [alignment, setAlignment] = useState<Alignment | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  useWakeLock(playing)

  const stopListening = () => {
    runRef.current++
    audioRef.current?.pause()
    setStarted(false)
    setAlignment(null)
    setCurrentTime(0)
  }

  useEffect(() => () => {
    runRef.current++
    audioRef.current?.pause()
  }, [])

  const chooseLanguage = async (code: string) => {
    stopListening()
    setError(null)
    setLanguage(code)
    if (!code) {
      setTranslation(null)
      return
    }
    const run = runRef.current
    setBusy('Translating…')
    try {
      const result = await translateStory(story.id, code)
      if (run === runRef.current) setTranslation(result)
    } catch (err: any) {
      if (run === runRef.current) {
        setError(err?.message || 'Translation failed')
        setLanguage('')
      }
    }
    if (run === runRef.current) setBusy(null)
  }

  const listen = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (started) {
      if (audio.paused) audio.play().catch(() => {})
      else audio.pause()
      return
    }

    unlockAudio(audio)
    const run = ++runRef.current
    setError(null)
    setBusy('Getting the story ready… the first listen takes a few seconds')
    try {
      const narration = await getNarration(story.id, voiceForStory(story, authors), getNarrationStyle(), language || undefined)
      if (run !== runRef.current) return
      if (narration.alignmentUrl) {
        getAlignment(narration.alignmentUrl)
          .then(a => { if (run === runRef.current) setAlignment(a) })
          .catch(() => {})
      }
      audio.src = narration.audioUrl
      await audio.play()
      setStarted(true)
    } catch (err: any) {
      if (run === runRef.current) setError(err?.message || 'Narration failed')
    }
    if (run === runRef.current) setBusy(null)
  }

  const text = translation?.text ?? story.cleanedTranscript ?? 'No story text available'
  const rtl = language === 'he' || language === 'ar'

  return (
    <div className="story-text-view">
      <audio
        ref={audioRef}
        onPlay={e => { if (!isUnlockClip(e.currentTarget)) setPlaying(true) }}
        onPause={e => { if (!isUnlockClip(e.currentTarget)) setPlaying(false) }}
        onEnded={e => { if (!isUnlockClip(e.currentTarget)) stopListening() }}
        onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
      />

      <div className="reader-bar">
        <button className="btn-small reader-listen" onClick={listen} disabled={!!busy || !story.cleanedTranscript}>
          {started && playing ? <Pause size={16} /> : <Play size={16} />}
          <span>{started ? (playing ? 'Pause' : 'Resume') : 'Listen'}</span>
        </button>
        <label className="reader-translate">
          <Languages size={16} />
          <select value={language} onChange={e => chooseLanguage(e.target.value)} disabled={!!busy}>
            <option value="">{language ? 'Original' : 'Translate'}</option>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
      </div>

      {busy && <p className="radio-status">{busy}</p>}
      {error && <p className="radio-error">{error}</p>}

      {translation && <h3 className="reader-title" dir={rtl ? 'rtl' : undefined}>{translation.title}</h3>}
      <div dir={rtl ? 'rtl' : undefined}>
        {started && alignment ? (
          <ReadAlong alignment={alignment} currentTime={currentTime} fallbackText={text} />
        ) : (
          <div className="story-text">{text}</div>
        )}
      </div>
    </div>
  )
}
