'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import './upcoming.css'

const UPCOMING_SYSTEM_PROMPT = `You are an event data assistant. The user will paste event details (workshop, talk, exhibition, etc.) and you help extract structured data for a Supabase events table.

SCHEMA (required fields: title, date):
- org: hosting organization
- title: event title (required)
- description: brief 3-8 word description
- type: Workshop, Performance, Keynote, Panel, Exhibition, Talk, or empty
- location: city or venue
- date: ISO 8601 YYYY-MM-DD (required)
- dateEnd: ISO 8601 if multi-day
- dateDisplay: human-readable e.g. "Mar 15", "Nov 18–20"
- link: event URL

When the user pastes text:
1. Extract what you can
2. Ask concise follow-up questions for missing required fields (title, date) or unclear info
3. When you have title and date, confirm with the user
4. When the user confirms (e.g. "yes", "save it", "looks good"), output a single line:
SAVE_EVENT:{"org":"...","title":"...","description":"...","type":"...","location":"...","date":"YYYY-MM-DD","dateEnd":"..." or omit,"dateDisplay":"...","link":"..."}
Also output a POSTING_IDEA: "One-line suggestion for what to post about this event" (e.g. "Share behind-the-scenes of the workshop setup")

Use only the exact keys above. Omit optional fields if empty. dateDisplay can be derived from date/dateEnd (e.g. "Mar 15" or "Nov 18–20").
Output SAVE_EVENT and POSTING_IDEA only when the user has confirmed.`

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type SupabaseStatus = { configured: boolean; connected?: boolean; table?: string; error?: string; hint?: string; message?: string }

export default function UpcomingPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [error, setError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatus | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/supabase/status')
      .then(r => r.json())
      .then((s: SupabaseStatus) => setSupabaseStatus(s))
      .catch(() => setSupabaseStatus({ configured: false, message: 'Could not check Supabase status.' }))
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isThinking) return

    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsThinking(true)
    setError('')
    setSaveSuccess(null)

    try {
      const recentMessages = [...messages, userMsg].slice(-12)
      const chatMessages = recentMessages.map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          systemPrompt: UPCOMING_SYSTEM_PROMPT,
          messages: chatMessages,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `API error: ${res.status}`)
      }

      let fullText = ''
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) fullText += parsed.delta.text
            } catch { /* skip */ }
          }
        }
      }

      const saveIdx = fullText.indexOf('SAVE_EVENT:')
      let event: Record<string, unknown> | null = null
      if (saveIdx >= 0) {
        const jsonStart = fullText.indexOf('{', saveIdx)
        if (jsonStart >= 0) {
          let depth = 0
          let end = jsonStart
          for (let i = jsonStart; i < fullText.length; i++) {
            if (fullText[i] === '{') depth++
            else if (fullText[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
          }
          try {
            event = JSON.parse(fullText.slice(jsonStart, end)) as Record<string, unknown>
          } catch { /* ignore */ }
        }
      }
      const ideaMatch = fullText.match(/POSTING_IDEA:\s*"([^"]+)"/)
      const postingIdea = ideaMatch ? ideaMatch[1] : undefined

      if (event) {
        try {
          const saveRes = await fetch('/api/upcoming/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, postingIdea }),
          })
          const saveData = await saveRes.json()
          if (!saveRes.ok) {
            const detail = saveData.detail
            let errMsg = saveData.error || 'Save failed'
            if (detail?.hint) errMsg += ` ${detail.hint}`
            if (detail?.tablesAttempted) errMsg += ` (tried: ${detail.tablesAttempted.join(', ')})`
            throw new Error(errMsg)
          }
          setSaveSuccess(`Saved: ${event.title}${saveData.table ? ` → ${saveData.table}` : ''}`)

          // Also add task to localStorage so Postable picks it up even without Supabase postable_tasks table
          try {
            const POSTABLE_KEY = 'content-publisher-postable-tasks'
            const existing = JSON.parse(localStorage.getItem(POSTABLE_KEY) || '[]')
            const newTask = {
              id: `event-${Date.now()}`,
              title: String(event.title),
              notes: '',
              postingIdea: postingIdea || `Post about: ${event.title}`,
              status: 'active',
            }
            localStorage.setItem(POSTABLE_KEY, JSON.stringify([newTask, ...existing]))
          } catch { /* non-fatal */ }

          const displayText = fullText.replace(/SAVE_EVENT:\{[^}]+\}\s*/g, '').replace(/POSTING_IDEA:\s*"[^"]*"\s*/g, '').trim()
          setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: displayText || 'Event saved. A task was added to Postable.' }])
          return
        } catch (saveErr) {
          const msg = saveErr instanceof Error ? saveErr.message : 'Failed to save event'
          setError(msg)
          setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: `Could not save to Supabase: ${msg}` }])
        }
      }

      setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: fullText.trim() || 'I need more information. What is the event title and date?' }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: 'Sorry, I could not process that. Please try again.' }])
    } finally {
      setIsThinking(false)
    }
  }, [input, isThinking, messages])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  return (
    <div className="upcoming-page">
      <h1 className="page-title">Upcoming</h1>
      <p className="upcoming-intro">
        Paste event details below. I will extract the information, ask for anything missing, and save to your Supabase events table. Each new event also creates a task in Postable.
      </p>

      {supabaseStatus && !supabaseStatus.configured && (
        <div className="upcoming-warning" role="alert">
          <strong>Supabase not configured.</strong> Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> to Vercel (Project Settings → Environment Variables). Events will not be saved until configured.
        </div>
      )}
      {supabaseStatus?.configured && !supabaseStatus?.connected && supabaseStatus?.error && (
        <div className="upcoming-warning" role="alert">
          <strong>Supabase connection issue:</strong> {supabaseStatus.error}
          {supabaseStatus.hint && <p className="upcoming-warning-hint">{supabaseStatus.hint}</p>}
        </div>
      )}
      {error && <div className="upcoming-error" role="alert">{error}</div>}
      {saveSuccess && <div className="upcoming-success" role="status">{saveSuccess}</div>}

      <div className="upcoming-chat">
        <div className="upcoming-messages">
          {messages.length === 0 && !isThinking && (
            <div className="upcoming-welcome">
              <p>Paste event details (invitation, description, flyer text) and I will help you save them.</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`upcoming-message upcoming-message--${msg.role}`}>
              <div className="upcoming-message__text">{msg.content}</div>
            </div>
          ))}
          {isThinking && (
            <div className="upcoming-message upcoming-message--assistant">
              <div className="upcoming-message__text upcoming-thinking">Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="upcoming-input-area">
          <textarea
            ref={inputRef}
            className="upcoming-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste event details or answer questions..."
            rows={3}
            disabled={isThinking}
            aria-label="Event details or message"
          />
          <button className="upcoming-send-btn" onClick={handleSend} disabled={isThinking || !input.trim()} aria-label="Send">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
