'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import './content-publisher.css'

type Tab = 'substack' | 'instagram'

export default function ContentPublisherPage() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('content-publisher-tab')
      return (saved === 'instagram' ? 'instagram' : 'substack') as Tab
    }
    return 'substack'
  })

  useEffect(() => {
    sessionStorage.setItem('content-publisher-tab', activeTab)
  }, [activeTab])

  return (
    <div className="content-publisher">
      <h1 className="page-title">Content Publisher</h1>
      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'substack' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('substack')}
        >
          Substack
        </button>
        <button
          className={`tab ${activeTab === 'instagram' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('instagram')}
        >
          Instagram
        </button>
      </div>
      <div className="tab-content">
        {activeTab === 'substack' ? (
          <SubstackTool />
        ) : (
          <InstagramTool />
        )}
      </div>
    </div>
  )
}

const SUBSTACK_SYSTEM_PROMPT = `You are an expert Substack writer and editor. Your job is to transform raw source text into polished Substack drafts.

You handle multiple content types — adapt your tone and structure to match the source material:
- **Essays**: Maintain the author's voice; use flowing prose, subheadings, and pull quotes
- **Workshop descriptions**: Emphasize what attendees will learn, logistics, and call to action
- **Talk summaries**: Highlight key insights, structure around main points, include speaker context
- **Art write-ups**: Evocative descriptions, reference artistic process, embed critical context

When given source text, produce a complete Substack draft with:
1. **Title** — A compelling, clear title on the first line
2. **Subtitle** — A brief subtitle on the second line (after a blank line)
3. **Body** — The full draft in clean markdown format (after another blank line)

Format your output exactly like this:
# Title Here

*Subtitle or tagline here*

Body content in markdown...

Use clear paragraphs, subheadings (##), bold, italic, and block quotes where appropriate. Keep the voice authentic and engaging. The content should feel like a polished newsletter post.

When given an edit instruction along with a current draft, revise the draft according to the instruction while maintaining the same overall structure and quality.`

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function SubstackTool() {
  const [sourceText, setSourceText] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('substack-sourceText') || ''
    }
    return ''
  })
  const [draft, setDraft] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('substack-draft') || ''
    }
    return ''
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [editInstruction, setEditInstruction] = useState('')
  const [error, setError] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('substack-conversationHistory')
        return saved ? JSON.parse(saved) : []
      } catch { return [] }
    }
    return []
  })
  // Google Doc fetch state
  const [googleDocUrl, setGoogleDocUrl] = useState('')
  const [isFetchingDoc, setIsFetchingDoc] = useState(false)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [docFetchError, setDocFetchError] = useState('')

  const draftRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isGeneratingRef = useRef(false)
  const generationIdRef = useRef(0)

  // Check Google OAuth status on mount
  useEffect(() => {
    fetch('/api/google/status')
      .then(res => res.json())
      .then(data => setGoogleConnected(data.connected))
      .catch(() => setGoogleConnected(false))
  }, [])

  // Handle Google OAuth redirect back to content-publisher
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('google_connected') === 'true') {
        setGoogleConnected(true)
        window.history.replaceState({}, '', window.location.pathname)
      }
      if (params.get('google_error')) {
        setDocFetchError('Google connection failed. Please try again.')
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])

  // Restore Google Doc URL from session after OAuth redirect
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUrl = sessionStorage.getItem('substack-googleDocUrl')
      if (savedUrl) {
        setGoogleDocUrl(savedUrl)
        sessionStorage.removeItem('substack-googleDocUrl')
      }
    }
  }, [])

  // Fetch Google Doc content
  const handleFetchDoc = useCallback(async () => {
    if (!googleDocUrl.trim()) {
      setDocFetchError('Please enter a Google Doc URL.')
      return
    }

    setIsFetchingDoc(true)
    setDocFetchError('')

    try {
      const response = await fetch(`/api/docs/fetch?url=${encodeURIComponent(googleDocUrl.trim())}`)
      const data = await response.json()

      if (!response.ok) {
        if (data.needsAuth) {
          // Need to connect Google - redirect to OAuth
          const authRes = await fetch('/api/google/auth?redirect=/gallery/content-publisher')
          const authData = await authRes.json()
          if (authData.url) {
            sessionStorage.setItem('substack-googleDocUrl', googleDocUrl)
            window.location.href = authData.url
            return
          }
          setDocFetchError('Could not initiate Google connection.')
          return
        }
        throw new Error(data.error || 'Failed to fetch document')
      }

      // Populate source text with fetched content
      setSourceText(data.content)
      setDocFetchError('')
      setGoogleDocUrl('')
    } catch (err) {
      setDocFetchError(err instanceof Error ? err.message : 'Failed to fetch Google Doc')
    } finally {
      setIsFetchingDoc(false)
    }
  }, [googleDocUrl])

  // Connect Google account
  const handleConnectGoogle = useCallback(async () => {
    try {
      const response = await fetch('/api/google/auth?redirect=/gallery/content-publisher')
      const data = await response.json()
      if (data.url) {
        if (googleDocUrl.trim()) {
          sessionStorage.setItem('substack-googleDocUrl', googleDocUrl)
        }
        window.location.href = data.url
      } else {
        setDocFetchError('Could not initiate Google connection.')
      }
    } catch {
      setDocFetchError('Failed to start Google connection.')
    }
  }, [googleDocUrl])

  // Persist state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('substack-sourceText', sourceText)
  }, [sourceText])

  useEffect(() => {
    sessionStorage.setItem('substack-draft', draft)
  }, [draft])

  useEffect(() => {
    sessionStorage.setItem('substack-conversationHistory', JSON.stringify(conversationHistory))
  }, [conversationHistory])

  const parseSSEStream = useCallback(async (
    response: Response,
    onText: (text: string) => void,
    signal: AbortSignal
  ) => {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response stream')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        if (signal.aborted) break
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
              // Handle Anthropic streaming format
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                onText(parsed.delta.text)
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!sourceText.trim()) {
      setError('Please enter source text before generating a draft.')
      return
    }

    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // Track this generation with an ID so stale callbacks don't update state
    const currentGenerationId = ++generationIdRef.current

    isGeneratingRef.current = true
    setIsGenerating(true)
    setError('')
    setDraft('')
    setCopySuccess(false)

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    let accumulatedText = ''

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: SUBSTACK_SYSTEM_PROMPT,
          userContent: `Please transform the following source text into a polished Substack draft:\n\n${sourceText}`,
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `API error (${response.status})`)
      }

      await parseSSEStream(response, (text) => {
        // Only update state if this is still the current generation
        if (generationIdRef.current !== currentGenerationId) return
        accumulatedText += text
        setDraft(accumulatedText)
      }, abortController.signal)

      // Only update conversation history if this generation wasn't superseded
      if (generationIdRef.current === currentGenerationId) {
        setConversationHistory([
          { role: 'user', content: `Please transform the following source text into a polished Substack draft:\n\n${sourceText}` },
          { role: 'assistant', content: accumulatedText },
        ])
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      // Only show error if this generation wasn't superseded
      if (generationIdRef.current === currentGenerationId) {
        setError(err instanceof Error ? err.message : 'Failed to generate draft')
      }
    } finally {
      // Only clear generating state if this is still the current generation
      if (generationIdRef.current === currentGenerationId) {
        isGeneratingRef.current = false
        setIsGenerating(false)
        abortControllerRef.current = null
      }
    }
  }, [sourceText, parseSSEStream])

  const handleEdit = useCallback(async () => {
    if (!editInstruction.trim() || !draft.trim()) return

    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // Track this generation with an ID so stale callbacks don't update state
    const currentGenerationId = ++generationIdRef.current

    isGeneratingRef.current = true
    setIsGenerating(true)
    setError('')
    setCopySuccess(false)

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    let accumulatedText = ''

    // Build messages with conversation history + edit instruction
    const editMessage = `Here is the current draft:\n\n${draft}\n\nPlease make the following edit: ${editInstruction}`

    const messages: Message[] = [
      ...conversationHistory,
      { role: 'user', content: editMessage },
    ]

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: SUBSTACK_SYSTEM_PROMPT,
          messages,
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `API error (${response.status})`)
      }

      setDraft('')

      await parseSSEStream(response, (text) => {
        if (generationIdRef.current !== currentGenerationId) return
        accumulatedText += text
        setDraft(accumulatedText)
      }, abortController.signal)

      // Only update state if this generation wasn't superseded
      if (generationIdRef.current === currentGenerationId) {
        setConversationHistory([
          ...messages,
          { role: 'assistant', content: accumulatedText },
        ])
        setEditInstruction('')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (generationIdRef.current === currentGenerationId) {
        setError(err instanceof Error ? err.message : 'Failed to update draft')
      }
    } finally {
      if (generationIdRef.current === currentGenerationId) {
        isGeneratingRef.current = false
        setIsGenerating(false)
        abortControllerRef.current = null
      }
    }
  }, [editInstruction, draft, conversationHistory, parseSSEStream])

  const handleCopy = useCallback(async () => {
    if (!draft.trim()) return

    try {
      await navigator.clipboard.writeText(draft)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      // Fallback for clipboard API failure
      const textarea = document.createElement('textarea')
      textarea.value = draft
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }, [draft])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
      e.preventDefault()
      handleEdit()
    }
  }, [handleEdit, isGenerating])

  return (
    <div className="substack-tool">
      <p className="tool-description">Generate Substack drafts from your source text.</p>

      {/* Google Doc link input (optional) */}
      <div className="gdoc-section">
        <label htmlFor="gdoc-url" className="input-label">Google Doc link (optional)</label>
        <div className="gdoc-input-row">
          <input
            id="gdoc-url"
            type="url"
            className="gdoc-input"
            placeholder="https://docs.google.com/document/d/..."
            value={googleDocUrl}
            onChange={(e) => { setGoogleDocUrl(e.target.value); if (docFetchError) setDocFetchError('') }}
            disabled={isFetchingDoc}
            aria-label="Google Doc URL"
          />
          {googleConnected ? (
            <button
              className="gdoc-fetch-btn"
              onClick={handleFetchDoc}
              disabled={isFetchingDoc || !googleDocUrl.trim()}
            >
              {isFetchingDoc ? 'Fetching...' : 'Fetch'}
            </button>
          ) : (
            <button
              className="gdoc-connect-btn"
              onClick={handleConnectGoogle}
              disabled={googleConnected === null}
            >
              Connect Google
            </button>
          )}
        </div>
        {docFetchError && (
          <div className="gdoc-error" role="alert">{docFetchError}</div>
        )}
        {googleConnected === false && (
          <p className="gdoc-hint">Connect Google to fetch documents from Google Docs.</p>
        )}
      </div>

      {/* Source text input */}
      <div className="substack-input-section">
        <label htmlFor="source-text" className="input-label">Source text</label>
        <textarea
          id="source-text"
          className="source-textarea"
          placeholder="Paste your source text here — essay, workshop description, talk summary, art write-up..."
          value={sourceText}
          onChange={(e) => { setSourceText(e.target.value); if (error) setError('') }}
          rows={8}
          disabled={false}
        />
        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={false}
        >
          {isGenerating && !draft ? 'Generating...' : isGenerating ? 'Regenerate draft' : 'Generate draft'}
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="substack-error" role="alert">
          {error}
        </div>
      )}

      {/* Draft output */}
      {(draft || isGenerating) && (
        <div className="substack-output-section">
          <div className="output-header">
            <label htmlFor="draft-output" className="input-label">Draft</label>
            <div className="output-actions">
              {isGenerating && (
                <span className="streaming-indicator">Streaming...</span>
              )}
              <button
                className="copy-btn"
                onClick={handleCopy}
                disabled={!draft.trim() || isGenerating}
              >
                {copySuccess ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
          </div>
          <textarea
            id="draft-output"
            ref={draftRef}
            className="draft-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            disabled={isGenerating}
          />

          {/* Iterative editing */}
          {draft && !isGenerating && (
            <div className="edit-section">
              <label htmlFor="edit-instruction" className="input-label">Edit instruction</label>
              <div className="edit-input-row">
                <input
                  id="edit-instruction"
                  type="text"
                  className="edit-input"
                  placeholder="e.g., make the intro punchier, add more subheadings, shorten it..."
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  disabled={isGenerating}
                />
                <button
                  className="edit-btn"
                  onClick={handleEdit}
                  disabled={isGenerating || !editInstruction.trim()}
                >
                  Edit
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Instagram Tool
// ────────────────────────────────────────────────────────────────────

interface SlideData {
  id: string
  imageUrl: string
  imageName: string
  overlayText: string
  // Text box position/size as % of container
  boxX: number      // left position (%)
  boxY: number      // top position (%)
  boxWidth: number   // width (%)
  boxHeight: number  // height (%)
  fontSize: number   // in px for preview
}

const OVERLAY_FONTS = [
  { label: 'Diatype', value: 'Diatype' },
  { label: 'Standard', value: 'Standard' },
  { label: 'Terminal Grotesque', value: 'Terminal Grotesque' },
  { label: 'Times Condensed', value: 'Times Condensed' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia' },
]

function InstagramTool() {
  const [slides, setSlides] = useState<SlideData[]>([])
  const [sourceText, setSourceText] = useState('')
  const [caption, setCaption] = useState('')
  const [captionEditInstruction, setCaptionEditInstruction] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [selectedFont, setSelectedFont] = useState('Diatype')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const isGeneratingRef = useRef(false)

  // Google Doc fetch state for Instagram
  const [googleDocUrl, setGoogleDocUrl] = useState('')
  const [isFetchingDoc, setIsFetchingDoc] = useState(false)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [docFetchError, setDocFetchError] = useState('')

  // Check Google OAuth status on mount
  useEffect(() => {
    fetch('/api/google/status')
      .then(res => res.json())
      .then(data => setGoogleConnected(data.connected))
      .catch(() => setGoogleConnected(false))
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('google_connected') === 'true') {
        setGoogleConnected(true)
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUrl = sessionStorage.getItem('ig-googleDocUrl')
      if (savedUrl) {
        setGoogleDocUrl(savedUrl)
        sessionStorage.removeItem('ig-googleDocUrl')
      }
    }
  }, [])

  const handleFetchDoc = useCallback(async () => {
    if (!googleDocUrl.trim()) { setDocFetchError('Please enter a Google Doc URL.'); return }
    setIsFetchingDoc(true)
    setDocFetchError('')
    try {
      const response = await fetch(`/api/docs/fetch?url=${encodeURIComponent(googleDocUrl.trim())}`)
      const data = await response.json()
      if (!response.ok) {
        if (data.needsAuth) {
          const authRes = await fetch('/api/google/auth?redirect=/gallery/content-publisher')
          const authData = await authRes.json()
          if (authData.url) {
            sessionStorage.setItem('ig-googleDocUrl', googleDocUrl)
            window.location.href = authData.url
            return
          }
          setDocFetchError('Could not initiate Google connection.')
          return
        }
        throw new Error(data.error || 'Failed to fetch document')
      }
      setSourceText(data.content)
      setDocFetchError('')
      setGoogleDocUrl('')
    } catch (err) {
      setDocFetchError(err instanceof Error ? err.message : 'Failed to fetch Google Doc')
    } finally {
      setIsFetchingDoc(false)
    }
  }, [googleDocUrl])

  const handleConnectGoogle = useCallback(async () => {
    try {
      const response = await fetch('/api/google/auth?redirect=/gallery/content-publisher')
      const data = await response.json()
      if (data.url) {
        if (googleDocUrl.trim()) sessionStorage.setItem('ig-googleDocUrl', googleDocUrl)
        window.location.href = data.url
      } else {
        setDocFetchError('Could not initiate Google connection.')
      }
    } catch {
      setDocFetchError('Failed to start Google connection.')
    }
  }, [googleDocUrl])

  const generateId = () => `slide-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const imageFiles = fileArray.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      setError('Please upload image files (JPG, PNG, etc.)')
      return
    }
    const newSlides: SlideData[] = imageFiles.map(file => ({
      id: generateId(),
      imageUrl: URL.createObjectURL(file),
      imageName: file.name,
      overlayText: '',
      boxX: 10,
      boxY: 60,
      boxWidth: 80,
      boxHeight: 30,
      fontSize: 18,
    }))
    setSlides(prev => [...prev, ...newSlides])
    setError('')
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dropZoneRef.current?.classList.add('drop-zone--active')
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dropZoneRef.current?.classList.remove('drop-zone--active')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dropZoneRef.current?.classList.remove('drop-zone--active')
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleGenerate = async () => {
    if (slides.length === 0) { setError('Please upload at least one photo first.'); return }
    if (!sourceText.trim()) { setError('Please enter source text for the carousel.'); return }

    // Prevent double-click: bail if already generating
    if (isGeneratingRef.current) return
    isGeneratingRef.current = true
    setIsGenerating(true)
    setError('')
    setStreamingText('')
    setCaption('')

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: `You are a social media assistant that creates Instagram carousel content. Given source text and the number of slides, generate:
1. Short overlay text for each slide (10-25 words max per slide)
2. A complete Instagram caption with relevant hashtags

Format your response as JSON: { "slides": [{ "overlayText": "..." }], "caption": "..." }
IMPORTANT: Return ONLY valid JSON. No markdown, no code fences. The "slides" array must have exactly ${slides.length} items.`,
          userContent: `Create Instagram carousel content for ${slides.length} slides based on this text:\n\n${sourceText}`,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errData.error || `API error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullText += parsed.delta.text
                setStreamingText(fullText)
              }
            } catch { /* skip malformed SSE chunks */ }
          }
        }
      }

      const jsonMatch = fullText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0])
          if (result.slides && Array.isArray(result.slides)) {
            setSlides(prev => prev.map((slide, i) => ({
              ...slide,
              overlayText: result.slides[i]?.overlayText || slide.overlayText,
            })))
          }
          if (result.caption) setCaption(result.caption)
        } catch {
          setError('Could not parse carousel data from response. Please try again.')
        }
      } else {
        setError('Could not parse carousel data from response. Please try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate carousel')
    } finally {
      isGeneratingRef.current = false
      setIsGenerating(false)
      setStreamingText('')
    }
  }

  const updateSlide = useCallback((slideId: string, updates: Partial<SlideData>) => {
    setSlides(prev => prev.map(s => s.id === slideId ? { ...s, ...updates } : s))
  }, [])

  const handleRemoveSlide = (slideId: string) => {
    setSlides(prev => prev.filter(s => s.id !== slideId))
  }

  const handleMoveSlide = (slideId: string, direction: 'left' | 'right') => {
    setSlides(prev => {
      const idx = prev.findIndex(s => s.id === slideId)
      if (idx === -1) return prev
      const newIdx = direction === 'left' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const newSlides = [...prev]
      ;[newSlides[idx], newSlides[newIdx]] = [newSlides[newIdx], newSlides[idx]]
      return newSlides
    })
  }

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = caption
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const handleExport = async () => {
    if (slides.length === 0) { setError('No slides to export.'); return }
    setIsExporting(true)
    setError('')

    try {
      const slideDataArray = await Promise.all(slides.map(async (slide, slideIndex) => {
        const canvas = document.createElement('canvas')
        canvas.width = 1080
        canvas.height = 1350
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas not supported')

        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Failed to load image'))
          img.src = slide.imageUrl
        })

        const imgAspect = img.width / img.height
        const canvasAspect = 1080 / 1350
        let drawWidth: number, drawHeight: number, drawX: number, drawY: number
        if (imgAspect > canvasAspect) {
          drawHeight = 1350
          drawWidth = 1350 * imgAspect
          drawX = (1080 - drawWidth) / 2
          drawY = 0
        } else {
          drawWidth = 1080
          drawHeight = 1080 / imgAspect
          drawX = 0
          drawY = (1350 - drawHeight) / 2
        }
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

        // Draw white rectangle with text
        if (slide.overlayText) {
          const bx = (slide.boxX / 100) * 1080
          const by = (slide.boxY / 100) * 1350
          const bw = (slide.boxWidth / 100) * 1080
          const bh = (slide.boxHeight / 100) * 1350

          // White rectangle background
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.fillRect(bx, by, bw, bh)

          // Text inside the rectangle
          const fontFamily = selectedFont === 'Times Condensed'
            ? '"Times New Roman", Times, serif'
            : `${selectedFont}, sans-serif`
          const exportFontSize = slide.fontSize * (1080 / 272)
          ctx.font = `${exportFontSize}px ${fontFamily}`
          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'

          const maxTextWidth = bw * 0.9
          const words = slide.overlayText.split(' ')
          const lines: string[] = []
          let currentLine = ''
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word
            if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
              lines.push(currentLine)
              currentLine = word
            } else {
              currentLine = testLine
            }
          }
          if (currentLine) lines.push(currentLine)

          const lineHeight = exportFontSize * 1.3
          const totalTextHeight = lines.length * lineHeight
          const textStartY = by + (bh - totalTextHeight) / 2
          const textCenterX = bx + bw / 2

          // Apply horizontal scaling for Times Condensed
          if (selectedFont === 'Times Condensed') {
            ctx.save()
            ctx.translate(textCenterX, 0)
            ctx.scale(0.8, 1)
            lines.forEach((line, i) => {
              ctx.fillText(line, 0, textStartY + i * lineHeight + lineHeight / 2)
            })
            ctx.restore()
          } else {
            lines.forEach((line, i) => {
              ctx.fillText(line, textCenterX, textStartY + i * lineHeight + lineHeight / 2)
            })
          }
        }

        return {
          imageData: canvas.toDataURL('image/png').split(',')[1],
          filename: `slide-${slideIndex + 1}.png`,
        }
      }))

      const response = await fetch('/api/carousel/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: slideDataArray }),
      })

      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'carousel-export.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  const handleCaptionEdit = async () => {
    if (!captionEditInstruction.trim() || !caption) return
    setIsGenerating(true)
    setError('')

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: 'You are an Instagram caption editor. You will receive the current caption and an edit instruction. Return ONLY the updated caption text. No JSON, no explanations.',
          userContent: `Current caption:\n${caption}\n\nEdit instruction: ${captionEditInstruction}`,
        }),
      })

      if (!response.ok) throw new Error('Failed to edit caption')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullText += parsed.delta.text
              }
            } catch { /* skip */ }
          }
        }
      }

      if (fullText.trim()) {
        setCaption(fullText.trim())
        setCaptionEditInstruction('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit caption')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="instagram-tool">
      <p className="tool-description">Create Instagram carousel slides from photos and text.</p>

      {/* Photo Upload Area */}
      <div
        ref={dropZoneRef}
        className="drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload photos - drag and drop or click to browse"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
      >
        <div className="drop-zone__content">
          <span className="drop-zone__icon">+</span>
          <span className="drop-zone__text">
            {slides.length === 0
              ? 'Drop photos here or click to upload (multiple allowed)'
              : `${slides.length} photo${slides.length > 1 ? 's' : ''} uploaded — drop or click to add more`}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="drop-zone__input"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
          aria-label="Upload photos"
        />
      </div>

      {/* Google Doc link (optional source text) */}
      <div className="gdoc-section">
        <label htmlFor="ig-gdoc-url" className="ig-label">Google Doc link (optional source text)</label>
        <div className="gdoc-input-row">
          <input
            id="ig-gdoc-url"
            type="url"
            className="gdoc-input"
            placeholder="https://docs.google.com/document/d/..."
            value={googleDocUrl}
            onChange={(e) => { setGoogleDocUrl(e.target.value); if (docFetchError) setDocFetchError('') }}
            disabled={isFetchingDoc}
          />
          {googleConnected ? (
            <button className="gdoc-fetch-btn" onClick={handleFetchDoc} disabled={isFetchingDoc || !googleDocUrl.trim()}>
              {isFetchingDoc ? 'Fetching...' : 'Fetch'}
            </button>
          ) : (
            <button className="gdoc-connect-btn" onClick={handleConnectGoogle} disabled={googleConnected === null}>
              Connect Google
            </button>
          )}
        </div>
        {docFetchError && <div className="gdoc-error" role="alert">{docFetchError}</div>}
      </div>

      {/* Source Text Input */}
      <div className="ig-form-group">
        <label htmlFor="ig-source-text" className="ig-label">Source text</label>
        <textarea
          id="ig-source-text"
          className="ig-textarea"
          placeholder="Paste your long-form source text here, or fetch from Google Docs above..."
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          rows={5}
        />
      </div>

      {/* Font Selector */}
      <div className="ig-form-group ig-form-row">
        <label htmlFor="ig-font" className="ig-label">Overlay font</label>
        <select
          id="ig-font"
          className="ig-select"
          value={selectedFont}
          onChange={(e) => setSelectedFont(e.target.value)}
        >
          {OVERLAY_FONTS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Generate Button */}
      <button
        className="ig-button ig-button--primary"
        onClick={handleGenerate}
        disabled={isGenerating || slides.length === 0 || !sourceText.trim()}
      >
        {isGenerating ? 'Generating...' : 'Generate carousel'}
      </button>

      {/* Streaming Indicator */}
      {isGenerating && streamingText && (
        <div className="ig-streaming">
          <p className="ig-streaming__label">Generating content...</p>
          <pre className="ig-streaming__text">{streamingText}</pre>
        </div>
      )}

      {/* Error Display */}
      {error && <div className="ig-error" role="alert">{error}</div>}

      {/* Carousel Preview */}
      {slides.length > 0 && (
        <div className="carousel-section">
          <h2 className="carousel-section__title">Carousel Preview</h2>
          <p className="carousel-section__hint">Drag the white text box to reposition. Drag edges to resize. Click text to edit.</p>
          <div className="carousel-strip">
            {slides.map((slide, index) => (
              <InteractiveSlide
                key={slide.id}
                slide={slide}
                index={index}
                totalSlides={slides.length}
                selectedFont={selectedFont}
                onUpdate={(updates) => updateSlide(slide.id, updates)}
                onRemove={() => handleRemoveSlide(slide.id)}
                onMoveLeft={() => handleMoveSlide(slide.id, 'left')}
                onMoveRight={() => handleMoveSlide(slide.id, 'right')}
              />
            ))}
            <div
              className="carousel-slide carousel-slide--add"
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Add another photo"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
            >
              <span className="carousel-slide__add-icon">+</span>
              <span className="carousel-slide__add-text">Add slide</span>
            </div>
          </div>
        </div>
      )}

      {/* Caption Area */}
      {caption && (
        <div className="caption-section">
          <h2 className="caption-section__title">Instagram Caption</h2>
          <textarea
            className="caption-section__text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={6}
            aria-label="Instagram caption"
          />
          <div className="caption-section__edit-row">
            <input
              type="text"
              className="caption-section__edit-input"
              placeholder='Edit caption ("shorter", "add hashtags", etc.)'
              value={captionEditInstruction}
              onChange={(e) => setCaptionEditInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCaptionEdit() }}
              aria-label="Caption edit instruction"
            />
            <button
              className="ig-button"
              onClick={handleCaptionEdit}
              disabled={isGenerating || !captionEditInstruction.trim()}
            >
              Edit
            </button>
          </div>
          <button
            className="ig-button ig-button--copy"
            onClick={handleCopyCaption}
          >
            {copySuccess ? 'Copied!' : 'Copy caption'}
          </button>
        </div>
      )}

      {/* Export Button */}
      {slides.length > 0 && slides.some(s => s.overlayText) && (
        <div className="export-section">
          <button
            className="ig-button ig-button--primary ig-button--export"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export as ZIP'}
          </button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Interactive Slide — draggable/resizable white text box
// ────────────────────────────────────────────────────────────────────

function InteractiveSlide({
  slide, index, totalSlides, selectedFont,
  onUpdate, onRemove, onMoveLeft, onMoveRight,
}: {
  slide: SlideData
  index: number
  totalSlides: number
  selectedFont: string
  onUpdate: (updates: Partial<SlideData>) => void
  onRemove: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(slide.overlayText)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, boxX: 0, boxY: 0 })
  const resizeStartRef = useRef({ x: 0, y: 0, boxW: 0, boxH: 0, boxX: 0, boxY: 0, edge: '' })

  useEffect(() => { setEditText(slide.overlayText) }, [slide.overlayText])

  const PREVIEW_W = 272
  const PREVIEW_H = 340

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragStartRef.current = { x: clientX, y: clientY, boxX: slide.boxX, boxY: slide.boxY }
    setIsDragging(true)
  }, [slide.boxX, slide.boxY])

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const dx = clientX - dragStartRef.current.x
      const dy = clientY - dragStartRef.current.y
      const newX = Math.max(0, Math.min(100 - slide.boxWidth, dragStartRef.current.boxX + (dx / PREVIEW_W) * 100))
      const newY = Math.max(0, Math.min(100 - slide.boxHeight, dragStartRef.current.boxY + (dy / PREVIEW_H) * 100))
      onUpdate({ boxX: newX, boxY: newY })
    }

    const handleUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [isDragging, slide.boxWidth, slide.boxHeight, onUpdate])

  // Resize handlers
  const handleResizeStart = useCallback((edge: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    resizeStartRef.current = {
      x: clientX, y: clientY,
      boxW: slide.boxWidth, boxH: slide.boxHeight,
      boxX: slide.boxX, boxY: slide.boxY, edge,
    }
    setIsResizing(true)
  }, [slide.boxWidth, slide.boxHeight, slide.boxX, slide.boxY])

  useEffect(() => {
    if (!isResizing) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const { x, y, boxW, boxH, boxX, boxY, edge } = resizeStartRef.current
      const dx = ((clientX - x) / PREVIEW_W) * 100
      const dy = ((clientY - y) / PREVIEW_H) * 100

      const updates: Partial<SlideData> = {}
      const minSize = 15

      if (edge.includes('right')) {
        updates.boxWidth = Math.max(minSize, Math.min(100 - boxX, boxW + dx))
      }
      if (edge.includes('bottom')) {
        updates.boxHeight = Math.max(minSize, Math.min(100 - boxY, boxH + dy))
      }
      if (edge.includes('left')) {
        const newW = Math.max(minSize, boxW - dx)
        const newX = boxX + boxW - newW
        if (newX >= 0) { updates.boxWidth = newW; updates.boxX = newX }
      }
      if (edge.includes('top')) {
        const newH = Math.max(minSize, boxH - dy)
        const newY = boxY + boxH - newH
        if (newY >= 0) { updates.boxHeight = newH; updates.boxY = newY }
      }

      onUpdate(updates)
    }

    const handleUp = () => setIsResizing(false)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [isResizing, onUpdate])

  const handleTextClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
  }

  const handleSaveText = () => {
    onUpdate({ overlayText: editText })
    setIsEditing(false)
  }

  const fontStyle: React.CSSProperties = selectedFont === 'Times Condensed'
    ? { fontFamily: '"Times New Roman", Times, serif', transform: 'scaleX(0.8)', transformOrigin: 'center' }
    : { fontFamily: `${selectedFont}, sans-serif` }

  return (
    <div className="carousel-slide">
      <div className="carousel-slide__number">{index + 1}/{totalSlides}</div>

      {/* Interactive preview container */}
      <div
        ref={containerRef}
        className="slide-preview"
        style={{ width: PREVIEW_W, height: PREVIEW_H, position: 'relative', overflow: 'hidden' }}
      >
        {/* Background image */}
        <img
          src={slide.imageUrl}
          alt={`Slide ${index + 1}`}
          className="slide-preview__img"
          draggable={false}
        />

        {/* White text box overlay */}
        {(slide.overlayText || isEditing) && (
          <div
            className={`text-box ${isDragging ? 'text-box--dragging' : ''}`}
            style={{
              left: `${slide.boxX}%`,
              top: `${slide.boxY}%`,
              width: `${slide.boxWidth}%`,
              height: `${slide.boxHeight}%`,
            }}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            {/* Resize handles */}
            <div className="text-box__handle text-box__handle--tl" onMouseDown={(e) => handleResizeStart('top-left', e)} onTouchStart={(e) => handleResizeStart('top-left', e)} />
            <div className="text-box__handle text-box__handle--tr" onMouseDown={(e) => handleResizeStart('top-right', e)} onTouchStart={(e) => handleResizeStart('top-right', e)} />
            <div className="text-box__handle text-box__handle--bl" onMouseDown={(e) => handleResizeStart('bottom-left', e)} onTouchStart={(e) => handleResizeStart('bottom-left', e)} />
            <div className="text-box__handle text-box__handle--br" onMouseDown={(e) => handleResizeStart('bottom-right', e)} onTouchStart={(e) => handleResizeStart('bottom-right', e)} />

            {/* Text content */}
            <div
              className="text-box__content"
              style={{ fontSize: `${slide.fontSize}px`, ...fontStyle }}
              onClick={handleTextClick}
            >
              {slide.overlayText || 'Click to add text'}
            </div>
          </div>
        )}

        {/* Click to add overlay if none */}
        {!slide.overlayText && !isEditing && (
          <div
            className="slide-preview__add-text"
            onClick={() => setIsEditing(true)}
          >
            Click to add overlay text
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="carousel-slide__controls">
        <button className="carousel-slide__btn" onClick={onMoveLeft} disabled={index === 0} title="Move left" aria-label="Move slide left">←</button>
        <button className="carousel-slide__btn" onClick={() => onUpdate({ fontSize: Math.max(8, slide.fontSize - 1) })} title="Decrease text size" aria-label="Decrease text size">A−</button>
        <button className="carousel-slide__btn" onClick={() => onUpdate({ fontSize: Math.min(48, slide.fontSize + 1) })} title="Increase text size" aria-label="Increase text size">A+</button>
        <button className="carousel-slide__btn" onClick={onMoveRight} disabled={index === totalSlides - 1} title="Move right" aria-label="Move slide right">→</button>
        <button className="carousel-slide__btn carousel-slide__btn--remove" onClick={onRemove} title="Remove slide" aria-label="Remove slide">×</button>
      </div>

      {/* Inline text editor */}
      {isEditing && (
        <div className="carousel-slide__editor">
          <textarea
            className="carousel-slide__editor-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="Enter overlay text..."
            rows={3}
            autoFocus
            aria-label={`Overlay text for slide ${index + 1}`}
          />
          <div className="carousel-slide__editor-actions">
            <button className="ig-button" onClick={handleSaveText}>Save</button>
            <button className="ig-button" onClick={() => setIsEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
