import { useState } from 'react'
import { Sparkles, ChevronRight, Home } from 'lucide-react'
import type { Story } from '../types'

interface RevealScreenProps {
  story: Story
  onComplete: () => void
}

export function RevealScreen({ story, onComplete }: RevealScreenProps) {
  const [revealed, setRevealed] = useState(false)
  const [currentPanel, setCurrentPanel] = useState(0)

  if (!story.panels || story.panels.length === 0) {
    return (
      <div className="screen reveal-screen">
        <div className="reveal-error">
          <p>Something went wrong - no images to show</p>
          <button className="btn btn-secondary" onClick={onComplete}>
            Go Home
          </button>
        </div>
      </div>
    )
  }

  if (!revealed) {
    return (
      <div className="screen reveal-screen">
        <div className="reveal-confirm">
          <Sparkles size={64} className="reveal-icon" />
          <h2>Ready for the reveal?</h2>
          <p>Gather the family! Your illustrated story awaits.</p>
          <button className="btn btn-reveal-big" onClick={() => setRevealed(true)}>
            <Sparkles size={24} />
            <span>Reveal the Story!</span>
          </button>
        </div>
      </div>
    )
  }

  const panel = story.panels[currentPanel]
  const isLast = currentPanel === story.panels.length - 1

  return (
    <div className="screen reveal-screen revealed">
      <div className="panel-display">
        <div className="panel-counter">
          {currentPanel + 1} of {story.panels.length}
        </div>
        
        <div className="panel-image-container">
          <img 
            src={panel.imageUrl} 
            alt={panel.caption}
            className="panel-image"
          />
        </div>

        <p className="panel-caption">{panel.caption}</p>

        <div className="panel-navigation">
          {!isLast ? (
            <button 
              className="btn btn-next"
              onClick={() => setCurrentPanel(p => p + 1)}
            >
              <span>Next</span>
              <ChevronRight size={20} />
            </button>
          ) : (
            <button className="btn btn-finish" onClick={onComplete}>
              <Home size={20} />
              <span>The End!</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
