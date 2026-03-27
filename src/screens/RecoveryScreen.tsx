import { Sparkles, RefreshCw, Trash2 } from 'lucide-react'
import type { Story } from '../types'

interface RecoveryScreenProps {
  savedProgress: Partial<Story>
  onResume: () => void
  onDiscard: () => void
}

export function RecoveryScreen({ savedProgress, onResume, onDiscard }: RecoveryScreenProps) {
  const getStageDescription = () => {
    if (savedProgress.panels && savedProgress.panels.length > 0) {
      return `${savedProgress.panels.length}/3 images generated`
    }
    if (savedProgress.storyMoments) {
      return 'Story moments extracted'
    }
    if (savedProgress.cleanedTranscript) {
      return 'Transcript cleaned'
    }
    if (savedProgress.transcript) {
      return 'Audio transcribed'
    }
    return 'Unknown stage'
  }

  return (
    <div className="screen recovery-screen">
      <div className="recovery-content">
        <Sparkles size={64} className="recovery-icon" />
        <h2>Story in Progress</h2>
        <p>We found a story that didn't finish processing:</p>
        
        <div className="recovery-details">
          <p><strong>Progress:</strong> {getStageDescription()}</p>
          {savedProgress.title && <p><strong>Title:</strong> {savedProgress.title}</p>}
        </div>

        <p className="recovery-explanation">
          Your work was automatically saved. You can resume where you left off or start fresh.
        </p>

        <div className="recovery-actions">
          <button className="btn btn-primary" onClick={onResume}>
            <RefreshCw size={20} />
            <span>Resume Processing</span>
          </button>
          <button className="btn btn-secondary" onClick={onDiscard}>
            <Trash2 size={20} />
            <span>Discard & Start New</span>
          </button>
        </div>
      </div>
    </div>
  )
}
