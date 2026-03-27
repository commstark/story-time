import { useState, useRef } from 'react'
import { Download, Upload, ArrowLeft, Check, AlertCircle } from 'lucide-react'
import type { Story } from '../types'
import { getLocalLibrary, saveStory } from '../services/storyStorage'

interface MigrationScreenProps {
  onBack: () => void
  onMigrationComplete: () => void
}

export function MigrationScreen({ onBack, onMigrationComplete }: MigrationScreenProps) {
  const [status, setStatus] = useState<'idle' | 'exporting' | 'importing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const stories = getLocalLibrary()
    if (stories.length === 0) {
      setStatus('error')
      setMessage('No stories found on this device to export.')
      return
    }

    const blob = new Blob([JSON.stringify(stories, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `story-time-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)

    setStatus('done')
    setMessage(`Exported ${stories.length} ${stories.length === 1 ? 'story' : 'stories'}. Transfer the file to your new device and use Import.`)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('importing')
    setMessage('Importing stories...')

    try {
      const text = await file.text()
      const stories = JSON.parse(text) as Story[]

      if (!Array.isArray(stories) || stories.length === 0) {
        throw new Error('Invalid file — expected an array of stories')
      }

      let imported = 0
      for (const story of stories) {
        if (!story.id || !story.createdAt) {
          console.warn('Skipping invalid story entry')
          continue
        }
        await saveStory(story)
        imported++
      }

      setStatus('done')
      setMessage(`Imported ${imported} ${imported === 1 ? 'story' : 'stories'} successfully!`)
      onMigrationComplete()
    } catch (err: any) {
      setStatus('error')
      setMessage(`Import failed: ${err.message}`)
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="screen migration-screen">
      <div className="migration-header">
        <button className="btn-back" onClick={onBack}>
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <h1>Transfer Stories</h1>
      </div>

      <div className="migration-content">
        <div className="migration-section">
          <h2>Export from this device</h2>
          <p>Download your stories as a file to transfer to another device.</p>
          <button className="btn btn-record" onClick={handleExport}>
            <Download size={20} />
            <span>Export Stories</span>
          </button>
        </div>

        <div className="migration-divider">or</div>

        <div className="migration-section">
          <h2>Import to this device</h2>
          <p>Upload a story backup file from another device.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <button className="btn btn-record" onClick={() => fileInputRef.current?.click()}>
            <Upload size={20} />
            <span>Import Stories</span>
          </button>
        </div>

        {status !== 'idle' && (
          <div className={`migration-status ${status}`}>
            {status === 'done' && <Check size={20} />}
            {status === 'error' && <AlertCircle size={20} />}
            {status === 'importing' && <div className="spinner" />}
            <p>{message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
