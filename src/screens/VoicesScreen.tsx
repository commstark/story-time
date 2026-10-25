import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Square, Check } from 'lucide-react'
import type { Author } from '../types'
import { VoicePicker } from '../components/VoicePicker'
import {
  cloneVoice, getDefaultVoiceId, getNarrationStyle, getUsage, listVoices, setDefaultVoiceId, setNarrationStyle,
  type NarrationStyle, type Usage, type Voice,
} from '../services/narration'

interface VoicesScreenProps {
  authors: Author[]
  onSetAuthorVoice: (authorId: string, voiceId: string | undefined) => void
  onBack: () => void
}

const MIN_SECONDS = 30
const MAX_SECONDS = 120

const READING_SCRIPT = `Once upon a time, in a little house at the edge of a big green forest, there lived a curious little fox named Pip. Every night, when the moon peeked over the hills, Pip would climb onto the windowsill and count the stars. "One, two, three…" he whispered, until his eyes grew heavy. One night, a tiny star winked back at him! "Hello?" said Pip, his tail swishing with excitement. "Would you like to go on an adventure?" asked the star. And off they went, over the treetops and past the sleepy owls, all the way to the river where the frogs sang their evening song. When the sky turned pink, Pip curled up in his cozy bed, smiled, and drifted off to sleep. Goodnight, Pip. Goodnight, little star. The end.`

function pickMimeType(): string {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function CloneRecorder({ author, onCloned, onCancel }: {
  author: Author
  onCloned: (voiceId: string) => void
  onCancel: () => void
}) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [sample, setSample] = useState<Blob | null>(null)
  const [consent, setConsent] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<number | null>(null)

  const stop = () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setRecording(false)
  }

  const start = async () => {
    setError(null)
    setSample(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        setSample(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setSeconds(0)
      const startedAt = Date.now()
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        setSeconds(elapsed)
        if (elapsed >= MAX_SECONDS) stop()
      }, 500)
    } catch {
      setError('Microphone access is needed to record a voice sample')
    }
  }

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    recorderRef.current?.stream.getTracks().forEach(t => t.stop())
  }, [])

  const upload = async () => {
    if (!sample) return
    setUploading(true)
    setError(null)
    try {
      onCloned(await cloneVoice(author.name, sample))
    } catch (err: any) {
      setError(err?.message || 'Cloning failed')
    }
    setUploading(false)
  }

  const tooShort = seconds < MIN_SECONDS
  const previewUrl = useMemo(() => (sample ? URL.createObjectURL(sample) : null), [sample])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  return (
    <div className="voice-clone">
      <p className="voice-hint">
        Find a quiet room and read this aloud in your storytelling voice. Aim for 1–2 minutes;
        reading it twice is perfect.
      </p>
      <div className="voice-script">{READING_SCRIPT}</div>

      <div className="voice-clone-actions">
        {recording ? (
          <button className="btn btn-stop-small" onClick={stop} disabled={tooShort}>
            <Square size={18} />
            <span>{tooShort ? `Keep reading… ${MIN_SECONDS - seconds}s` : `Stop (${seconds}s)`}</span>
          </button>
        ) : (
          <button className="btn btn-record" onClick={start} disabled={uploading}>
            <Mic size={18} />
            <span>{sample ? 'Record again' : 'Start recording'}</span>
          </button>
        )}
        <button className="btn btn-secondary" onClick={onCancel} disabled={recording || uploading}>Cancel</button>
      </div>

      {sample && !recording && (
        <>
          <audio controls src={previewUrl ?? undefined} className="voice-preview" />
          <label className="voice-consent">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>This is my own voice and I agree to it being cloned with ElevenLabs.</span>
          </label>
          <button className="btn btn-reveal" onClick={upload} disabled={!consent || uploading}>
            {uploading ? 'Cloning your voice…' : `Create ${author.name}'s voice`}
          </button>
        </>
      )}

      {error && <p className="radio-error">{error}</p>}
    </div>
  )
}

