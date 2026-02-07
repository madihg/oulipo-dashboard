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
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isGeneratingRef = useRef(false)
  const generationIdRef = useRef(0)

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

interface SlideData {
  id: string
  imageUrl: string
  imageName: string
  overlayText: string
  textX: number
  textY: number
  fontSize: number
}

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
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null)
  const [selectedFont, setSelectedFont] = useState('Diatype')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const isGeneratingRef = useRef(false)

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
      textX: 50,
      textY: 80,
      fontSize: 32,
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

  const handleOverlayTextChange = (slideId: string, newText: string) => {
    setSlides(prev => prev.map(s => s.id === slideId ? { ...s, overlayText: newText } : s))
  }

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

  const handleFontSizeChange = (slideId: string, delta: number) => {
    setSlides(prev => prev.map(s =>
      s.id === slideId ? { ...s, fontSize: Math.max(12, Math.min(72, s.fontSize + delta)) } : s
    ))
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

        if (slide.overlayText) {
          const fontSize = slide.fontSize * (1080 / 400)
          ctx.font = `${fontSize}px ${selectedFont}, sans-serif`
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
          ctx.shadowBlur = fontSize * 0.3

          const x = (slide.textX / 100) * 1080
          const y = (slide.textY / 100) * 1350
          const maxWidth = 1080 * 0.85
          const words = slide.overlayText.split(' ')
          const lines: string[] = []
          let currentLine = ''
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
              lines.push(currentLine)
              currentLine = word
            } else {
              currentLine = testLine
            }
          }
          if (currentLine) lines.push(currentLine)
          const lineHeight = fontSize * 1.3
          const totalHeight = lines.length * lineHeight
          const startY = y - totalHeight / 2
          lines.forEach((line, i) => {
            ctx.fillText(line, x, startY + i * lineHeight + lineHeight / 2)
          })
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
              ? 'Drop photos here or click to upload'
              : `${slides.length} photo${slides.length > 1 ? 's' : ''} uploaded — add more`}
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

      {/* Source Text Input */}
      <div className="ig-form-group">
        <label htmlFor="ig-source-text" className="ig-label">Source text</label>
        <textarea
          id="ig-source-text"
          className="ig-textarea"
          placeholder="Paste your long-form source text here..."
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
          <option value="Diatype">Diatype</option>
          <option value="Standard">Standard</option>
          <option value="Terminal Grotesque">Terminal Grotesque</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
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
          <div className="carousel-strip">
            {slides.map((slide, index) => (
              <CarouselSlide
                key={slide.id}
                slide={slide}
                index={index}
                totalSlides={slides.length}
                isEditing={editingSlideId === slide.id}
                selectedFont={selectedFont}
                onStartEdit={() => setEditingSlideId(slide.id)}
                onFinishEdit={() => setEditingSlideId(null)}
                onTextChange={(text) => handleOverlayTextChange(slide.id, text)}
                onRemove={() => handleRemoveSlide(slide.id)}
                onMoveLeft={() => handleMoveSlide(slide.id, 'left')}
                onMoveRight={() => handleMoveSlide(slide.id, 'right')}
                onFontSizeIncrease={() => handleFontSizeChange(slide.id, 2)}
                onFontSizeDecrease={() => handleFontSizeChange(slide.id, -2)}
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

function CarouselSlide({
  slide, index, totalSlides, isEditing, selectedFont,
  onStartEdit, onFinishEdit, onTextChange, onRemove,
  onMoveLeft, onMoveRight, onFontSizeIncrease, onFontSizeDecrease,
}: {
  slide: SlideData
  index: number
  totalSlides: number
  isEditing: boolean
  selectedFont: string
  onStartEdit: () => void
  onFinishEdit: () => void
  onTextChange: (text: string) => void
  onRemove: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
  onFontSizeIncrease: () => void
  onFontSizeDecrease: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [editText, setEditText] = useState(slide.overlayText)

  useEffect(() => { setEditText(slide.overlayText) }, [slide.overlayText])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pw = 270
    const ph = 338

    canvas.width = pw
    canvas.height = ph

    const img = new Image()
    img.onload = () => {
      const imgAspect = img.width / img.height
      const canvasAspect = pw / ph
      let dw: number, dh: number, dx: number, dy: number
      if (imgAspect > canvasAspect) {
        dh = ph; dw = ph * imgAspect; dx = (pw - dw) / 2; dy = 0
      } else {
        dw = pw; dh = pw / imgAspect; dx = 0; dy = (ph - dh) / 2
      }
      ctx.clearRect(0, 0, pw, ph)
      ctx.drawImage(img, dx, dy, dw, dh)

      if (slide.overlayText) {
        const fontSize = slide.fontSize
        ctx.font = `${fontSize}px ${selectedFont}, sans-serif`
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
        ctx.shadowBlur = fontSize * 0.2

        const x = (slide.textX / 100) * pw
        const y = (slide.textY / 100) * ph
        const maxWidth = pw * 0.85
        const words = slide.overlayText.split(' ')
        const lines: string[] = []
        let curLine = ''
        for (const word of words) {
          const test = curLine ? `${curLine} ${word}` : word
          if (ctx.measureText(test).width > maxWidth && curLine) {
            lines.push(curLine)
            curLine = word
          } else { curLine = test }
        }
        if (curLine) lines.push(curLine)
        const lh = fontSize * 1.3
        const th = lines.length * lh
        const sy = y - th / 2
        lines.forEach((line, i) => {
          ctx.fillText(line, x, sy + i * lh + lh / 2)
        })
      }
    }
    img.src = slide.imageUrl
  }, [slide.imageUrl, slide.overlayText, slide.textX, slide.textY, slide.fontSize, selectedFont])

  const handleEditSave = () => {
    onTextChange(editText)
    onFinishEdit()
  }

  return (
    <div className="carousel-slide">
      <div className="carousel-slide__number">{index + 1}/{totalSlides}</div>
      <canvas
        ref={canvasRef}
        className="carousel-slide__canvas"
        onClick={onStartEdit}
        role="img"
        aria-label={`Slide ${index + 1}: ${slide.overlayText || 'No overlay text — click to add'}`}
      />
      <div className="carousel-slide__controls">
        <button className="carousel-slide__btn" onClick={onMoveLeft} disabled={index === 0} title="Move left" aria-label="Move slide left">←</button>
        <button className="carousel-slide__btn" onClick={onFontSizeDecrease} title="Decrease text size" aria-label="Decrease text size">A−</button>
        <button className="carousel-slide__btn" onClick={onFontSizeIncrease} title="Increase text size" aria-label="Increase text size">A+</button>
        <button className="carousel-slide__btn" onClick={onMoveRight} disabled={index === totalSlides - 1} title="Move right" aria-label="Move slide right">→</button>
        <button className="carousel-slide__btn carousel-slide__btn--remove" onClick={onRemove} title="Remove slide" aria-label="Remove slide">×</button>
      </div>
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
            <button className="ig-button" onClick={handleEditSave}>Save</button>
            <button className="ig-button" onClick={onFinishEdit}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
