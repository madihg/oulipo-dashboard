'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import './update-events.css'

interface EventData {
  org: string
  title: string
  description: string
  type: string
  location: string
  date: string
  dateEnd?: string
  dateDisplay: string
  link: string
}

type WorkflowStep = 'input' | 'parsing' | 'confirm' | 'saving' | 'saved'

export default function UpdateEventsPage() {
  const [step, setStep] = useState<WorkflowStep>('input')
  const [inputText, setInputText] = useState('')
  const [parsedEvent, setParsedEvent] = useState<EventData | null>(null)
  const [editedEvent, setEditedEvent] = useState<EventData | null>(null)
  const [parseError, setParseError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedEvent, setSavedEvent] = useState<EventData | null>(null)
  const [previousEvents, setPreviousEvents] = useState<EventData[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const isSavingRef = useRef(false)

  // Load previous events on mount
  const fetchEvents = useCallback(async () => {
    try {
      setLoadingEvents(true)
      const res = await fetch('/api/events')
      if (res.ok) {
        const data = await res.json()
        setPreviousEvents(data.events || [])
      }
    } catch {
      // Silently fail - events list is supplementary
    } finally {
      setLoadingEvents(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handleParseEvent = async () => {
    if (!inputText.trim()) return

    setStep('parsing')
    setParseError('')
    setParsedEvent(null)

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: `You are an event data extraction assistant for an artist's portfolio. Given freeform text about an event, extract the following fields:
- org: the hosting organization
- title: the event title
- description: brief event description (3-8 words)
- type: one of "Workshop", "Performance", "Keynote", "Panel", "Exhibition", "Talk", or "" if unclear
- location: event location (city or venue)
- date: event start date in ISO 8601 format (YYYY-MM-DD)
- dateEnd: event end date in ISO 8601 format (YYYY-MM-DD) if it spans multiple days, otherwise omit
- dateDisplay: human-readable date string (e.g. "Mar 15", "Nov 18\u201320", "Jan 5\u203A8")
- link: event URL if present, otherwise ""

Format your response as a single JSON object. Do not include any text before or after the JSON.`,
          userContent: inputText,
        }),
      })

      if (!res.ok) {
        // Claude API unavailable — fall back to manual entry with empty form
        const emptyEvent: EventData = {
          org: '', title: '', description: '', type: '',
          location: '', date: '', dateDisplay: '', link: '',
        }
        setParsedEvent(emptyEvent)
        setEditedEvent({ ...emptyEvent })
        setParseError('Claude API unavailable — fill in the fields manually.')
        setStep('confirm')
        return
      }

      // Read SSE stream and collect full response
      const reader = res.body?.getReader()
      if (!reader) {
        setParseError('No response stream')
        setStep('input')
        return
      }

      let fullText = ''
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        // Parse SSE events
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullText += parsed.delta.text
              }
            } catch {
              // Not JSON, skip
            }
          }
        }
      }

      // Extract JSON from the response
      const jsonMatch = fullText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        setParseError('Could not extract event data from response')
        setStep('input')
        return
      }

      const eventData: EventData = JSON.parse(jsonMatch[0])

      // Ensure all required fields exist with defaults
      const cleaned: EventData = {
        org: eventData.org || '',
        title: eventData.title || '',
        description: eventData.description || '',
        type: eventData.type || '',
        location: eventData.location || '',
        date: eventData.date || '',
        dateDisplay: eventData.dateDisplay || '',
        link: eventData.link || '',
        ...(eventData.dateEnd ? { dateEnd: eventData.dateEnd } : {}),
      }

      setParsedEvent(cleaned)
      setEditedEvent({ ...cleaned })
      setStep('confirm')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse event')
      setStep('input')
    }
  }

  const handleFieldChange = (field: keyof EventData, value: string) => {
    if (!editedEvent) return
    setEditedEvent({ ...editedEvent, [field]: value })
  }

  const handleSaveEvent = async () => {
    if (!editedEvent) return
    // Prevent double-click: bail if already saving
    if (isSavingRef.current) return
    isSavingRef.current = true
    setIsSaving(true)

    setStep('saving')
    setSaveError('')

    try {
      // Clean up: remove dateEnd if empty
      const eventToSave = { ...editedEvent }
      if (!eventToSave.dateEnd) {
        delete eventToSave.dateEnd
      }

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventToSave),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to save event' }))
        setSaveError(errData.error || 'Failed to save event')
        setStep('confirm')
        return
      }

      const data = await res.json()
      setSavedEvent(data.event)
      setStep('saved')

      // Refresh previous events list
      await fetchEvents()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save event')
      setStep('confirm')
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setStep('input')
    setInputText('')
    setParsedEvent(null)
    setEditedEvent(null)
    setParseError('')
    setSaveError('')
    setSavedEvent(null)
  }

  return (
    <div className="update-events">
      <h1 className="page-title">Update Events</h1>
      <p className="page-description">
        Parse and save events to your oulipo portfolio.
      </p>

      {/* Step 1: Input */}
      {step === 'input' && (
        <div className="ue-section">
          <label htmlFor="event-input" className="ue-label">
            Paste event info (link, location, freeform text)
          </label>
          <textarea
            id="event-input"
            className="ue-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste event details here — a link, email, or description..."
            rows={6}
          />
          {parseError && (
            <p className="ue-error" role="alert">{parseError}</p>
          )}
          <button
            className="ue-button ue-button--primary"
            onClick={handleParseEvent}
            disabled={!inputText.trim()}
          >
            Parse event
          </button>
        </div>
      )}

      {/* Step 2: Parsing (loading) */}
      {step === 'parsing' && (
        <div className="ue-section">
          <p className="ue-status">Parsing event with Claude...</p>
        </div>
      )}

      {/* Step 3: Confirmation form */}
      {step === 'confirm' && editedEvent && (
        <div className="ue-section">
          <h2 className="ue-section-title">Confirm Event Details</h2>
          {parseError ? (
            <p className="ue-error" role="alert">{parseError}</p>
          ) : (
            <p className="ue-hint">
              Claude extracted these fields. Edit any that need correction.
            </p>
          )}

          <div className="ue-form">
            <div className="ue-field">
              <label htmlFor="field-org" className="ue-label">Organization</label>
              <input
                id="field-org"
                type="text"
                value={editedEvent.org}
                onChange={(e) => handleFieldChange('org', e.target.value)}
              />
            </div>

            <div className="ue-field">
              <label htmlFor="field-title" className="ue-label">Title</label>
              <input
                id="field-title"
                type="text"
                value={editedEvent.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
              />
            </div>

            <div className="ue-field">
              <label htmlFor="field-description" className="ue-label">Description</label>
              <input
                id="field-description"
                type="text"
                value={editedEvent.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
              />
            </div>

            <div className="ue-field">
              <label htmlFor="field-type" className="ue-label">Type</label>
              <select
                id="field-type"
                value={editedEvent.type}
                onChange={(e) => handleFieldChange('type', e.target.value)}
              >
                <option value="">—</option>
                <option value="Workshop">Workshop</option>
                <option value="Performance">Performance</option>
                <option value="Keynote">Keynote</option>
                <option value="Panel">Panel</option>
                <option value="Exhibition">Exhibition</option>
                <option value="Talk">Talk</option>
              </select>
            </div>

            <div className="ue-field">
              <label htmlFor="field-location" className="ue-label">Location</label>
              <input
                id="field-location"
                type="text"
                value={editedEvent.location}
                onChange={(e) => handleFieldChange('location', e.target.value)}
              />
            </div>

            <div className="ue-field">
              <label htmlFor="field-date" className="ue-label">Date (start)</label>
              <input
                id="field-date"
                type="date"
                value={editedEvent.date}
                onChange={(e) => handleFieldChange('date', e.target.value)}
              />
            </div>

            <div className="ue-field">
              <label htmlFor="field-dateEnd" className="ue-label">Date (end, optional)</label>
              <input
                id="field-dateEnd"
                type="date"
                value={editedEvent.dateEnd || ''}
                onChange={(e) => handleFieldChange('dateEnd', e.target.value)}
              />
            </div>

            <div className="ue-field">
              <label htmlFor="field-dateDisplay" className="ue-label">Date display text</label>
              <input
                id="field-dateDisplay"
                type="text"
                value={editedEvent.dateDisplay}
                onChange={(e) => handleFieldChange('dateDisplay', e.target.value)}
                placeholder="e.g. Mar 15, Nov 18–20"
              />
            </div>

            <div className="ue-field">
              <label htmlFor="field-link" className="ue-label">Link</label>
              <input
                id="field-link"
                type="url"
                value={editedEvent.link}
                onChange={(e) => handleFieldChange('link', e.target.value)}
              />
            </div>
          </div>

          {saveError && (
            <p className="ue-error" role="alert">{saveError}</p>
          )}

          <div className="ue-actions">
            <button
              className="ue-button"
              onClick={() => { setStep('input'); setParseError(''); }}
            >
              Back
            </button>
            <button
              className="ue-button ue-button--primary"
              onClick={handleSaveEvent}
              disabled={!editedEvent.title || !editedEvent.date || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save event'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Saving */}
      {step === 'saving' && (
        <div className="ue-section">
          <p className="ue-status">Saving event...</p>
        </div>
      )}

      {/* Step 5: Saved confirmation */}
      {step === 'saved' && savedEvent && (
        <div className="ue-section">
          <div className="ue-confirmation">
            <h2 className="ue-section-title">Event Saved</h2>
            <div className="ue-saved-summary">
              <p><strong>{savedEvent.org}</strong></p>
              <p>{savedEvent.title} &mdash; {savedEvent.description}</p>
              <p>{savedEvent.type}{savedEvent.location ? `, ${savedEvent.location}` : ''}</p>
              <p>{savedEvent.dateDisplay || savedEvent.date}</p>
              {savedEvent.link && (
                <p>
                  <a href={savedEvent.link} target="_blank" rel="noopener noreferrer">
                    {savedEvent.link}
                  </a>
                </p>
              )}
            </div>
            <p className="ue-hint">
              Updated events.json, upcoming/index.html, and cv/index.html
            </p>
          </div>

          <button
            className="ue-button ue-button--primary"
            onClick={handleReset}
          >
            Add another event
          </button>
        </div>
      )}

      {/* Previous Events List */}
      <div className="ue-previous">
        <h2 className="ue-section-title">Previous Events</h2>
        {loadingEvents ? (
          <p className="ue-hint">Loading events...</p>
        ) : previousEvents.length === 0 ? (
          <p className="ue-hint">No events found.</p>
        ) : (
          <ul className="ue-events-list">
            {[...previousEvents].reverse().map((evt, i) => (
              <li key={`${evt.date}-${evt.title}-${i}`} className="ue-event-item">
                <span className="ue-event-org">{evt.org}</span>
                <span className="ue-event-title">{evt.title}</span>
                <span className="ue-event-meta">
                  {evt.type && <span className="ue-event-type">{evt.type}</span>}
                  {evt.location && <span>{evt.location}</span>}
                  <span>{evt.dateDisplay || evt.date}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