export function VoicesScreen({ authors, onSetAuthorVoice, onBack }: VoicesScreenProps) {
  const [cloningFor, setCloningFor] = useState<string | null>(null)
  const [pickingFor, setPickingFor] = useState<string | null>(null)
  const [voices, setVoices] = useState<Voice[] | null>(null)
  const [voicesError, setVoicesError] = useState<string | null>(null)
  const [style, setStyle] = useState<NarrationStyle>(getNarrationStyle)
  const [defaultVoice, setDefaultVoice] = useState<string | undefined>(getDefaultVoiceId)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)

  useEffect(() => {
    getUsage().then(setUsage).catch(err => setUsageError(err.message))
    listVoices().then(setVoices).catch(err => setVoicesError(err.message))
  }, [])

  const voiceLabel = (voiceId: string | undefined) => {
    if (!voiceId) return 'Storyteller voice'
    const voice = voices?.find(v => v.voiceId === voiceId)
    if (!voice) return '✓ Custom voice'
    return voice.category === 'cloned' ? `✓ ${voice.name} (cloned)` : `✓ ${voice.name}`
  }

  const openPicker = (id: string | null) => {
    setCloningFor(null)
    setPickingFor(id)
  }

  const chooseStyle = (next: NarrationStyle) => {
    setStyle(next)
    setNarrationStyle(next)
  }

  const chooseDefault = (voiceId: string | undefined) => {
    setDefaultVoice(voiceId)
    setDefaultVoiceId(voiceId)
  }

  return (
    <div className="screen voices-screen">
      <div className="library-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h1>Narrator Voices</h1>
      </div>

      <section className="voices-section">
        <h3>Who reads the stories</h3>
        <p className="voice-hint">Each story is read in its author's voice. Pick a ready-made ElevenLabs voice, or clone your own once and every story by that author uses it.</p>
        {authors.length === 0 && (
          <p className="voice-hint">Add an author on the home screen first (like “Daddy” or “Mommy”).</p>
        )}
        {authors.map(author => (
          <div key={author.id} className="voice-row">
            <div className="voice-row-main">
              <span className="author-emoji">{author.emoji}</span>
              <div className="voice-row-info">
                <strong>{author.name}</strong>
                <span className="voice-hint">{voiceLabel(author.voiceId)}</span>
              </div>
              {cloningFor !== author.id && pickingFor !== author.id && (
                <div className="voice-row-actions">
                  <button className="btn-small" onClick={() => openPicker(author.id)}>Choose</button>
                  <button className="btn-small" onClick={() => { setPickingFor(null); setCloningFor(author.id) }}>Clone</button>
                </div>
              )}
            </div>
            {pickingFor === author.id && (
              <VoicePicker
                voices={voices}
                error={voicesError}
                selectedVoiceId={author.voiceId}
                onSelect={voiceId => onSetAuthorVoice(author.id, voiceId)}
                onClose={() => setPickingFor(null)}
              />
            )}
            {cloningFor === author.id && (
              <CloneRecorder
                author={author}
                onCancel={() => setCloningFor(null)}
                onCloned={voiceId => {
                  onSetAuthorVoice(author.id, voiceId)
                  setCloningFor(null)
                  listVoices.refresh().then(setVoices).catch(() => {})
                }}
              />
            )}
          </div>
        ))}

        <div className="voice-row">
          <div className="voice-row-main">
            <span className="author-emoji">📖</span>
            <div className="voice-row-info">
              <strong>Stories with no author</strong>
              <span className="voice-hint">{voiceLabel(defaultVoice)}</span>
            </div>
            {pickingFor !== 'default' && (
              <button className="btn-small" onClick={() => openPicker('default')}>Choose</button>
            )}
          </div>
          {pickingFor === 'default' && (
            <VoicePicker
              voices={voices}
              error={voicesError}
              selectedVoiceId={defaultVoice}
              onSelect={chooseDefault}
              onClose={() => setPickingFor(null)}
            />
          )}
        </div>
      </section>

      <section className="voices-section">
        <h3>Narration style</h3>
        <div className="style-options">
          <button className={`style-option${style === 'standard' ? ' selected' : ''}`} onClick={() => chooseStyle('standard')}>
            {style === 'standard' && <Check size={16} />}
            <strong>Read-along</strong>
            <span>Fast and cheaper (Flash v2.5). Words light up as they're read.</span>
          </button>
          <button className={`style-option${style === 'expressive' ? ' selected' : ''}`} onClick={() => chooseStyle('expressive')}>
            {style === 'expressive' && <Check size={16} />}
            <strong>Expressive</strong>
            <span>Whispers, giggles and gasps (Eleven v3). About twice the credits, no word highlighting.</span>
          </button>
        </div>
      </section>

      <section className="voices-section">
        <h3>ElevenLabs credits</h3>
        {usage ? (
          <>
            <div className="usage-bar"><div style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} /></div>
            <p className="voice-hint">
              {usage.used.toLocaleString()} of {usage.limit.toLocaleString()} used ({usage.tier} plan)
              {usage.resetsAt && ` · resets ${new Date(usage.resetsAt).toLocaleDateString()}`}
            </p>
          </>
        ) : (
          <p className="voice-hint">{usageError ? `Couldn't load usage: ${usageError}` : 'Loading…'}</p>
        )}
        <p className="voice-hint">Each story's audio is made once, the first time it's played, then replays for free.</p>
      </section>
    </div>
  )
}
