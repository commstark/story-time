import { useEffect, useRef, useState } from 'react'
import { Play, Square, Check } from 'lucide-react'
import type { Voice } from '../services/narration'

interface VoicePickerProps {
  voices: Voice[] | null
  error: string | null
  selectedVoiceId: string | undefined
  onSelect: (voiceId: string | undefined) => void
  onClose: () => void
}

type Filter = 'all' | 'female' | 'male' | 'calm'

const CALM_WORDS = /calm|soft|sooth|gentle|warm|relax|meditat|sleep|whisper/i

function matches(voice: Voice, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'calm') return CALM_WORDS.test(`${voice.description ?? ''} ${voice.useCase ?? ''}`)
  return voice.gender?.toLowerCase() === filter
}

function voiceSummary(voice: Voice): string {
  return [voice.gender, voice.age, voice.accent, voice.description, voice.useCase]
    .filter(Boolean)
    .map(label => String(label).replace(/_/g, ' '))
    .join(' · ')
}

export function VoicePicker({ voices, error, selectedVoiceId, onSelect, onClose }: VoicePickerProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [previewing, setPreviewing] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => () => audioRef.current?.pause(), [])

  const preview = (voice: Voice) => {
    const audio = audioRef.current
    if (!audio || !voice.previewUrl) return
    if (previewing === voice.voiceId) {
      audio.pause()
      setPreviewing(null)
      return
    }
    audio.src = voice.previewUrl
    audio.play().catch(() => {})
    setPreviewing(voice.voiceId)
  }

  const shown = (voices ?? [])
    .filter(v => matches(v, filter))
    .sort((a, b) => Number(b.category === 'cloned') - Number(a.category === 'cloned') || a.name.localeCompare(b.name))

  return (
    <div className="voice-picker">
      <audio ref={audioRef} onEnded={() => setPreviewing(null)} />

      <div className="voice-filters">
        {(['all', 'female', 'male', 'calm'] as Filter[]).map(f => (
          <button key={f} className={`voice-filter${filter === f ? ' selected' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'calm' ? 'Calm & soft' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button className="btn-back voice-picker-close" onClick={onClose}>Done</button>
      </div>

      {error && <p className="radio-error">Couldn't load voices: {error}</p>}
      {!voices && !error && <p className="voice-hint">Loading voices…</p>}

      <div className="voice-list">
        <div className={`voice-option${!selectedVoiceId ? ' selected' : ''}`}>
          <div className="voice-row-info">
            <strong>Storyteller (default)</strong>
            <span className="voice-hint">The app's standard narrator</span>
          </div>
          <button className="btn-small" onClick={() => onSelect(undefined)}>
            {!selectedVoiceId ? <Check size={16} /> : 'Use'}
          </button>
        </div>

        {shown.map(voice => (
          <div key={voice.voiceId} className={`voice-option${selectedVoiceId === voice.voiceId ? ' selected' : ''}`}>
            {voice.previewUrl && (
              <button className="btn-nav voice-preview-btn" onClick={() => preview(voice)} title="Hear a sample">
                {previewing === voice.voiceId ? <Square size={16} /> : <Play size={16} />}
              </button>
            )}
            <div className="voice-row-info">
              <strong>{voice.name}{voice.category === 'cloned' ? ' 🎙' : ''}</strong>
              <span className="voice-hint">{voiceSummary(voice) || voice.category}</span>
            </div>
            <button className="btn-small" onClick={() => onSelect(voice.voiceId)}>
              {selectedVoiceId === voice.voiceId ? <Check size={16} /> : 'Use'}
            </button>
          </div>
        ))}

        {voices && shown.length === 0 && <p className="voice-hint">No voices match this filter.</p>}
      </div>
    </div>
  )
}
