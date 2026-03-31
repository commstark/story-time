import { useState, useEffect, useCallback, useRef } from 'react'
import { RecordingScreen } from './screens/RecordingScreen'
import { ProcessingScreen } from './screens/ProcessingScreen'
import { RevealScreen } from './screens/RevealScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { StoryViewScreen } from './screens/StoryViewScreen'
import { MigrationScreen } from './screens/MigrationScreen'
import { AuthProvider, useAuthContext } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import * as storage from './services/storyStorage'
import type { Author, Story } from './types'
import './App.css'

type Screen = 'home' | 'record' | 'processing' | 'reveal' | 'library' | 'view' | 'migration'

function AppContent() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuthContext()
  const [screen, setScreen] = useState<Screen>('home')
  const [currentStory, setCurrentStory] = useState<Story | null>(null)
  const [pendingStory, setPendingStory] = useState<Story | null>(null)
  const [library, setLibrary] = useState<Story[]>([])
  const [viewingStory, setViewingStory] = useState<Story | null>(null)
  const [incompleteStory, setIncompleteStory] = useState<Story | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  // Auto-migration state
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false)
  const [migrating, setMigrating] = useState(false)

  // Author state
  const [authors, setAuthors] = useState<Author[]>([])
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(
    () => localStorage.getItem('storyTimeSelectedAuthor')
  )
  const pendingAuthorRef = useRef<Author | null>(null)

  // Handle OAuth callback — clean the URL after Supabase processes it
  useEffect(() => {
    if (window.location.hash?.includes('access_token') || window.location.search?.includes('code=')) {
      const cleanup = setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname)
      }, 1000)
      return () => clearTimeout(cleanup)
    }
  }, [])

  // Load stories and authors when auth state resolves
  const loadData = useCallback(async () => {
    setDataLoading(true)
    try {
      const stories = await storage.getAllStories()
      setLibrary(stories)

      const pending = await storage.getPendingStory()
      if (pending) setPendingStory(pending)

      const progress = await storage.getFirstIncompleteProgress()
      if (progress) {
        const incomplete = progress.data as Partial<Story>
        if (incomplete.status !== 'ready' && incomplete.transcript) {
          setIncompleteStory(incomplete as Story)
        } else if (incomplete.status !== 'ready') {
          await storage.clearProgress(progress.storyId)
        }
      }

      // Load authors
      const loadedAuthors = await storage.getAuthors()
      setAuthors(loadedAuthors)
      setSelectedAuthorId(prev => {
        if (loadedAuthors.length === 0) return null
        if (prev && loadedAuthors.some(a => a.id === prev)) return prev
        const firstId = loadedAuthors[0].id
        localStorage.setItem('storyTimeSelectedAuthor', firstId)
        return firstId
      })
    } catch (err) {
      console.error('Failed to load data:', err)
    }
    setDataLoading(false)
  }, [])

  useEffect(() => {
    if (!authLoading) {
      loadData()
    }
  }, [authLoading, user, loadData])

  // Auto-migration: detect localStorage stories after first cloud login
  useEffect(() => {
    if (!user || authLoading || dataLoading) return

    const localStories = storage.getLocalLibrary()
    if (localStories.length > 0 && supabase) {
      storage.getSyncDismissed().then(dismissed => {
        if (!dismissed) setShowMigrationPrompt(true)
      })
    }
  }, [user, authLoading, dataLoading])

  const handleAutoMigrate = async () => {
    setMigrating(true)
    const result = await storage.migrateLocalToCloud()
    console.log(`Migration complete: ${result.migrated} migrated, ${result.failed} failed`)
    setMigrating(false)
    setShowMigrationPrompt(false)
    await loadData()
  }

  const dismissMigration = () => {
    storage.setSyncDismissed()
    setShowMigrationPrompt(false)
  }

  // --- Author handlers ---

  const handleSelectAuthor = (id: string) => {
    setSelectedAuthorId(id)
    localStorage.setItem('storyTimeSelectedAuthor', id)
  }

  const handleAddAuthor = async (emoji: string, name: string) => {
    const newAuthor: Author = { id: Date.now().toString(), emoji, name }
    const updated = [...authors, newAuthor]
    setAuthors(updated)
    setSelectedAuthorId(newAuthor.id)
    localStorage.setItem('storyTimeSelectedAuthor', newAuthor.id)
    await storage.saveAuthors(updated)
  }

  const handleRemoveAuthor = async (id: string) => {
    const updated = authors.filter(a => a.id !== id)
    setAuthors(updated)
    await storage.saveAuthors(updated)
    if (selectedAuthorId === id) {
      const newSelected = updated.length > 0 ? updated[0].id : null
      setSelectedAuthorId(newSelected)
      if (newSelected) localStorage.setItem('storyTimeSelectedAuthor', newSelected)
      else localStorage.removeItem('storyTimeSelectedAuthor')
    }
  }

  // --- Story handlers ---

  const handleStartRecording = () => {
    pendingAuthorRef.current = authors.find(a => a.id === selectedAuthorId) ?? null
    setScreen('record')
  }

  const handleRecordingComplete = (audioBlob: Blob) => {
    setCurrentStory({
      id: Date.now().toString(),
      audioBlob,
      author: pendingAuthorRef.current ?? undefined,
      status: 'transcribing',
      revealed: false,
      createdAt: new Date().toISOString()
    })
    pendingAuthorRef.current = null
    setScreen('processing')
  }

  const handleResumeIncomplete = () => {
    if (incompleteStory) {
      setCurrentStory(incompleteStory)
      setScreen('processing')
    }
  }

  const handleProcessingError = async () => {
    setIncompleteStory(null)
    setCurrentStory(null)

    const progressKeys = await storage.getAllProgressKeys()
    for (const key of progressKeys) {
      await storage.clearProgress(key)
    }
    setScreen('home')
  }

  const handleProcessingComplete = async (story: Story) => {
    console.log('Processing complete, saving story:', story.id)
    setCurrentStory(story)

    const storyToSave = { ...story, audioBlob: undefined }
    setPendingStory(storyToSave)

    try {
      await storage.savePendingStory(storyToSave)
      await storage.saveStory(storyToSave)

      const newLibrary = [storyToSave, ...library.filter(s => s.id !== story.id)]
      setLibrary(newLibrary)
      console.log('Saved to library, total stories:', newLibrary.length)
    } catch (err) {
      console.error('Failed to save story:', err)
      alert('Warning: Story may not have been saved properly.')
    }

    setScreen('home')
  }

  const handleReveal = () => {
    if (pendingStory) {
      setCurrentStory(pendingStory)
      setScreen('reveal')
    }
  }

  const handleRevealComplete = async () => {
    if (currentStory) {
      const updatedStory = { ...currentStory, revealed: true }
      await storage.saveStory(updatedStory)
      const updatedLibrary = library.map(s =>
        s.id === currentStory.id ? { ...s, revealed: true } : s
      )
      setLibrary(updatedLibrary)
    }
    setPendingStory(null)
    await storage.clearPendingStory()
    setScreen('home')
  }

  const handleRevealFromLibrary = async (storyId: string) => {
    const story = library.find(s => s.id === storyId)
    if (story) {
      const revealed = { ...story, revealed: true }
      await storage.saveStory(revealed)
      const updatedLibrary = library.map(s =>
        s.id === storyId ? revealed : s
      )
      setLibrary(updatedLibrary)
      setViewingStory(revealed)
    }
  }

  const handleViewStory = (story: Story) => {
    setViewingStory(story)
    setScreen('view')
  }

  const handleDeleteStory = async (storyId: string) => {
    await storage.deleteStory(storyId)
    const updated = library.filter(s => s.id !== storyId)
    setLibrary(updated)
    if (pendingStory?.id === storyId) {
      setPendingStory(null)
      await storage.clearPendingStory()
    }
  }

  // --- Auth gate ---

  if (authLoading || dataLoading) {
    return (
      <div className="app">
        <div className="screen loading-screen">
          <div className="loading-content">
            <div className="spinner" />
            <p>Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (supabase && !user) {
    return (
      <div className="app">
        <div className="login-page">
          <div className="login-hero">
            <p className="login-label">STORY TIME</p>
            <h1 className="login-headline">
              Bedtime stories,<br />
              illustrated by <em>magic.</em>
            </h1>
            <p className="login-sub">
              Record a story for your little ones — we'll clean it up,
              find the key moments, and paint watercolor illustrations.
            </p>
            <div className="login-features">
              <div className="login-feature"><span className="feature-bar" />Voice recording with auto-transcription</div>
              <div className="login-feature"><span className="feature-bar" />AI-generated watercolor illustrations</div>
              <div className="login-feature"><span className="feature-bar" />A family storybook that grows over time</div>
            </div>
          </div>
          <div className="login-card-area">
            <div className="login-card">
              <h2>Welcome to Story Time</h2>
              <p>Sign in to save your stories across all your devices.</p>
              <button className="btn-google" onClick={signInWithGoogle}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
              <p className="login-fine-print">Your stories are private and only visible to you.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* Auto-migration prompt */}
      {showMigrationPrompt && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Stories Found on This Device</h3>
            <p>
              We found {storage.getLocalLibrary().length} {storage.getLocalLibrary().length === 1 ? 'story' : 'stories'} saved
              on this device. Would you like to sync them to your account so they're available on all your devices?
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-reveal"
                onClick={handleAutoMigrate}
                disabled={migrating}
              >
                {migrating ? 'Syncing...' : 'Yes, sync my stories'}
              </button>
              <button className="btn btn-secondary" onClick={dismissMigration}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === 'home' && (
        <HomeScreen
          onStartRecording={handleStartRecording}
          onReveal={handleReveal}
          onLibrary={() => setScreen('library')}
          onResumeIncomplete={handleResumeIncomplete}
          onSignOut={signOut}
          hasPendingStory={!!pendingStory}
          hasIncompleteStory={!!incompleteStory}
          storyCount={library.length}
          user={user}
          authors={authors}
          selectedAuthorId={selectedAuthorId}
          onSelectAuthor={handleSelectAuthor}
          onAddAuthor={handleAddAuthor}
          onRemoveAuthor={handleRemoveAuthor}
        />
      )}
      {screen === 'record' && (
        <RecordingScreen
          onComplete={handleRecordingComplete}
          onCancel={() => setScreen('home')}
        />
      )}
      {screen === 'processing' && currentStory && (
        <ProcessingScreen
          story={currentStory}
          onComplete={handleProcessingComplete}
          onError={handleProcessingError}
        />
      )}
      {screen === 'reveal' && currentStory && (
        <RevealScreen
          story={currentStory}
          onComplete={handleRevealComplete}
        />
      )}
      {screen === 'library' && (
        <LibraryScreen
          stories={library}
          onSelectStory={handleViewStory}
          onDeleteStory={handleDeleteStory}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'view' && viewingStory && (
        <StoryViewScreen
          story={viewingStory}
          onBack={() => setScreen('library')}
          onRevealFromLibrary={() => handleRevealFromLibrary(viewingStory.id)}
        />
      )}
      {screen === 'migration' && (
        <MigrationScreen
          onBack={() => setScreen('home')}
          onMigrationComplete={loadData}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
