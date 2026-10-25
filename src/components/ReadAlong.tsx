import { useEffect, useMemo, useRef } from 'react'
import type { Alignment } from '../services/narration'

interface ReadAlongProps {
  alignment: Alignment | null
  currentTime: number
  fallbackText: string
}

interface Token {
  text: string
  start: number
  isWord: boolean
}

function toTokens(alignment: Alignment): Token[] {
  const tokens: Token[] = []
  alignment.characters.forEach((char, i) => {
    const isWord = !/\s/.test(char)
    const last = tokens[tokens.length - 1]
    if (last && last.isWord === isWord) {
      last.text += char
    } else {
      tokens.push({ text: char, start: alignment.character_start_times_seconds[i], isWord })
    }
  })
  return tokens
}

export function ReadAlong({ alignment, currentTime, fallbackText }: ReadAlongProps) {
  const tokens = useMemo(() => (alignment ? toTokens(alignment) : null), [alignment])
  const activeRef = useRef<HTMLSpanElement>(null)

  let activeIndex = -1
  if (tokens) {
    for (let i = 0; i < tokens.length; i++) {
      if (!tokens[i].isWord) continue
      if (tokens[i].start > currentTime) break
      activeIndex = i
    }
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex])

  if (!tokens) {
    return <div className="story-text">{fallbackText}</div>
  }

  return (
    <div className="story-text read-along">
      {tokens.map((token, i) =>
        token.isWord ? (
          <span
            key={i}
            ref={i === activeIndex ? activeRef : undefined}
            className={i === activeIndex ? 'word active' : i < activeIndex ? 'word spoken' : 'word'}
          >
            {token.text}
          </span>
        ) : (
          token.text
        )
      )}
    </div>
  )
}
