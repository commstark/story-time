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

type Line = Token[]

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

// One line per sentence, like song lyrics
function toLines(tokens: Token[]): Line[] {
  const lines: Line[] = []
  let current: Line = []
  for (const token of tokens) {
    if (!token.isWord) {
      if (token.text.includes('\n') && current.length) {
        lines.push(current)
        current = []
      } else if (current.length) {
        current.push(token)
      }
      continue
    }
    current.push(token)
    if (/[.!?…]["'”’)]*$/.test(token.text)) {
      lines.push(current)
      current = []
    }
  }
  if (current.length) lines.push(current)
  return lines.map(line => (line[line.length - 1]?.isWord ? line : line.slice(0, -1)))
}

function lineStart(line: Line): number {
  return line.find(t => t.isWord)?.start ?? 0
}

export function ReadAlong({ alignment, currentTime, fallbackText }: ReadAlongProps) {
  const lines = useMemo(() => (alignment ? toLines(toTokens(alignment)) : null), [alignment])
  const currentRef = useRef<HTMLParagraphElement>(null)

  let currentLine = 0
  let activeWord = -1
  if (lines) {
    for (let i = 0; i < lines.length; i++) {
      if (lineStart(lines[i]) > currentTime) break
      currentLine = i
    }
    lines[currentLine]?.forEach((token, i) => {
      if (token.isWord && token.start <= currentTime) activeWord = i
    })
  }

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentLine])

  if (!lines) {
    return <div className="story-text">{fallbackText}</div>
  }

  return (
    <div className="lyrics">
      {lines.map((line, i) => {
        const state = i < currentLine ? 'past' : i === currentLine ? 'current' : 'future'
        return (
          <p key={i} ref={i === currentLine ? currentRef : undefined} className={`lyric-line ${state}`}>
            {line.map((token, j) =>
              token.isWord ? (
                <span key={j} className={state === 'current' && j === activeWord ? 'word active' : 'word'}>
                  {token.text}
                </span>
              ) : (
                token.text
              )
            )}
          </p>
        )
      })}
    </div>
  )
}
