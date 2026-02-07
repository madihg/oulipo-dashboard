'use client'

import { useState, useEffect, useCallback } from 'react'
import './deadline-calendar.css'

interface DeadlineData {
  name: string
  date: string
  organization: string
  link: string
}

interface SavedDeadline extends DeadlineData {
  id?: string
}

type WorkflowStep = 'input' | 'parsing' | 'confirm' | 'saving' | 'saved'

export default function DeadlineCalendarPage() {
  const [step, setStep] = useState<WorkflowStep>('input')
  const [inputText, setInputText] = useState('')
  const [editedDeadline, setEditedDeadline] = useState<DeadlineData | null>(null)
  const [parseError, setParseError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedDeadline, setSavedDeadline] = useState<SavedDeadline | null>(null)
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<SavedDeadline[]>([])
  const [googleConnected, setGoogleConnected] = useState(false)
  const [loadingDeadlines, setLoadingDeadlines] = useState(true)
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [needsReauth, setNeedsReauth] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Check Google connection status and fetch deadlines
  const fetchDeadlines = useCallback(async () => {
    try {
      setLoadingDeadlines(true)
      const res = await fetch('/api/calendar/deadlines')
      if (res.ok) {
        const data = await res.json()
        setUpcomingDeadlines(data.deadlines || [])
        setGoogleConnected(data.googleConnected || false)
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingDeadlines(false)
    }
  }, [])

  useEffect(() => {
    fetchDeadlines()
  }, [fetchDeadlines])

  // Check for Google OAuth redirect params and restore form state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_connected') === 'true') {
      setGoogleConnected(true)
      setNeedsReauth(false)
      fetchDeadlines()

      // Restore pending form data if returning from OAuth re-auth
      const pendingDeadline = sessionStorage.getItem('dc_pending_deadline')
      const pendingStep = sessionStorage.getItem('dc_pending_step')
      if (pendingDeadline) {
        try {
          const deadline = JSON.parse(pendingDeadline) as DeadlineData
          setEditedDeadline(deadline)
          setStep((pendingStep as WorkflowStep) || 'confirm')
          setSaveError('')
        } catch {
          // Ignore parse errors
        }
        sessionStorage.removeItem('dc_pending_deadline')
        sessionStorage.removeItem('dc_pending_step')
      }

      // Clean URL
      window.history.replaceState({}, '', '/gallery/deadline-calendar')
    }
    if (params.get('google_error')) {
      setParseError('Google connection failed. Please try again.')
      // Restore pending form data even on error
      const pendingDeadline = sessionStorage.getItem('dc_pending_deadline')
      const pendingStep = sessionStorage.getItem('dc_pending_step')
      if (pendingDeadline) {
        try {
          const deadline = JSON.parse(pendingDeadline) as DeadlineData
          setEditedDeadline(deadline)
          setStep((pendingStep as WorkflowStep) || 'confirm')
        } catch {
          // Ignore parse errors
        }
        sessionStorage.removeItem('dc_pending_deadline')
        sessionStorage.removeItem('dc_pending_step')
      }
      window.history.replaceState({}, '', '/gallery/deadline-calendar')
    }
  }, [fetchDeadlines])

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true)
    try {
      // Save form data to sessionStorage before OAuth redirect
      if (editedDeadline) {
        sessionStorage.setItem('dc_pending_deadline', JSON.stringify(editedDeadline))
        sessionStorage.setItem('dc_pending_step', step)
      }

      const res = await fetch('/api/google/auth')
      if (res.ok) {
        const data = await res.json()
        if (data.url) {
          window.location.href = data.url
          return
        }
      }
      setParseError('Failed to start Google connection')
    } catch {
      setParseError('Failed to connect to Google')
    } finally {
      setConnectingGoogle(false)
    }
  }

  const handleParseDeadline = async () => {
    if (!inputText.trim()) return

    setStep('parsing')
    setParseError('')

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: `You are a deadline extraction assistant. Given freeform text about an application deadline, extract:
- name: the deadline/opportunity name
- date: deadline date in ISO 8601 format (YYYY-MM-DD)
- organization: the organization offering the opportunity
- link: URL if present, otherwise ""

Format your response as a single JSON object. Do not include any text before or after the JSON.`,
          userContent: inputText,
        }),
      })

      if (!res.ok) {
        // Fall back to manual entry
        const emptyDeadline: DeadlineData = {
          name: '', date: '', organization: '', link: '',
        }
        setEditedDeadline({ ...emptyDeadline })
        setParseError('Claude API unavailable \u2014 fill in the fields manually.')
        setStep('confirm')
        return
      }

      // Read SSE stream
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

      const jsonMatch = fullText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        setParseError('Could not extract deadline data from response')
        setStep('input')
        return
      }

      const deadlineData = JSON.parse(jsonMatch[0])
      const cleaned: DeadlineData = {
        name: deadlineData.name || '',
        date: deadlineData.date || '',
        organization: deadlineData.organization || '',
        link: deadlineData.link || '',
      }

      setEditedDeadline({ ...cleaned })
      setStep('confirm')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse deadline')
      setStep('input')
    }
  }

  const handleFieldChange = (field: keyof DeadlineData, value: string) => {
    if (!editedDeadline) return
    setEditedDeadline({ ...editedDeadline, [field]: value })
    // Clear validation error for this field when user types
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleAddToCalendar = async () => {
    if (!editedDeadline) return

    // Validate required fields
    const errors: Record<string, string> = {}
    if (!editedDeadline.name.trim()) {
      errors.name = 'Deadline name is required'
    }
    if (!editedDeadline.date.trim()) {
      errors.date = 'Date is required'
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors({})

    setStep('saving')
    setSaveError('')

    try {
      const res = await fetch('/api/calendar/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedDeadline),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.needsReauth) {
          // Token expired — show re-auth prompt while preserving form data
          setNeedsReauth(true)
          setGoogleConnected(false)
          setSaveError(data.error || 'Google connection expired. Please reconnect.')
          setStep('confirm')
          return
        }
        setSaveError(data.error || 'Failed to add deadline to calendar')
        setStep('confirm')
        return
      }

      setNeedsReauth(false)
      setSavedDeadline(data.deadline)
      setStep('saved')
      await fetchDeadlines()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to add deadline')
      setStep('confirm')
    }
  }

  const handleReset = () => {
    setStep('input')
    setInputText('')
    setEditedDeadline(null)
    setParseError('')
    setSaveError('')
    setSavedDeadline(null)
    setNeedsReauth(false)
    setValidationErrors({})
  }

  return (
    <div className="deadline-calendar">
      <h1 className="page-title">Deadline Calendar</h1>
      <p className="dc-description">
        Parse deadlines and add them to your Google Calendar.
      </p>

      {/* Google connection status */}
      {!googleConnected && !loadingDeadlines && (
        <div className="dc-connect">
          <p className="dc-hint">
            Connect Google to sync deadlines to your &ldquo;Application Deadlines&rdquo; calendar. Deadlines are saved locally until connected.
          </p>
          <button
            className="dc-button dc-button--primary"
            onClick={handleConnectGoogle}
            disabled={connectingGoogle}
          >
            {connectingGoogle ? 'Connecting...' : 'Connect Google'}
          </button>
        </div>
      )}

      {/* Step 1: Input */}
      {step === 'input' && (
        <div className="dc-section">
          <label htmlFor="deadline-input" className="dc-label">
            Paste deadline link or description
          </label>
          <textarea
            id="deadline-input"
            className="dc-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste deadline details here — a link, email, or description..."
            rows={4}
          />
          {parseError && (
            <p className="dc-error" role="alert">{parseError}</p>
          )}
          <button
            className="dc-button dc-button--primary"
            onClick={handleParseDeadline}
            disabled={!inputText.trim()}
          >
            Parse deadline
          </button>
        </div>
      )}

      {/* Step 2: Parsing */}
      {step === 'parsing' && (
        <div className="dc-section">
          <p className="dc-status">Parsing deadline with Claude...</p>
        </div>
      )}

      {/* Step 3: Confirmation form */}
      {step === 'confirm' && editedDeadline && (
        <div className="dc-section">
          <h2 className="dc-section-title">Confirm Deadline Details</h2>
          {parseError ? (
            <p className="dc-error" role="alert">{parseError}</p>
          ) : (
            <p className="dc-hint">
              Claude extracted these fields. Edit any that need correction.
            </p>
          )}

          <div className="dc-form">
            <div className="dc-field">
              <label htmlFor="field-name" className="dc-label">Deadline name *</label>
              <input
                id="field-name"
                type="text"
                value={editedDeadline.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                aria-invalid={!!validationErrors.name}
                aria-describedby={validationErrors.name ? 'field-name-error' : undefined}
              />
              {validationErrors.name && (
                <p id="field-name-error" className="dc-field-error" role="alert">{validationErrors.name}</p>
              )}
            </div>

            <div className="dc-field">
              <label htmlFor="field-date" className="dc-label">Date *</label>
              <input
                id="field-date"
                type="date"
                value={editedDeadline.date}
                onChange={(e) => handleFieldChange('date', e.target.value)}
                aria-invalid={!!validationErrors.date}
                aria-describedby={validationErrors.date ? 'field-date-error' : undefined}
              />
              {validationErrors.date && (
                <p id="field-date-error" className="dc-field-error" role="alert">{validationErrors.date}</p>
              )}
            </div>

            <div className="dc-field">
              <label htmlFor="field-organization" className="dc-label">Organization</label>
              <input
                id="field-organization"
                type="text"
                value={editedDeadline.organization}
                onChange={(e) => handleFieldChange('organization', e.target.value)}
              />
            </div>

            <div className="dc-field">
              <label htmlFor="field-link" className="dc-label">Link</label>
              <input
                id="field-link"
                type="url"
                value={editedDeadline.link}
                onChange={(e) => handleFieldChange('link', e.target.value)}
              />
            </div>
          </div>

          {saveError && (
            <p className="dc-error" role="alert">{saveError}</p>
          )}

          {needsReauth && (
            <div className="dc-reauth">
              <button
                className="dc-button dc-button--primary"
                onClick={handleConnectGoogle}
                disabled={connectingGoogle}
              >
                {connectingGoogle ? 'Connecting...' : 'Reconnect Google'}
              </button>
              <p className="dc-hint">
                Your form data will be preserved during reconnection.
              </p>
            </div>
          )}

          <div className="dc-actions">
            <button
              className="dc-button"
              onClick={() => { setStep('input'); setParseError(''); setNeedsReauth(false); }}
            >
              Back
            </button>
            <button
              className="dc-button dc-button--primary"
              onClick={handleAddToCalendar}
              disabled={false}
            >
              {needsReauth ? 'Save locally instead' : 'Add to calendar'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Saving */}
      {step === 'saving' && (
        <div className="dc-section">
          <p className="dc-status">Adding deadline to calendar...</p>
        </div>
      )}

      {/* Step 5: Saved confirmation */}
      {step === 'saved' && savedDeadline && (
        <div className="dc-section">
          <div className="dc-confirmation">
            <h2 className="dc-section-title">Deadline Added</h2>
            <div className="dc-saved-summary">
              <p><strong>{savedDeadline.name}</strong></p>
              {savedDeadline.organization && <p>{savedDeadline.organization}</p>}
              <p>{savedDeadline.date}</p>
              {savedDeadline.link && (
                <p>
                  <a href={savedDeadline.link} target="_blank" rel="noopener noreferrer">
                    {savedDeadline.link}
                  </a>
                </p>
              )}
            </div>
            <p className="dc-hint">
              {googleConnected
                ? 'Added to \u201cApplication Deadlines\u201d calendar in Google Calendar'
                : 'Deadline saved. Connect Google to sync to Google Calendar.'}
            </p>
          </div>

          <button
            className="dc-button dc-button--primary"
            onClick={handleReset}
          >
            Add another deadline
          </button>
        </div>
      )}

      {/* Upcoming Deadlines */}
      <div className="dc-upcoming">
        <h2 className="dc-section-title">Upcoming Deadlines</h2>
        {loadingDeadlines ? (
          <p className="dc-hint">Loading deadlines...</p>
        ) : upcomingDeadlines.length === 0 ? (
          <p className="dc-hint">No upcoming deadlines.</p>
        ) : (
          <ul className="dc-deadlines-list">
            {upcomingDeadlines.map((dl, i) => (
              <li key={dl.id || `${dl.date}-${dl.name}-${i}`} className="dc-deadline-item">
                <span className="dc-deadline-name">{dl.name}</span>
                <span className="dc-deadline-meta">
                  {dl.organization && <span>{dl.organization}</span>}
                  <span>{dl.date}</span>
                </span>
                {dl.link && (
                  <a href={dl.link} target="_blank" rel="noopener noreferrer" className="dc-deadline-link">
                    link
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
