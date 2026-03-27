import { supabase } from '../lib/supabase'
import type { Story } from '../types'

const STORIES_KEY = 'storyTimeLibrary'
const PENDING_KEY = 'pendingStory'

// --- Helpers ---

async function getUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

function storyToRow(story: Story, userId: string) {
  return {
    id: story.id,
    user_id: userId,
    title: story.title ?? null,
    status: story.status,
    transcript: story.transcript ?? null,
    cleaned_transcript: story.cleanedTranscript ?? null,
    characters: story.storyMoments?.[0]?.characters ?? [],
    moments: story.storyMoments ?? [],
    panels: story.panels ?? [],
    revealed: story.revealed,
    created_at: story.createdAt,
  }
}

function rowToStory(row: any): Story {
  return {
    id: row.id,
    title: row.title ?? undefined,
    status: row.status,
    transcript: row.transcript ?? undefined,
    cleanedTranscript: row.cleaned_transcript ?? undefined,
    storyMoments: row.moments ?? undefined,
    panels: row.panels ?? undefined,
    revealed: row.revealed,
    createdAt: row.created_at,
  }
}

// --- Story CRUD ---

export async function saveStory(story: Story): Promise<void> {
  const userId = await getUserId()

  if (userId && supabase) {
    const { error } = await supabase
      .from('stories')
      .upsert(storyToRow(story, userId))
    if (error) {
      console.error('Failed to save story to Supabase:', error)
      // Fall through to localStorage backup
    } else {
      return
    }
  }

  // localStorage fallback
  const library = getLocalLibrary()
  const idx = library.findIndex(s => s.id === story.id)
  if (idx >= 0) {
    library[idx] = story
  } else {
    library.unshift(story)
  }
  localStorage.setItem(STORIES_KEY, JSON.stringify(library))
}

export async function getAllStories(): Promise<Story[]> {
  const userId = await getUserId()

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) {
      return data.map(rowToStory)
    }
    console.error('Failed to load stories from Supabase:', error)
  }

  // localStorage fallback
  return getLocalLibrary()
}

export async function deleteStory(storyId: string): Promise<void> {
  const userId = await getUserId()

  if (userId && supabase) {
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId)
    if (error) {
      console.error('Failed to delete story from Supabase:', error)
    }
  }

  // Also clean localStorage
  const library = getLocalLibrary().filter(s => s.id !== storyId)
  localStorage.setItem(STORIES_KEY, JSON.stringify(library))
}

// --- Pending Story ---

export async function savePendingStory(story: Story): Promise<void> {
  // Pending story is just a story with status 'ready' that hasn't been revealed.
  // In cloud mode, it's a regular story row — we just track locally which one is "pending"
  // so the reveal UX works without an extra DB column.
  localStorage.setItem(PENDING_KEY, JSON.stringify({ ...story, audioBlob: undefined }))
}

export async function getPendingStory(): Promise<Story | null> {
  const saved = localStorage.getItem(PENDING_KEY)
  if (!saved) return null
  const story = JSON.parse(saved) as Story
  return story.status === 'ready' ? story : null
}

export async function clearPendingStory(): Promise<void> {
  localStorage.removeItem(PENDING_KEY)
}

// --- Progress (in-flight story processing) ---

export async function saveProgress(storyId: string, data: Partial<Story>): Promise<void> {
  const userId = await getUserId()

  if (userId && supabase) {
    const { audioBlob, ...saveableData } = data as any
    const { error } = await supabase
      .from('story_progress')
      .upsert({
        story_id: storyId,
        user_id: userId,
        progress_data: saveableData,
      })
    if (!error) return
    console.error('Failed to save progress to Supabase:', error)
  }

  // localStorage fallback
  try {
    const { audioBlob, ...saveableData } = data as any
    localStorage.setItem(`story_progress_${storyId}`, JSON.stringify(saveableData))
  } catch (err) {
    console.error('Failed to save progress to localStorage:', err)
  }
}

export async function getProgress(storyId: string): Promise<Partial<Story> | null> {
  const userId = await getUserId()

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('story_progress')
      .select('progress_data')
      .eq('story_id', storyId)
      .single()
    if (!error && data) {
      return data.progress_data as Partial<Story>
    }
  }

  // localStorage fallback
  try {
    const saved = localStorage.getItem(`story_progress_${storyId}`)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

export async function clearProgress(storyId: string): Promise<void> {
  const userId = await getUserId()

  if (userId && supabase) {
    await supabase
      .from('story_progress')
      .delete()
      .eq('story_id', storyId)
  }

  localStorage.removeItem(`story_progress_${storyId}`)
}

export async function getAllProgressKeys(): Promise<string[]> {
  const userId = await getUserId()

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('story_progress')
      .select('story_id')
    if (!error && data) {
      return data.map(d => d.story_id)
    }
  }

  // localStorage fallback
  return Object.keys(localStorage)
    .filter(k => k.startsWith('story_progress_'))
    .map(k => k.replace('story_progress_', ''))
}

export async function getFirstIncompleteProgress(): Promise<{ storyId: string; data: Partial<Story> } | null> {
  const userId = await getUserId()

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('story_progress')
      .select('story_id, progress_data')
      .limit(1)
      .single()
    if (!error && data) {
      return { storyId: data.story_id, data: data.progress_data as Partial<Story> }
    }
  }

  // localStorage fallback
  const keys = Object.keys(localStorage).filter(k => k.startsWith('story_progress_'))
  if (keys.length === 0) return null
  try {
    const saved = localStorage.getItem(keys[0])
    if (!saved) return null
    return {
      storyId: keys[0].replace('story_progress_', ''),
      data: JSON.parse(saved)
    }
  } catch {
    return null
  }
}

// --- Migration helpers ---

export function getLocalLibrary(): Story[] {
  try {
    const saved = localStorage.getItem(STORIES_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export function clearLocalLibrary(): void {
  localStorage.removeItem(STORIES_KEY)
  localStorage.removeItem(PENDING_KEY)
  // Clear all progress keys
  Object.keys(localStorage)
    .filter(k => k.startsWith('story_progress_'))
    .forEach(k => localStorage.removeItem(k))
}

export async function migrateLocalToCloud(): Promise<{ migrated: number; failed: number }> {
  const userId = await getUserId()
  if (!userId || !supabase) return { migrated: 0, failed: 0 }

  const localStories = getLocalLibrary()
  let migrated = 0
  let failed = 0

  for (const story of localStories) {
    const { error } = await supabase
      .from('stories')
      .upsert(storyToRow(story, userId))
    if (error) {
      console.error(`Failed to migrate story ${story.id}:`, error)
      failed++
    } else {
      migrated++
    }
  }

  if (failed === 0) {
    clearLocalLibrary()
  }

  return { migrated, failed }
}
