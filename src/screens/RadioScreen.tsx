import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, Shuffle, Music } from 'lucide-react'
import type { Author, Story } from '../types'
import { ReadAlong } from '../components/ReadAlong'
import {
  getAlignment, getJingleUrl, getNarration, getNarrationStyle, isUnlockClip, unlockAudio, voiceForStory,
  type Alignment,
} from '../services/narration'

interface RadioScreenProps {
  stories: Story[]
  authors: Author[]
  onBack: () => void
}

type Phase = 'idle' | 'intro' | 'story' | 'outro'

function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function RadioScreen({ stories, authors, onBack }: RadioScreenProps) {
  const readyStories = stories.filter(s => s.status === 'ready' && s.cleanedTranscript)
  const audioRef = useRef<HTMLAudioElement>(null)
  const runRef = useRef(0)

  const [order, setOrder] = useState<Story[]>(readyStories)
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [playing, setPlaying] = useState(false)
  const [isShuffle, setIsShuffle] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [alignment, setAlignment] = useState<Alignment | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  const orderRef = useRef(order)
  const posRef = useRef(pos)
  const phaseRef = useRef(phase)
  useEffect(() => {
    orderRef.current = order
    posRef.current = pos
    phaseRef.current = phase
  }, [order, pos, phase])

  const story = order[pos]
  const style = getNarrationStyle()

  const narrationFor = useCallback((s: Story) => {
    return getNarration(s.id, voiceForStory(s, authors), style)
  }, [authors, style])

  const playUrl = async (url: string) => {
    const audio = audioRef.current
    if (!audio) return
    audio.src = url
    await audio.play()
  }

  const startPhase = useCallback(async (nextPhase: Phase, index: number) => {
    const run = ++runRef.current
    const target = orderRef.current[index]
    if (!target) return

    posRef.current = index
    phaseRef.current = nextPhase
    setPos(index)
    setPhase(nextPhase)
    setError(null)
    setAlignment(null)
    setCurrentTime(0)

    try {
      if (nextPhase === 'intro' || nextPhase === 'outro') {
        if (nextPhase === 'intro') narrationFor(target).catch(() => {})
        setStatus('Warming up the music box…')
        const url = await getJingleUrl(nextPhase)
        if (run !== runRef.current) return
        setStatus(null)
        await playUrl(url)
      } else {
        setStatus('Getting the story ready… the first listen takes a few seconds')
        const narration = await narrationFor(target)
        if (run !== runRef.current) return
        if (narration.alignmentUrl) {
          getAlignment(narration.alignmentUrl)
            .then(a => { if (run === runRef.current) setAlignment(a) })
            .catch(() => {})
        }
        setStatus(null)
        await playUrl(narration.audioUrl)

        const upcoming = orderRef.current[(index + 1) % orderRef.current.length]
        if (upcoming) narrationFor(upcoming).catch(() => {})
      }
    } catch (err: any) {
      if (run !== runRef.current) return
      setStatus(null)
      setPlaying(false)
      setError(err?.message || 'Something went wrong')
    }
  }, [narrationFor])

  const goTo = useCallback((index: number) => {
    const count = orderRef.current.length
    if (count === 0) return
    startPhase('intro', ((index % count) + count) % count)
  }, [startPhase])

  const handleEnded = () => {
    if (audioRef.current && isUnlockClip(audioRef.current)) return
    const current = phaseRef.current
    if (current === 'intro') startPhase('story', posRef.current)
    else if (current === 'story') startPhase('outro', posRef.current)
    else if (current === 'outro') goTo(posRef.current + 1)
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (phaseRef.current === 'idle' || error) {
      unlockAudio(audio)
      goTo(posRef.current)
    } else if (audio.paused) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }

  const next = () => {
    if (audioRef.current) unlockAudio(audioRef.current)
    goTo(posRef.current + 1)
  }

  const previous = () => {
    const audio = audioRef.current
    if (audio && phaseRef.current === 'story' && audio.currentTime > 5) {
      audio.currentTime = 0
      return
    }
    if (audio) unlockAudio(audio)
    goTo(posRef.current - 1)
  }

  const toggleShuffle = () => {
    const current = orderRef.current[posRef.current]
    const rest = readyStories.filter(s => s.id !== current?.id)
    const nextOrder = isShuffle ? readyStories : [current, ...shuffled(rest)].filter(Boolean)
    setIsShuffle(!isShuffle)
    setOrder(nextOrder)
    orderRef.current = nextOrder
    const newPos = Math.max(0, nextOrder.findIndex(s => s.id === current?.id))
    setPos(newPos)
    posRef.current = newPos
  }

  // Lock-screen and headphone controls
  const controlsRef = useRef({ togglePlay, next, previous })
  useEffect(() => {
    controlsRef.current = { togglePlay, next, previous }
  })

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    session.setActionHandler('play', () => audioRef.current?.play().catch(() => {}))
    session.setActionHandler('pause', () => audioRef.current?.pause())
    session.setActionHandler('nexttrack', () => controlsRef.current.next())
    session.setActionHandler('previoustrack', () => controlsRef.current.previous())
    return () => {
      for (const action of ['play', 'pause', 'nexttrack', 'previoustrack'] as const) {
        session.setActionHandler(action, null)
      }
    }
  }, [])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !story) return
    const artwork = story.revealed && story.panels?.[0]
      ? [{ src: story.panels[0].imageUrl, sizes: '512x512', type: 'image/jpeg' }]
      : []
    navigator.mediaSession.metadata = new MediaMetadata({
      title: story.title || 'Untitled Story',
      artist: story.author ? `${story.author.emoji} ${story.author.name}` : 'Story Time',
      album: 'Story Radio',
      artwork,
    })
  }, [story])

  useEffect(() => () => {
    runRef.current++
    audioRef.current?.pause()
  }, [])

  if (readyStories.length === 0) {
    return (
      <div className="screen radio-screen">
        <div className="library-header">
          <button className="btn-back" onClick={onBack}>← Back</button>
          <h1>Story Radio</h1>
        </div>
        <div className="library-empty">
          <Music size={64} className="empty-icon" />
          <p>No stories to play yet!</p>
        </div>
      </div>
    )
  }

  const phaseLabel = {
    idle: 'Ready when you are',
    intro: '🎵 Here comes a story…',
    story: 'Now playing',
    outro: '🎵 The end — goodnight!',
  }[phase]

  return (
    <div className="screen radio-screen">
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onPlay={e => { if (!isUnlockClip(e.currentTarget)) setPlaying(true) }}
        onPause={e => { if (!isUnlockClip(e.currentTarget)) setPlaying(false) }}
        onTimeUpdate={e => { if (phaseRef.current === 'story') setCurrentTime(e.currentTarget.currentTime) }}
        preload="auto"
      />

      <div className="library-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h1>Story Radio</h1>
      </div>

      <div className="radio-now">
        {story?.revealed && story.panels?.[0] ? (
          <img src={story.panels[0].imageUrl} alt="" className="radio-art" />
        ) : (
          <div className="radio-art library-thumbnail-hidden"><span>✨</span></div>
        )}
        <div className="radio-now-info">
          <p className="radio-phase">{phaseLabel}</p>
          <h2>{story?.title || 'Untitled Story'}</h2>
          {story?.author && <span className="author-tag">{story.author.emoji} {story.author.name}</span>}
        </div>
      </div>

      <div className="radio-controls">
        <button className={`btn-nav${isShuffle ? ' active' : ''}`} onClick={toggleShuffle} title="Shuffle">
          <Shuffle size={22} />
        </button>
        <button className="btn-nav" onClick={previous} title="Previous">
          <SkipBack size={26} />
        </button>
        <button className="radio-play" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={32} /> : <Play size={32} />}
        </button>
        <button className="btn-nav" onClick={next} title="Next">
          <SkipForward size={26} />
        </button>
        <span className="radio-controls-spacer" />
      </div>

      {status && <p className="radio-status">{status}</p>}
      {error && (
        <p className="radio-error">
          {error} <button className="btn-back" onClick={togglePlay}>Try again</button>
        </p>
      )}

      {phase === 'story' && story && (
        <div className="story-text-view radio-text">
          <ReadAlong alignment={alignment} currentTime={currentTime} fallbackText={story.cleanedTranscript || ''} />
        </div>
      )}

      {phase !== 'story' && (
        <div className="radio-queue">
          <p className="radio-queue-label">Up next</p>
          {order.map((s, i) => (
            <button
              key={s.id}
              className={`radio-queue-item${i === pos ? ' current' : ''}`}
              onClick={() => { if (audioRef.current) unlockAudio(audioRef.current); goTo(i) }}
            >
              <span>{i === pos ? '▶' : i + 1}</span>
              <span className="radio-queue-title">{s.title || 'Untitled Story'}</span>
              {s.author && <span>{s.author.emoji}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
