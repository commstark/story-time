import { Moon, Sparkles, Mic, BookOpen, RotateCcw, ArrowRightLeft, LogOut } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

interface HomeScreenProps {
  onStartRecording: () => void
  onReveal: () => void
  onLibrary: () => void
  onResumeIncomplete: () => void
  onMigration: () => void
  onSignOut: () => Promise<void>
  hasPendingStory: boolean
  hasIncompleteStory: boolean
  storyCount: number
  user: User | null
}

export function HomeScreen({
  onStartRecording,
  onReveal,
  onLibrary,
  onResumeIncomplete,
  onMigration,
  onSignOut,
  hasPendingStory,
  hasIncompleteStory,
  storyCount,
  user
}: HomeScreenProps) {
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

        {storyCount > 0 && (
          <button className="btn btn-library" onClick={onLibrary}>
            <BookOpen size={24} />
            <span>Story Library ({storyCount})</span>
          </button>
        )}

        <button className="btn btn-secondary btn-small" onClick={onMigration}>
          <ArrowRightLeft size={18} />
          <span>Transfer Stories</span>
        </button>
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
