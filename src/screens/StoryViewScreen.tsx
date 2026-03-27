import { useState } from 'react'
import { Book, Image, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Story } from '../types'

interface StoryViewScreenProps {
  story: Story
  onBack: () => void
  onRevealFromLibrary?: () => void
}

type ViewMode = 'story' | 'pictures'

export function StoryViewScreen({ story, onBack, onRevealFromLibrary }: StoryViewScreenProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('story')
  const [currentPanel, setCurrentPanel] = useState(0)
  
  // If not revealed and trying to view pictures, show message
  const canViewPictures = story.revealed

  return (
    <div className="screen story-view-screen">
      <div className="story-view-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h1>{story.title || 'Untitled Story'}</h1>
      </div>

      <div className="view-mode-tabs">
        <button 
          className={`tab ${viewMode === 'story' ? 'active' : ''}`}
          onClick={() => setViewMode('story')}
        >
          <Book size={18} />
          <span>Story</span>
        </button>
        <button 
          className={`tab ${viewMode === 'pictures' ? 'active' : ''}`}
          onClick={() => setViewMode('pictures')}
        >
          <Image size={18} />
          <span>Pictures</span>
        </button>
      </div>

      {viewMode === 'story' ? (
        <div className="story-text-view">
          <div className="story-text">
            {story.cleanedTranscript || 'No story text available'}
          </div>
        </div>
      ) : !canViewPictures ? (
        <div className="story-pictures-locked">
          <div className="locked-content">
            <span className="locked-icon">✨</span>
            <h3>Pictures not revealed yet!</h3>
            <p>Go back to the home screen and tap "Reveal" to see the illustrations with your family.</p>
            {onRevealFromLibrary && (
              <button className="btn btn-reveal-small" onClick={onRevealFromLibrary}>
                Reveal Now
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="story-pictures-view">
          {story.panels && story.panels.length > 0 ? (
            <>
              <div className="picture-display">
                <img 
                  src={story.panels[currentPanel].imageUrl}
                  alt={story.panels[currentPanel].caption}
                  className="picture-image"
                />
                <p className="picture-caption">{story.panels[currentPanel].caption}</p>
              </div>
              
              <div className="picture-nav">
                <button 
                  className="btn-nav"
                  disabled={currentPanel === 0}
                  onClick={() => setCurrentPanel(p => p - 1)}
                >
                  <ChevronLeft size={24} />
                </button>
                <span className="picture-counter">
                  {currentPanel + 1} of {story.panels.length}
                </span>
                <button 
                  className="btn-nav"
                  disabled={currentPanel === story.panels.length - 1}
                  onClick={() => setCurrentPanel(p => p + 1)}
                >
                  <ChevronRight size={24} />
                </button>
              </div>
            </>
          ) : (
            <p>No pictures available</p>
          )}
        </div>
      )}
    </div>
  )
}
