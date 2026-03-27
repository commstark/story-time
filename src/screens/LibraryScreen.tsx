import { Book, ChevronRight, Trash2 } from 'lucide-react'
import type { Story } from '../types'

interface LibraryScreenProps {
  stories: Story[]
  onSelectStory: (story: Story) => void
  onDeleteStory: (storyId: string) => void
  onBack: () => void
}

export function LibraryScreen({ stories, onSelectStory, onDeleteStory, onBack }: LibraryScreenProps) {
  const readyStories = stories.filter(s => s.status === 'ready')

  if (readyStories.length === 0) {
    return (
      <div className="screen library-screen">
        <div className="library-header">
          <button className="btn-back" onClick={onBack}>← Back</button>
          <h1>Story Library</h1>
        </div>
        <div className="library-empty">
          <Book size={64} className="empty-icon" />
          <p>No stories yet!</p>
          <p className="empty-hint">Record your first bedtime story to start your collection.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen library-screen">
      <div className="library-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h1>Story Library</h1>
      </div>

      <div className="library-list">
        {readyStories.map(story => (
          <div key={story.id} className="library-item">
            <div 
              className="library-item-content"
              onClick={() => onSelectStory(story)}
            >
              {story.revealed && story.panels?.[0] ? (
                <img 
                  src={story.panels[0].imageUrl} 
                  alt="" 
                  className="library-thumbnail"
                />
              ) : (
                <div className="library-thumbnail library-thumbnail-hidden">
                  <span>✨</span>
                </div>
              )}
              <div className="library-item-info">
                <h3>{story.title || 'Untitled Story'}</h3>
                <p className="library-date">
                  {new Date(story.createdAt).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                  {!story.revealed && ' • Not revealed yet'}
                </p>
              </div>
              <ChevronRight size={20} className="library-arrow" />
            </div>
            <button 
              className="btn-delete"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm('Delete this story?')) {
                  onDeleteStory(story.id)
                }
              }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
