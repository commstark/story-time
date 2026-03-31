import { useState } from 'react'
import { Moon, Sparkles, Mic, BookOpen, RotateCcw, LogOut, Plus, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import type { Author } from '../types'

const EMOJI_OPTIONS = [
  '👨', '👩', '👴', '👵', '🧔', '👱', '👨‍🦳', '👩‍🦳',
  '🧑', '👦', '👧', '🧒', '🐻', '🦊', '⭐', '🌙'
]

interface HomeScreenProps {
  onStartRecording: () => void
  onReveal: () => void
  onLibrary: () => void
  onResumeIncomplete: () => void
  onSignOut: () => Promise<void>
  hasPendingStory: boolean
  hasIncompleteStory: boolean
  storyCount: number
  user: User | null
  authors: Author[]
  selectedAuthorId: string | null
  onSelectAuthor: (id: string) => void
  onAddAuthor: (emoji: string, name: string) => void
  onRemoveAuthor: (id: string) => void
}

export function HomeScreen({
  onStartRecording,
  onReveal,
  onLibrary,
  onResumeIncomplete,
  onSignOut,
  hasPendingStory,
  hasIncompleteStory,
  storyCount,
  user,
  authors,
  selectedAuthorId,
  onSelectAuthor,
  onAddAuthor,
  onRemoveAuthor,
}: HomeScreenProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState(EMOJI_OPTIONS[0])

  const handleAddSubmit = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    onAddAuthor(newEmoji, trimmed)
    setNewName('')
    setNewEmoji(EMOJI_OPTIONS[0])
    setShowAddDialog(false)
  }

  return (
    <div className="screen home-screen">
      {user && (
        <div className="user-bar">
          {user.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url}
              alt=""
              className="user-avatar"
            />
          )}
          <span className="user-name">{user.user_metadata?.full_name || user.email}</span>
          <button className="btn-icon" onClick={onSignOut} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      )}

      {showAddDialog && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddDialog(false) }}>
          <div className="modal author-dialog">
            <h3>Add Author</h3>
            <div className="author-dialog-emoji-grid">
              {EMOJI_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  className={`author-dialog-emoji-btn${newEmoji === emoji ? ' selected' : ''}`}
                  onClick={() => setNewEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Name (e.g. Daddy)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddSubmit() }}
              autoFocus
              maxLength={20}
            />
            <div className="modal-actions">
              <button className="btn btn-record" onClick={() => setShowAddDialog(false)}>
                Cancel
              </button>
              <button
                className="btn btn-reveal"
                onClick={handleAddSubmit}
                disabled={!newName.trim()}
              >
                Add {newEmoji}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="home-header">
        <Moon className="home-icon" size={48} />
        <h1>Story Time</h1>
        <p>Bedtime stories, illustrated by magic</p>
      </div>

      <div className="home-actions">
        {hasIncompleteStory && (
          <button className="btn btn-resume" onClick={onResumeIncomplete}>
            <RotateCcw size={24} />
            <span>Resume Incomplete Story</span>
          </button>
        )}

        {hasPendingStory && (
          <button className="btn btn-reveal" onClick={onReveal}>
            <Sparkles size={24} />
            <span>Reveal Today's Story!</span>
          </button>
        )}

        <button className="btn btn-record" onClick={onStartRecording}>
          <Mic size={24} />
          <span>Tell a New Story</span>
        </button>

        {/* Author selector */}
        <div className="author-selector">
          {authors.map(author => (
            <button
              key={author.id}
              className={`author-tile${selectedAuthorId === author.id ? ' selected' : ''}`}
              onClick={() => onSelectAuthor(author.id)}
            >
              <button
                className="author-remove"
                onClick={e => { e.stopPropagation(); onRemoveAuthor(author.id) }}
                title="Remove"
              >
                <X size={10} />
              </button>
              <span className="author-emoji">{author.emoji}</span>
              <span className="author-name">{author.name}</span>
            </button>
          ))}
          <button
            className="author-add-btn"
            onClick={() => setShowAddDialog(true)}
            title="Add author"
          >
            <Plus size={18} />
          </button>
        </div>

        {storyCount > 0 && (
          <button className="btn btn-library" onClick={onLibrary}>
            <BookOpen size={24} />
            <span>Story Library ({storyCount})</span>
          </button>
        )}
      </div>

      <div className="home-hint">
        <p>
          Start with <strong>"Once upon a time..."</strong>
          <br />
          End with <strong>"The End"</strong>
          <br />
          <span className="hint-detail">Stories up to 5 minutes</span>
        </p>
      </div>
    </div>
  )
}
