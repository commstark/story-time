export interface Story {
  id: string
  title?: string
  audioBlob?: Blob
  transcript?: string
  cleanedTranscript?: string  // Your words, just cleaned up (no umms, no repeats)
  storyMoments?: StoryMoment[]
  panels?: StoryPanel[]
  status: 'transcribing' | 'cleaning' | 'extracting' | 'generating' | 'ready' | 'error'
  error?: string
  revealed: boolean  // Pictures hidden until revealed
  createdAt: string
}

export interface StoryMoment {
  index: number
  description: string
  characters: CharacterDescription[]
  setting: string
  mood: string
}

export interface CharacterDescription {
  name: string
  appearance: string
  position: string
}

export interface StoryPanel {
  index: number
  imageUrl: string
  caption: string
}
