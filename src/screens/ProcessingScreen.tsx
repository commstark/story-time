import { useEffect, useState } from 'react'
import { Loader2, CheckCircle, Sparkles } from 'lucide-react'
import type { Story } from '../types'
import { processStory } from '../services/storyProcessor'

interface ProcessingScreenProps {
  story: Story
  onComplete: (story: Story) => void
  onError: () => void
}

const STEPS = [
  { key: 'transcribing', label: 'Listening to your story...' },
  { key: 'cleaning', label: 'Cleaning up the transcript...' },
  { key: 'extracting', label: 'Finding the best moments...' },
  { key: 'generating', label: 'Creating illustrations...' },
]

export function ProcessingScreen({ story, onComplete, onError }: ProcessingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const process = async () => {
      try {
        console.log('Starting story processing:', story.id)
        const result = await processStory(story, (status) => {
          console.log('Processing status:', status)
          const stepIndex = STEPS.findIndex(s => s.key === status)
          if (stepIndex >= 0) setCurrentStep(stepIndex)
        })
        console.log('Processing complete, calling onComplete')
        onComplete(result)
      } catch (err) {
        console.error('Processing failed:', err)
        setError(err instanceof Error ? err.message : 'Processing failed')
      }
    }

    process()
  }, [story, onComplete])

  if (error) {
    return (
      <div className="screen processing-screen">
        <div className="processing-error">
          <Sparkles size={64} className="error-icon" />
          <h2>Oops! Let's try that again</h2>
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={onError}>
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen processing-screen">
      <div className="processing-content">
        <h2>Creating your storybook...</h2>
        <p className="processing-subtitle">This takes about a minute</p>

        <div className="processing-steps">
          {STEPS.map((step, index) => (
            <div 
              key={step.key}
              className={`processing-step ${
                index < currentStep ? 'complete' : 
                index === currentStep ? 'active' : 'pending'
              }`}
            >
              {index < currentStep ? (
                <CheckCircle size={20} className="step-icon complete" />
              ) : index === currentStep ? (
                <Loader2 size={20} className="step-icon spinning" />
              ) : (
                <div className="step-icon pending" />
              )}
              <span>{step.label}</span>
            </div>
          ))}
        </div>

        <div className="processing-note">
          <p>🌙 You can close the app and come back later</p>
          <p>We'll have everything ready for the morning reveal!</p>
        </div>
      </div>
    </div>
  )
}
