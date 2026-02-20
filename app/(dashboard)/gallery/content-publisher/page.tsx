'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import './content-publisher.css'

// ────────────────────────────────────────────────────────────────────
// Default system prompts & model options
// ────────────────────────────────────────────────────────────────────

const DEFAULT_SUBSTACK_PROMPT = `You are an expert writer and editor with the sensibility of an MFA-trained literary artist. Your job is to take whatever the author gives you — whether it's a poem, essay, notes, fragments, journal entries, or unstructured musings — and transform it into a polished Substack essay.

**Understand the source first.** The input may not look like a Substack piece at all. It might be:
- A poem or lyric text
- Raw notes, sketches, or bullet points
- A personal essay with no clear structure
- Workshop or talk notes
- Fragments of thought or observation

Read it the way an MFA writer would: extract the core ideas, emotional truth, and thematic throughlines. Identify what the author is really trying to say beneath the surface. Then craft that into a coherent, engaging Substack essay — not by forcing the source into a template, but by distilling its essence and giving it form.

**Output format.** Produce a complete Substack draft with:
1. **Title** — A compelling, clear title on the first line
2. **Subtitle** — A brief subtitle on the second line (after a blank line)
3. **Body** — The full draft in clean markdown format (after another blank line)

Format your output exactly like this:
# Title Here

*Subtitle or tagline here*

Body content in markdown...

Use clear paragraphs, subheadings (##), bold, italic, and block quotes where appropriate. Preserve the author's voice and perspective. The result should feel like a polished newsletter post that honors the original material.

When given an edit instruction along with a current draft, revise the draft according to the instruction while maintaining the same overall structure and quality.`

const DEFAULT_INSTAGRAM_PROMPT = `You are a social media assistant that creates Instagram carousel content. Given source text and the number of slides, generate:
1. Short overlay text for each slide (10-25 words max per slide)
2. A complete Instagram caption with relevant hashtags

Format your response as JSON: { "slides": [{ "overlayText": "..." }], "caption": "..." }
IMPORTANT: Return ONLY valid JSON. No markdown, no code fences.`

interface ModelOption {
  id: string
  label: string
  provider: 'anthropic' | 'openai'
}

const MODEL_OPTIONS: ModelOption[] = [
  // Claude — most capable first
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'claude-haiku-3-5-20241022', label: 'Claude Haiku 3.5', provider: 'anthropic' },
  // OpenAI — most capable first
  { id: 'gpt-5.2', label: 'GPT-5.2', provider: 'openai' },
  { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro', provider: 'openai' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', provider: 'openai' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { id: 'o3', label: 'o3 (reasoning)', provider: 'openai' },
  { id: 'o4-mini', label: 'o4-mini (reasoning)', provider: 'openai' },
]

// ────────────────────────────────────────────────────────────────────
// Settings hook — persists to localStorage
// ────────────────────────────────────────────────────────────────────

interface AISettings {
  model: string
  substackPrompt: string
  instagramPrompt: string
}

function useAISettings(): [AISettings, (patch: Partial<AISettings>) => void, () => void] {
  const [settings, setSettings] = useState<AISettings>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('ai-settings')
        if (saved) {
          const parsed = JSON.parse(saved)
          return {
            model: parsed.model || MODEL_OPTIONS[0].id,
            substackPrompt: parsed.substackPrompt || DEFAULT_SUBSTACK_PROMPT,
            instagramPrompt: parsed.instagramPrompt || DEFAULT_INSTAGRAM_PROMPT,
          }
        }
      } catch { /* ignore */ }
    }
    return {
      model: MODEL_OPTIONS[0].id,
      substackPrompt: DEFAULT_SUBSTACK_PROMPT,
      instagramPrompt: DEFAULT_INSTAGRAM_PROMPT,
    }
  })

  useEffect(() => {
    localStorage.setItem('ai-settings', JSON.stringify(settings))
  }, [settings])

  const updateSettings = useCallback((patch: Partial<AISettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
  }, [])

  const resetDefaults = useCallback(() => {
    setSettings({
      model: MODEL_OPTIONS[0].id,
      substackPrompt: DEFAULT_SUBSTACK_PROMPT,
      instagramPrompt: DEFAULT_INSTAGRAM_PROMPT,
    })
  }, [])

  return [settings, updateSettings, resetDefaults]
}

// ────────────────────────────────────────────────────────────────────
// Root page component
// ────────────────────────────────────────────────────────────────────

type Tab = 'substack' | 'instagram' | 'postable'

export default function ContentPublisherPage() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('content-publisher-tab')
      if (saved === 'postable' || saved === 'substack' || saved === 'instagram') return saved as Tab
      return 'postable'
    }
    return 'postable'
  })
  const [aiSettings, updateSettings, resetDefaults] = useAISettings()

  useEffect(() => {
    sessionStorage.setItem('content-publisher-tab', activeTab)
  }, [activeTab])

  return (
    <div className="content-publisher">
      <div className="page-header">
        <h1 className="page-title">Content Publisher</h1>
      </div>

      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'postable' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('postable')}
        >
          Postable
        </button>
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
        {activeTab === 'substack' && (
          <SubstackTool settings={aiSettings} onUpdateSettings={updateSettings} onResetSettings={resetDefaults} />
        )}
        {activeTab === 'instagram' && (
          <InstagramTool settings={aiSettings} onUpdateSettings={updateSettings} onResetSettings={resetDefaults} onUpdateInstagramPrompt={(prompt: string) => updateSettings({ instagramPrompt: prompt })} onUpdateSubstackPrompt={(prompt: string) => updateSettings({ substackPrompt: prompt })} />
        )}
        {activeTab === 'postable' && <PostableTool />}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Inline tab settings (model + prompt)
// ────────────────────────────────────────────────────────────────────

const GEAR_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

function TabSettingsInline({
  settings,
  onUpdate,
  onReset,
  promptLabel,
  promptValue,
  onPromptChange,
}: {
  settings: AISettings
  onUpdate: (patch: Partial<AISettings>) => void
  onReset: () => void
  promptLabel: string
  promptValue: string
  onPromptChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const currentModel = MODEL_OPTIONS.find(m => m.id === settings.model) || MODEL_OPTIONS[0]

  return (
    <div className="tab-settings-inline">
      <button
        type="button"
        className="tab-settings-inline__toggle"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-label={open ? 'Close settings' : 'Open model and prompt settings'}
      >
        {GEAR_ICON}
        <span>Model & prompt</span>
      </button>
      {open && (
        <div className="tab-settings-inline__panel">
          <div className="tab-settings-inline__row">
            <label htmlFor="tab-model-select" className="tab-settings-inline__label">Model</label>
            <select
              id="tab-model-select"
              className="tab-settings-inline__select"
              value={settings.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
            >
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <button type="button" className="tab-settings-inline__reset" onClick={onReset}>Reset</button>
          </div>
          <div className="tab-settings-inline__field">
            <label htmlFor="tab-prompt" className="tab-settings-inline__label">{promptLabel}</label>
            <textarea
              id="tab-prompt"
              className="tab-settings-inline__textarea"
              value={promptValue}
              onChange={(e) => onPromptChange(e.target.value)}
              rows={6}
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Settings Panel (legacy, kept for reference but not rendered)
// ────────────────────────────────────────────────────────────────────

function SettingsPanel({
  settings, onUpdate, onReset, onClose,
}: {
  settings: AISettings
  onUpdate: (patch: Partial<AISettings>) => void
  onReset: () => void
  onClose: () => void
}) {
  const currentModel = MODEL_OPTIONS.find(m => m.id === settings.model) || MODEL_OPTIONS[0]

  return (
    <div className="settings-panel" role="region" aria-label="AI model settings">
      <div className="settings-panel__header">
        <h2 className="settings-panel__title">AI Settings</h2>
        <div className="settings-panel__actions">
          <button className="settings-panel__reset" onClick={onReset} title="Reset to defaults">
            Reset defaults
          </button>
          <button className="settings-panel__close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>
      </div>

      {/* Model selector */}
      <div className="settings-field">
        <label htmlFor="model-select" className="settings-label">Model</label>
        <select
          id="model-select"
          className="settings-select"
          value={settings.model}
          onChange={(e) => onUpdate({ model: e.target.value })}
        >
          {MODEL_OPTIONS.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.label} ({opt.provider})
            </option>
          ))}
        </select>
        <span className="settings-hint">
          Using {currentModel.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API
        </span>
      </div>

      {/* Substack system prompt */}
      <div className="settings-field">
        <label htmlFor="substack-prompt" className="settings-label">
          Substack system prompt
        </label>
        <textarea
          id="substack-prompt"
          className="settings-textarea"
          value={settings.substackPrompt}
          onChange={(e) => onUpdate({ substackPrompt: e.target.value })}
          rows={8}
          spellCheck={false}
        />
      </div>

      {/* Instagram system prompt */}
      <div className="settings-field">
        <label htmlFor="instagram-prompt" className="settings-label">
          Instagram system prompt
        </label>
        <textarea
          id="instagram-prompt"
          className="settings-textarea"
          value={settings.instagramPrompt}
          onChange={(e) => onUpdate({ instagramPrompt: e.target.value })}
          rows={8}
          spellCheck={false}
        />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// SSE Stream parser (shared)
// ────────────────────────────────────────────────────────────────────

async function parseSSEStream(
  response: Response,
  onText: (text: string) => void,
  signal?: AbortSignal,
) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response stream')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) break
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
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              onText(parsed.delta.text)
            }
          } catch { /* skip */ }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ────────────────────────────────────────────────────────────────────
// Chat helpers & types
// ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: ChatAction[]
}

interface ChatAction {
  type: 'update_slide' | 'update_caption' | 'update_instagram_prompt' | 'update_substack_prompt'
  index?: number
  text?: string
  overlayText?: string
}

function normalizeActions(actions: ChatAction[]): ChatAction[] {
  return (actions || []).map(a => {
    // Normalize legacy "update_prompt" to "update_instagram_prompt"
    if ((a.type as string) === 'update_prompt') return { ...a, type: 'update_instagram_prompt' as const }
    return a
  })
}

function parseChatResponse(text: string): { message: string; actions: ChatAction[] } {
  try {
    const parsed = JSON.parse(text.trim())
    if (parsed.message !== undefined) return { message: parsed.message, actions: normalizeActions(parsed.actions || []) }
  } catch { /* try other formats */ }

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim())
      if (parsed.message !== undefined) return { message: parsed.message, actions: normalizeActions(parsed.actions || []) }
    } catch { /* try other formats */ }
  }

  const objMatch = text.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0])
      if (parsed.message !== undefined) return { message: parsed.message, actions: normalizeActions(parsed.actions || []) }
    } catch { /* try other formats */ }
  }

  return { message: text, actions: [] }
}

function getFontFamily(font: string): string {
  switch (font) {
    case 'Times Condensed': return '"Times New Roman", Times, serif'
    case 'Georgia': return 'Georgia, serif'
    case 'Arial': return 'Arial, sans-serif'
    default: return `${font}, sans-serif`
  }
}

const CHAT_SYSTEM_PROMPT = `You are a creative director assistant for an Instagram carousel publisher tool. You have DIRECT CONTROL over the carousel content — you can edit slides, captions, and system prompts immediately.

YOUR CAPABILITIES (use them proactively when the user asks):
1. EDIT INDIVIDUAL SLIDES — Change the overlay text on any specific slide by index
2. EDIT THE CAPTION — Rewrite or improve the Instagram caption
3. EDIT THE INSTAGRAM PROMPT — Modify the system prompt that controls how future carousel text is generated. When the user says "change the prompt to X" or "update the instagram prompt to...", use update_instagram_prompt with the complete new prompt text.
4. EDIT THE SUBSTACK PROMPT — Modify the system prompt that controls Substack article generation
5. GIVE FEEDBACK — Provide creative suggestions without making changes

RESPONSE FORMAT — Always respond with valid JSON (no markdown fences):
{
  "message": "Your conversational response explaining what you did or suggesting",
  "actions": [...]
}

AVAILABLE ACTIONS (include in the actions array when making changes):

Edit a specific slide's overlay text (0-based index):
  {"type": "update_slide", "index": 0, "overlayText": "New text for slide 1"}
  {"type": "update_slide", "index": 1, "overlayText": "New text for slide 2"}

Edit the Instagram caption:
  {"type": "update_caption", "text": "Complete new caption text here"}

Edit the Instagram generation system prompt:
  {"type": "update_instagram_prompt", "text": "Complete new system prompt text"}

Edit the Substack generation system prompt:
  {"type": "update_substack_prompt", "text": "Complete new system prompt text"}

RULES:
- You CAN and SHOULD apply multiple actions at once (e.g. update several slides in one response)
- Slide indices are 0-based (Slide 1 = index 0, Slide 2 = index 1, etc.)
- For captions and prompts, always provide the COMPLETE replacement text
- Use an empty actions array [] only when giving pure feedback with no changes
- Return ONLY valid JSON — no markdown code fences, no extra text outside the JSON
- Be direct and concise in your message
- Preserve the user's creative intent and tone unless specifically asked to change it
- When editing slides, consider the flow across the entire carousel — each slide should work as part of a sequence
- When editing system prompts, explain what you changed and why`

// ────────────────────────────────────────────────────────────────────
// Client-side ZIP builder — no server roundtrip needed
// ────────────────────────────────────────────────────────────────────

const crc32Table = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function buildZipBlob(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder()
  const allChunks: ArrayBuffer[] = []
  const centralChunks: ArrayBuffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = enc.encode(file.name)
    const fileCrc = crc32(file.data)
    const dataLen = file.data.byteLength

    // Local file header — 30 bytes + file name
    const lhSize = 30 + nameBytes.length
    const lhBuf = new ArrayBuffer(lhSize)
    const lv = new DataView(lhBuf)
    lv.setUint32(0, 0x04034b50, true)   // signature
    lv.setUint16(4, 20, true)            // version needed to extract (2.0)
    lv.setUint16(6, 0, true)             // general purpose bit flag
    lv.setUint16(8, 0, true)             // compression method (0 = store)
    lv.setUint16(10, 0, true)            // last mod file time
    lv.setUint16(12, 0, true)            // last mod file date
    lv.setUint32(14, fileCrc, true)      // crc-32
    lv.setUint32(18, dataLen, true)      // compressed size
    lv.setUint32(22, dataLen, true)      // uncompressed size
    lv.setUint16(26, nameBytes.length, true) // file name length
    lv.setUint16(28, 0, true)            // extra field length
    new Uint8Array(lhBuf).set(nameBytes, 30)

    // Copy file data into its own ArrayBuffer
    const fdBuf = new ArrayBuffer(dataLen)
    new Uint8Array(fdBuf).set(file.data)
    allChunks.push(lhBuf, fdBuf)

    // Central directory entry — 46 bytes + file name
    const ceSize = 46 + nameBytes.length
    const ceBuf = new ArrayBuffer(ceSize)
    const cv = new DataView(ceBuf)
    cv.setUint32(0, 0x02014b50, true)    // signature
    cv.setUint16(4, 20, true)            // version made by
    cv.setUint16(6, 20, true)            // version needed to extract
    cv.setUint16(8, 0, true)             // general purpose bit flag
    cv.setUint16(10, 0, true)            // compression method (store)
    cv.setUint16(12, 0, true)            // last mod file time
    cv.setUint16(14, 0, true)            // last mod file date
    cv.setUint32(16, fileCrc, true)      // crc-32
    cv.setUint32(20, dataLen, true)      // compressed size
    cv.setUint32(24, dataLen, true)      // uncompressed size
    cv.setUint16(28, nameBytes.length, true) // file name length
    cv.setUint16(30, 0, true)            // extra field length
    cv.setUint16(32, 0, true)            // file comment length
    cv.setUint16(34, 0, true)            // disk number start
    cv.setUint16(36, 0, true)            // internal file attributes
    cv.setUint32(38, 0, true)            // external file attributes
    cv.setUint32(42, offset, true)       // offset of local header
    new Uint8Array(ceBuf).set(nameBytes, 46)
    centralChunks.push(ceBuf)

    offset += lhSize + dataLen
  }

  // End of central directory record — 22 bytes
  const centralDirSize = centralChunks.reduce((s, b) => s + b.byteLength, 0)
  const endBuf = new ArrayBuffer(22)
  const ev = new DataView(endBuf)
  ev.setUint32(0, 0x06054b50, true)      // signature
  ev.setUint16(4, 0, true)               // number of this disk
  ev.setUint16(6, 0, true)               // disk where central directory starts
  ev.setUint16(8, files.length, true)     // entries on this disk
  ev.setUint16(10, files.length, true)    // total entries
  ev.setUint32(12, centralDirSize, true)  // size of central directory
  ev.setUint32(16, offset, true)          // offset of central directory
  ev.setUint16(20, 0, true)              // comment length

  return new Blob([...allChunks, ...centralChunks, endBuf], { type: 'application/zip' })
}

/** Convert a canvas to PNG bytes.
 *  Tries three strategies in order:
 *    1. canvas.toBlob  →  Blob.arrayBuffer
 *    2. canvas.toBlob  →  FileReader  (older Safari fallback)
 *    3. canvas.toDataURL → base64 decode  (tainted-canvas / toBlob-bug fallback)
 *  A 15-second timeout guards against toBlob hanging. */
async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  // --- Strategy 1 & 2: toBlob with timeout ---
  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 15_000)          // 15 s timeout
      try {
        canvas.toBlob((b) => { clearTimeout(timer); resolve(b) }, 'image/png')
      } catch {
        clearTimeout(timer); resolve(null)                           // toBlob threw synchronously
      }
    })

    if (blob && blob.size > 0) {
      // Prefer Blob.arrayBuffer, fall back to FileReader
      if (typeof blob.arrayBuffer === 'function') {
        return new Uint8Array(await blob.arrayBuffer())
      }
      return await new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
        reader.onerror = () => reject(new Error('FileReader failed'))
        reader.readAsArrayBuffer(blob)
      })
    }
    // blob was null or empty → fall through
  } catch {
    // toBlob pipeline failed entirely → fall through
  }

  // --- Strategy 3: toDataURL → base64 decode ---
  try {
    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.split(',')[1]
    if (!base64) throw new Error('toDataURL returned empty data')
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    if (bytes.length === 0) throw new Error('Decoded PNG is 0 bytes')
    return bytes
  } catch (e) {
    throw new Error(`Canvas export failed: ${e instanceof Error ? e.message : 'unknown error'}. The canvas may be tainted by a cross-origin image.`)
  }
}

/** Trigger a browser download from a Blob. Tries <a download> click,
 *  then window.open as a fallback. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)

  // Strategy 1: invisible <a download> link
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.position = 'fixed'
  link.style.left = '-9999px'
  link.style.opacity = '0'
  document.body.appendChild(link)
  link.click()

  // Do NOT remove the link immediately — some browsers (Safari) need it in the DOM
  // while the download stream is being set up.
  setTimeout(() => {
    try { document.body.removeChild(link) } catch { /* already removed */ }
  }, 5_000)
  // Revoke the blob URL after a generous window
  setTimeout(() => { try { URL.revokeObjectURL(url) } catch { /* noop */ } }, 120_000)
}

// ────────────────────────────────────────────────────────────────────
// Substack Tool
// ────────────────────────────────────────────────────────────────────
// Postable — to-do list of subjects to post about (persisted)
// ────────────────────────────────────────────────────────────────────

interface PostableTask {
  id: string
  title: string
  notes: string
  postingIdea?: string
  status: 'active' | 'archived'
}

const POSTABLE_STORAGE_KEY = 'content-publisher-postable-tasks'

function PostableTool() {
  const [tasks, setTasks] = useState<PostableTask[]>([])
  const [useSupabase, setUseSupabase] = useState<boolean | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadLocal = () => {
      if (typeof window === 'undefined') return
      try {
        const saved = localStorage.getItem(POSTABLE_STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as PostableTask[]
          setTasks(Array.isArray(parsed) ? parsed : [])
        }
      } catch { /* ignore */ }
    }
    fetch('/api/postable/tasks')
      .then(r => r.json())
      .then(data => {
        if (data.source === 'supabase' && Array.isArray(data.tasks)) {
          setUseSupabase(true)
          setTasks(data.tasks.map((t: { id: string; title: string; notes: string; posting_idea?: string; status: string }) => ({
            id: t.id,
            title: t.title,
            notes: t.notes || '',
            postingIdea: t.posting_idea,
            status: t.status as 'active' | 'archived',
          })))
        } else {
          setUseSupabase(false)
          loadLocal()
        }
      })
      .catch(() => {
        setUseSupabase(false)
        loadLocal()
      })
  }, [])

  useEffect(() => {
    if (!useSupabase && typeof window !== 'undefined') {
      localStorage.setItem(POSTABLE_STORAGE_KEY, JSON.stringify(tasks))
    }
  }, [tasks, useSupabase])

  const handleAdd = useCallback(async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    if (useSupabase) {
      const res = await fetch('/api/postable/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed, notes: '' }),
      })
      const data = await res.json()
      if (res.ok && data.task) {
        setTasks(prev => [{ id: data.task.id, title: data.task.title, notes: data.task.notes || '', status: 'active' }, ...prev])
      }
    } else {
      setTasks(prev => [{ id: `local-${Date.now()}`, title: trimmed, notes: '', status: 'active' }, ...prev])
    }
    setInputValue('')
    inputRef.current?.focus()
  }, [inputValue, useSupabase])

  const handleComplete = useCallback(async (task: PostableTask) => {
    setEditingId(null)
    if (useSupabase) {
      const res = await fetch('/api/postable/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, status: 'archived' }) })
      if (res.ok) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'archived' as const } : t))
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'archived' as const } : t))
    }
  }, [useSupabase])

  const handleUpdate = useCallback(async (task: PostableTask, updates: { title?: string; notes?: string }) => {
    setEditingId(null)
    if (useSupabase) {
      const res = await fetch('/api/postable/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, ...updates }) })
      if (res.ok) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updates } : t))
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updates } : t))
    }
  }, [useSupabase])

  const handleRemove = useCallback((task: PostableTask) => {
    setTasks(prev => prev.filter(t => t.id !== task.id))
  }, [])

  const startEdit = useCallback((task: PostableTask) => {
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditNotes(task.notes)
  }, [])

  const saveEdit = useCallback((task: PostableTask) => {
    if (editTitle.trim()) handleUpdate(task, { title: editTitle.trim(), notes: editNotes.trim() })
    else setEditingId(null)
  }, [editTitle, editNotes, handleUpdate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }, [handleAdd])

  const activeTasks = tasks.filter(t => t.status === 'active')
  const archivedTasks = tasks.filter(t => t.status === 'archived')

  return (
    <div className="postable-tool" role="region" aria-label="Postable to-do list">
      <p className="postable-tool__intro">
        Add subjects to post about. Events from Upcoming appear here automatically. Check off when done.
      </p>
      <div className="postable-tool__add-row">
        <input
          ref={inputRef}
          type="text"
          className="postable-tool__input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. New workshop dates, process notes, exhibition reflection"
          aria-label="Add subject to post about"
          autoComplete="off"
        />
        <button type="button" className="postable-tool__add-btn" onClick={handleAdd} disabled={!inputValue.trim()} aria-label="Add subject">
          Add
        </button>
      </div>
      {activeTasks.length === 0 && archivedTasks.length === 0 ? (
        <div className="postable-tool__empty" role="status">
          <p className="postable-tool__empty-text">No tasks yet. Add one above or save an event in Upcoming.</p>
        </div>
      ) : (
        <>
          <ul className="postable-tool__list" role="list" aria-label="Active tasks">
            {activeTasks.map(task => (
              <li key={task.id} className="postable-tool__item">
                <button type="button" className="postable-tool__checkbox" onClick={() => handleComplete(task)} aria-label={`Complete ${task.title}`} title="Mark complete" />
                <div className="postable-tool__item-body">
                  {editingId === task.id ? (
                    <div className="postable-tool__edit-form">
                      <input type="text" className="postable-tool__edit-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={() => saveEdit(task)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(task) }} autoFocus />
                      <textarea className="postable-tool__edit-notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} onBlur={() => saveEdit(task)} placeholder="Notes..." rows={2} />
                    </div>
                  ) : (
                    <div className="postable-tool__item-content" onClick={() => startEdit(task)}>
                      <span className="postable-tool__item-text">{task.title}</span>
                      {task.postingIdea && <span className="postable-tool__item-idea">{task.postingIdea}</span>}
                      {task.notes && <span className="postable-tool__item-notes">{task.notes}</span>}
                    </div>
                  )}
                </div>
                <button type="button" className="postable-tool__remove-btn" onClick={() => handleRemove(task)} aria-label={`Remove ${task.title}`} title="Remove">×</button>
              </li>
            ))}
          </ul>
          {archivedTasks.length > 0 && (
            <div className="postable-tool__archived">
              <button type="button" className="postable-tool__archived-toggle" onClick={() => setArchivedOpen(prev => !prev)} aria-expanded={archivedOpen}>
                Archived ({archivedTasks.length})
              </button>
              {archivedOpen && (
                <ul className="postable-tool__list postable-tool__list--archived" role="list">
                  {archivedTasks.map(task => (
                    <li key={task.id} className="postable-tool__item postable-tool__item--archived">
                      <span className="postable-tool__item-check" aria-hidden>✓</span>
                      <div className="postable-tool__item-body">
                        <span className="postable-tool__item-text postable-tool__item-text--archived">{task.title}</span>
                        {task.notes && <span className="postable-tool__item-notes">{task.notes}</span>}
                      </div>
                      <button type="button" className="postable-tool__remove-btn" onClick={() => handleRemove(task)} aria-label={`Remove ${task.title}`}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

type SubstackSourceMode = 'paste' | 'gdoc'

function SubstackTool({ settings, onUpdateSettings, onResetSettings }: { settings: AISettings; onUpdateSettings: (p: Partial<AISettings>) => void; onResetSettings: () => void }) {
  const [sourceText, setSourceText] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('substack-sourceText') || ''
    return ''
  })
  const [draft, setDraft] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('substack-draft') || ''
    return ''
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [editInstruction, setEditInstruction] = useState('')
  const [error, setError] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('substack-conversationHistory')
        return saved ? JSON.parse(saved) : []
      } catch { return [] }
    }
    return []
  })

  // Source mode toggle
  const [sourceMode, setSourceMode] = useState<SubstackSourceMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('substack-sourceMode')
      return (saved === 'gdoc' ? 'gdoc' : 'paste') as SubstackSourceMode
    }
    return 'paste'
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

  useEffect(() => {
    fetch('/api/google/status').then(r => r.json()).then(d => setGoogleConnected(d.connected)).catch(() => setGoogleConnected(false))
  }, [])

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUrl = sessionStorage.getItem('substack-googleDocUrl')
      if (savedUrl) { setGoogleDocUrl(savedUrl); sessionStorage.removeItem('substack-googleDocUrl') }
    }
  }, [])

  const handleFetchDoc = useCallback(async () => {
    if (!googleDocUrl.trim()) { setDocFetchError('Please enter a Google Doc URL.'); return }
    setIsFetchingDoc(true); setDocFetchError('')
    try {
      const response = await fetch(`/api/docs/fetch?url=${encodeURIComponent(googleDocUrl.trim())}`)
      const data = await response.json()
      if (!response.ok) {
        if (data.needsAuth) {
          const authRes = await fetch('/api/google/auth?redirect=/gallery/content-publisher')
          const authData = await authRes.json()
          if (authData.url) { sessionStorage.setItem('substack-googleDocUrl', googleDocUrl); window.location.href = authData.url; return }
          setDocFetchError('Could not initiate Google connection.'); return
        }
        throw new Error(data.error || 'Failed to fetch document')
      }
      setSourceText(data.content); setDocFetchError(''); setGoogleDocUrl('')
    } catch (err) { setDocFetchError(err instanceof Error ? err.message : 'Failed to fetch Google Doc') }
    finally { setIsFetchingDoc(false) }
  }, [googleDocUrl])

  const handleConnectGoogle = useCallback(async () => {
    try {
      const response = await fetch('/api/google/auth?redirect=/gallery/content-publisher')
      const data = await response.json()
      if (data.url) { if (googleDocUrl.trim()) sessionStorage.setItem('substack-googleDocUrl', googleDocUrl); window.location.href = data.url }
      else setDocFetchError('Could not initiate Google connection.')
    } catch { setDocFetchError('Failed to start Google connection.') }
  }, [googleDocUrl])

  useEffect(() => { sessionStorage.setItem('substack-sourceText', sourceText) }, [sourceText])
  useEffect(() => { sessionStorage.setItem('substack-draft', draft) }, [draft])
  useEffect(() => { sessionStorage.setItem('substack-conversationHistory', JSON.stringify(conversationHistory)) }, [conversationHistory])
  useEffect(() => { sessionStorage.setItem('substack-sourceMode', sourceMode) }, [sourceMode])

  const handleGenerate = useCallback(async () => {
    if (!sourceText.trim()) { setError('Please enter source text before generating a draft.'); return }
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null }
    const currentGenerationId = ++generationIdRef.current
    isGeneratingRef.current = true; setIsGenerating(true); setError(''); setDraft(''); setCopySuccess(false); setGeneratedImage(null)
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    let accumulatedText = ''

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.model,
          systemPrompt: settings.substackPrompt,
          userContent: `Please transform the following source text into a polished Substack draft:\n\n${sourceText}`,
        }),
        signal: abortController.signal,
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `API error (${response.status})`)
      }
      await parseSSEStream(response, (text) => {
        if (generationIdRef.current !== currentGenerationId) return
        accumulatedText += text; setDraft(accumulatedText)
      }, abortController.signal)

      if (generationIdRef.current === currentGenerationId) {
        setConversationHistory([
          { role: 'user', content: `Please transform the following source text into a polished Substack draft:\n\n${sourceText}` },
          { role: 'assistant', content: accumulatedText },
        ])
        const titleMatch = accumulatedText.match(/^#\s*(.+?)(?:\n|$)/m)
        const title = titleMatch ? titleMatch[1].trim() : ''
        const bodyStart = accumulatedText.replace(/^#.*\n(\*[^*]+\*)?\n*/s, '').slice(0, 120).replace(/\n/g, ' ')
        const imagePrompt = title
          ? `Editorial illustration for a Substack newsletter article titled "${title}". ${bodyStart || 'Thoughtful, atmospheric, suitable for a literary or creative newsletter.'}`
          : `Editorial illustration for a Substack newsletter. ${bodyStart || 'Thoughtful, atmospheric, suitable for a literary or creative newsletter.'}`
        setIsGeneratingImage(true)
        try {
          const imgRes = await fetch('/api/images/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: imagePrompt }),
          })
          const imgData = await imgRes.json()
          if (imgRes.ok && imgData.imageDataUrl && generationIdRef.current === currentGenerationId) {
            setGeneratedImage(imgData.imageDataUrl)
          }
        } catch {
          /* non-fatal */
        } finally {
          if (generationIdRef.current === currentGenerationId) setIsGeneratingImage(false)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (generationIdRef.current === currentGenerationId) setError(err instanceof Error ? err.message : 'Failed to generate draft')
    } finally {
      if (generationIdRef.current === currentGenerationId) { isGeneratingRef.current = false; setIsGenerating(false); abortControllerRef.current = null }
    }
  }, [sourceText, settings.model, settings.substackPrompt])

  const handleEdit = useCallback(async () => {
    if (!editInstruction.trim() || !draft.trim()) return
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null }
    const currentGenerationId = ++generationIdRef.current
    isGeneratingRef.current = true; setIsGenerating(true); setError(''); setCopySuccess(false)
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    let accumulatedText = ''
    const editMessage = `Here is the current draft:\n\n${draft}\n\nPlease make the following edit: ${editInstruction}`
    const messages: Message[] = [...conversationHistory, { role: 'user', content: editMessage }]

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.model, systemPrompt: settings.substackPrompt, messages }),
        signal: abortController.signal,
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `API error (${response.status})`)
      }
      setDraft('')
      await parseSSEStream(response, (text) => {
        if (generationIdRef.current !== currentGenerationId) return
        accumulatedText += text; setDraft(accumulatedText)
      }, abortController.signal)
      if (generationIdRef.current === currentGenerationId) {
        setConversationHistory([...messages, { role: 'assistant', content: accumulatedText }])
        setEditInstruction('')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (generationIdRef.current === currentGenerationId) setError(err instanceof Error ? err.message : 'Failed to update draft')
    } finally {
      if (generationIdRef.current === currentGenerationId) { isGeneratingRef.current = false; setIsGenerating(false); abortControllerRef.current = null }
      }
  }, [editInstruction, draft, conversationHistory, settings.model, settings.substackPrompt])

  const handleCopy = useCallback(async () => {
    if (!draft.trim()) return
    try { await navigator.clipboard.writeText(draft); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000) }
    catch {
      const ta = document.createElement('textarea'); ta.value = draft; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000)
    }
  }, [draft])

  const handleDownloadImage = useCallback(() => {
    if (!generatedImage) return
    const link = document.createElement('a')
    link.href = generatedImage
    link.download = 'substack-image.png'
    link.click()
  }, [generatedImage])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isGenerating) { e.preventDefault(); handleEdit() }
  }, [handleEdit, isGenerating])

  return (
    <div className="substack-tool">
      <p className="tool-description">Generate Substack drafts from your source text.</p>

      <TabSettingsInline
        settings={settings}
        onUpdate={onUpdateSettings}
        onReset={onResetSettings}
        promptLabel="Substack system prompt"
        promptValue={settings.substackPrompt}
        onPromptChange={(v) => onUpdateSettings({ substackPrompt: v })}
      />

      {/* Source mode toggle */}
      <div className="source-mode-section">
        <label className="ig-label">Source</label>
        <div className="source-mode-toggle">
          <button
            className={`source-mode-toggle__btn ${sourceMode === 'paste' ? 'source-mode-toggle__btn--active' : ''}`}
            onClick={() => setSourceMode('paste')}
          >
            Paste text
          </button>
          <button
            className={`source-mode-toggle__btn ${sourceMode === 'gdoc' ? 'source-mode-toggle__btn--active' : ''}`}
            onClick={() => setSourceMode('gdoc')}
          >
            Google Doc
          </button>
        </div>
      </div>

      {/* Google Doc link input */}
      {sourceMode === 'gdoc' && (
        <div className="gdoc-section">
          <label htmlFor="gdoc-url" className="ig-label">Google Doc link</label>
          <div className="gdoc-input-row">
            <input id="gdoc-url" type="url" className="gdoc-input" placeholder="https://docs.google.com/document/d/..." value={googleDocUrl}
              onChange={(e) => { setGoogleDocUrl(e.target.value); if (docFetchError) setDocFetchError('') }} disabled={isFetchingDoc} aria-label="Google Doc URL" />
            {googleConnected ? (
              <button className="gdoc-fetch-btn" onClick={handleFetchDoc} disabled={isFetchingDoc || !googleDocUrl.trim()}>
                {isFetchingDoc ? 'Fetching...' : 'Fetch'}
              </button>
            ) : (
              <button className="gdoc-connect-btn" onClick={handleConnectGoogle} disabled={googleConnected === null}>Connect Google</button>
            )}
          </div>
          {docFetchError && <div className="gdoc-error" role="alert">{docFetchError}</div>}
          {googleConnected === false && <p className="gdoc-hint">Connect Google to fetch documents from Google Docs.</p>}
        </div>
      )}

      {/* Source text — paste mode uses Instagram-style form group */}
      <div className="ig-form-group">
        <label htmlFor="source-text" className="ig-label">
          {sourceMode === 'gdoc' ? 'Fetched text' : 'Source text'}
        </label>
        <textarea id="source-text" className="ig-textarea"
          placeholder={sourceMode === 'gdoc'
            ? 'Fetched content will appear here. You can also edit it directly...'
            : 'Paste your source text here — essay, workshop description, talk summary, art write-up...'}
          value={sourceText} onChange={(e) => { setSourceText(e.target.value); if (error) setError('') }}
          rows={sourceMode === 'paste' ? 8 : 5} />
        <button className="generate-btn" onClick={handleGenerate}>
          {isGenerating && !draft ? 'Generating...' : isGenerating ? 'Regenerate draft' : 'Generate draft'}
        </button>
      </div>

      {error && <div className="substack-error" role="alert">{error}</div>}

      {(draft || isGenerating) && (
        <div className="substack-output-section">
          <div className="output-header">
            <label htmlFor="draft-output" className="input-label">Draft</label>
            <div className="output-actions">
              {isGenerating && <span className="streaming-indicator">Streaming...</span>}
              {isGeneratingImage && <span className="streaming-indicator">Generating image...</span>}
              <button className="copy-btn" onClick={handleCopy} disabled={!draft.trim() || isGenerating}>
                {copySuccess ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
          </div>
          <textarea id="draft-output" ref={draftRef} className="draft-textarea" value={draft}
            onChange={(e) => setDraft(e.target.value)} rows={16} disabled={isGenerating} />
          {(generatedImage || isGeneratingImage) && (
            <div className="substack-image-section">
              <label className="input-label">Generated image</label>
              {generatedImage ? (
                <>
                  <img src={generatedImage} alt="Generated illustration for Substack post" className="substack-generated-image" />
                  <button type="button" className="copy-btn" style={{ marginTop: '0.5rem' }} onClick={handleDownloadImage}>
                    Download image
                  </button>
                </>
              ) : (
                <div className="substack-image-placeholder">Generating...</div>
              )}
            </div>
          )}
          {draft && !isGenerating && (
            <div className="edit-section">
              <label htmlFor="edit-instruction" className="input-label">Edit instruction</label>
              <div className="edit-input-row">
                <input id="edit-instruction" type="text" className="edit-input"
                  placeholder="e.g., make the intro punchier, add more subheadings, shorten it..."
                  value={editInstruction} onChange={(e) => setEditInstruction(e.target.value)}
                  onKeyDown={handleEditKeyDown} disabled={isGenerating} />
                <button className="edit-btn" onClick={handleEdit} disabled={isGenerating || !editInstruction.trim()}>Edit</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Carousel Chat — AI assistant panel
// ────────────────────────────────────────────────────────────────────

function CarouselChat({
  slides, caption, instagramPrompt, substackPrompt, selectedFont, model,
  onUpdateSlide, onUpdateCaption, onUpdateInstagramPrompt, onUpdateSubstackPrompt, onClose,
}: {
  slides: SlideData[]
  caption: string
  instagramPrompt: string
  substackPrompt: string
  selectedFont: string
  model: string
  onUpdateSlide: (index: number, overlayText: string) => void
  onUpdateCaption: (text: string) => void
  onUpdateInstagramPrompt: (text: string) => void
  onUpdateSubstackPrompt: (text: string) => void
  onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300)
    return () => clearTimeout(timer)
  }, [])

  const buildContext = useCallback(() => {
    const slideTexts = slides.length > 0
      ? slides.map((s, i) => {
          const type = s.imageUrl ? 'photo' : `blank (${s.bgColor || '#000'})`
          return `  Slide ${i + 1} [index ${i}]: overlay="${s.overlayText || '(empty)'}" | type=${type}`
        }).join('\n')
      : '  (no slides uploaded yet)'
    return [
      'CURRENT CAROUSEL STATE:',
      `Font: ${selectedFont}`,
      `Slides (${slides.length}):`,
      slideTexts,
      `Caption: "${caption || '(none yet)'}"`,
      `Instagram system prompt: "${instagramPrompt}"`,
      `Substack system prompt: "${substackPrompt}"`,
    ].join('\n')
  }, [slides, caption, instagramPrompt, substackPrompt, selectedFont])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isThinking) return

    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    try {
      const context = buildContext()
      // Build conversation history for context (limit to last 10 messages)
      const recentMessages = [...messages, userMsg].slice(-10)
      const chatMessages = recentMessages.map(m => ({
        role: m.role as string,
        content: m.role === 'user' ? m.content : JSON.stringify({ message: m.content, actions: m.actions || [] }),
      }))
      // Inject current state into the latest user message
      chatMessages[chatMessages.length - 1] = {
        role: 'user',
        content: `${context}\n\nUser request: ${text}`,
      }

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, systemPrompt: CHAT_SYSTEM_PROMPT, messages: chatMessages }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errData.error || `API error: ${response.status}`)
      }

      let fullText = ''
      const reader = response.body?.getReader()
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

      const { message, actions } = parseChatResponse(fullText)

      // Apply actions
      for (const action of actions) {
        if (action.type === 'update_slide' && action.index !== undefined && action.overlayText !== undefined) {
          if (action.index >= 0 && action.index < slides.length) onUpdateSlide(action.index, action.overlayText)
        } else if (action.type === 'update_caption' && action.text) {
          onUpdateCaption(action.text)
        } else if (action.type === 'update_instagram_prompt' && action.text) {
          onUpdateInstagramPrompt(action.text)
        } else if (action.type === 'update_substack_prompt' && action.text) {
          onUpdateSubstackPrompt(action.text)
        }
      }

      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: message,
        actions: actions.length > 0 ? actions : undefined,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      }])
    } finally {
      setIsThinking(false)
    }
  }, [input, isThinking, messages, slides, caption, instagramPrompt, substackPrompt, selectedFont, model, buildContext, onUpdateSlide, onUpdateCaption, onUpdateInstagramPrompt, onUpdateSubstackPrompt])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  const formatActionSummary = (actions: ChatAction[]) => {
    const parts: string[] = []
    const slideUpdates = actions.filter(a => a.type === 'update_slide')
    if (slideUpdates.length > 0) parts.push(`Updated slide${slideUpdates.length > 1 ? 's' : ''} ${slideUpdates.map(a => (a.index ?? 0) + 1).join(', ')}`)
    if (actions.some(a => a.type === 'update_caption')) parts.push('Updated caption')
    if (actions.some(a => a.type === 'update_instagram_prompt')) parts.push('Updated Instagram prompt')
    if (actions.some(a => a.type === 'update_substack_prompt')) parts.push('Updated Substack prompt')
    return parts.join(' · ')
  }

  const welcomeText = slides.length === 0
    ? 'Upload photos and add source text to get started. I can help refine your content once you generate a carousel.'
    : slides.some(s => s.overlayText)
      ? 'I can edit your slides, rewrite the caption, and adjust both system prompts. Just tell me what to change.'
      : 'Generate your carousel first, then I can edit the slide text, caption, and system prompts.'

  return (
    <div className="chat-panel__inner">
      <div className="chat-panel__header">
        <h3 className="chat-panel__title">Carousel Assistant</h3>
        <button className="chat-panel__close" onClick={onClose} aria-label="Close assistant">✕</button>
      </div>

      <div className="chat-panel__body">
        {messages.length === 0 && !isThinking && (
          <div className="chat-panel__welcome">
            <p className="chat-panel__welcome-text">{welcomeText}</p>
          </div>
        )}

        <div className="chat-messages">
          {messages.map(msg => (
            <div key={msg.id} className={`chat-message chat-message--${msg.role}`}>
              <div className="chat-message__text">{msg.content}</div>
              {msg.actions && msg.actions.length > 0 && (
                <div className="chat-message__actions-applied">
                  {formatActionSummary(msg.actions)}
                </div>
              )}
            </div>
          ))}
          {isThinking && (
            <div className="chat-message chat-message--assistant">
              <div className="chat-thinking">
                <span className="chat-thinking__dot" />
                <span className="chat-thinking__dot" />
                <span className="chat-thinking__dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your carousel..."
          rows={2}
          disabled={isThinking}
          aria-label="Chat message"
        />
        <button className="chat-send-btn" onClick={handleSend} disabled={isThinking || !input.trim()} aria-label="Send message">
          →
        </button>
      </div>
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
  boxX: number
  boxY: number
  boxWidth: number
  boxHeight: number
  fontSize: number
  bgColor: string
}

const OVERLAY_FONTS = [
  { label: 'Diatype', value: 'Diatype' },
  { label: 'Standard', value: 'Standard' },
  { label: 'Terminal Grotesque', value: 'Terminal Grotesque' },
  { label: 'Times Condensed', value: 'Times Condensed' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia' },
]

function InstagramTool({ settings, onUpdateSettings, onResetSettings, onUpdateInstagramPrompt, onUpdateSubstackPrompt }: { settings: AISettings; onUpdateSettings: (p: Partial<AISettings>) => void; onResetSettings: () => void; onUpdateInstagramPrompt: (prompt: string) => void; onUpdateSubstackPrompt: (prompt: string) => void }) {
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
  const [slideBgColor, setSlideBgColor] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('content-publisher-slideBgColor')
      if (saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) return saved
    }
    return '#000000'
  })
  const [favoriteColors, setFavoriteColors] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('content-publisher-favoriteColors')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        }
      } catch { /* ignore */ }
    }
    return ['#64DD17', '#000000', '#FFFFFF', '#FF6B6B', '#4ECDC4']
  })
  const [chatOpen, setChatOpen] = useState(false)
  const [fontChanged, setFontChanged] = useState(false)
  const prevFontRef = useRef(selectedFont)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const isGeneratingRef = useRef(false)

  // Google Doc fetch state
  const [googleDocUrl, setGoogleDocUrl] = useState('')
  const [isFetchingDoc, setIsFetchingDoc] = useState(false)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [docFetchError, setDocFetchError] = useState('')

  useEffect(() => {
    fetch('/api/google/status').then(r => r.json()).then(d => setGoogleConnected(d.connected)).catch(() => setGoogleConnected(false))
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('google_connected') === 'true') { setGoogleConnected(true); window.history.replaceState({}, '', window.location.pathname) }
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('ig-googleDocUrl')
      if (saved) { setGoogleDocUrl(saved); sessionStorage.removeItem('ig-googleDocUrl') }
    }
  }, [])

  const handleFetchDoc = useCallback(async () => {
    if (!googleDocUrl.trim()) { setDocFetchError('Please enter a Google Doc URL.'); return }
    setIsFetchingDoc(true); setDocFetchError('')
    try {
      const response = await fetch(`/api/docs/fetch?url=${encodeURIComponent(googleDocUrl.trim())}`)
      const data = await response.json()
      if (!response.ok) {
        if (data.needsAuth) {
          const authRes = await fetch('/api/google/auth?redirect=/gallery/content-publisher')
          const authData = await authRes.json()
          if (authData.url) { sessionStorage.setItem('ig-googleDocUrl', googleDocUrl); window.location.href = authData.url; return }
          setDocFetchError('Could not initiate Google connection.'); return
        }
        throw new Error(data.error || 'Failed to fetch document')
      }
      setSourceText(data.content); setDocFetchError(''); setGoogleDocUrl('')
    } catch (err) { setDocFetchError(err instanceof Error ? err.message : 'Failed to fetch Google Doc') }
    finally { setIsFetchingDoc(false) }
  }, [googleDocUrl])

  const handleConnectGoogle = useCallback(async () => {
    try {
      const response = await fetch('/api/google/auth?redirect=/gallery/content-publisher')
      const data = await response.json()
      if (data.url) { if (googleDocUrl.trim()) sessionStorage.setItem('ig-googleDocUrl', googleDocUrl); window.location.href = data.url }
      else setDocFetchError('Could not initiate Google connection.')
    } catch { setDocFetchError('Failed to start Google connection.') }
  }, [googleDocUrl])

  // Font change indicator
  useEffect(() => {
    if (prevFontRef.current !== selectedFont) {
      setFontChanged(true)
      const timer = setTimeout(() => setFontChanged(false), 800)
      prevFontRef.current = selectedFont
      return () => clearTimeout(timer)
    }
  }, [selectedFont])

  // Chat callback — update slide overlay by index
  const handleChatUpdateSlide = useCallback((index: number, overlayText: string) => {
    setSlides(prev => prev.map((s, i) => i === index ? { ...s, overlayText } : s))
  }, [])

  // Persist slideBgColor to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('content-publisher-slideBgColor', slideBgColor)
  }, [slideBgColor])

  // Persist favorite colors to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('content-publisher-favoriteColors', JSON.stringify(favoriteColors))
  }, [favoriteColors])

  // Sync global background color to all slides
  useEffect(() => {
    setSlides(prev => {
      if (prev.length === 0) return prev
      const needsUpdate = prev.some(s => s.bgColor !== slideBgColor)
      return needsUpdate ? prev.map(s => ({ ...s, bgColor: slideBgColor })) : prev
    })
  }, [slideBgColor])

  const handleAddColorToFavorites = useCallback(() => {
    const normalized = slideBgColor.toUpperCase()
    setFavoriteColors(prev => prev.includes(normalized) ? prev : [...prev, normalized])
  }, [slideBgColor])

  // Drag-and-drop reorder state
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const generateId = () => `slide-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  const handleAddBlankSlide = useCallback(() => {
    setSlides(prev => [...prev, {
      id: generateId(), imageUrl: '', imageName: 'Blank slide',
      overlayText: '', boxX: 10, boxY: 60, boxWidth: 80, boxHeight: 30, fontSize: 18, bgColor: slideBgColor,
    }])
  }, [slideBgColor])

  // Drag-and-drop handlers for slide reordering
  const handleSlideDragStart = useCallback((e: React.DragEvent, slideId: string) => {
    e.dataTransfer.setData('text/plain', slideId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedSlideId(slideId)
  }, [])

  const handleSlideDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleSlideDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('text/plain')
    if (!sourceId) return
    setSlides(prev => {
      const sourceIndex = prev.findIndex(s => s.id === sourceId)
      if (sourceIndex === -1 || sourceIndex === targetIndex) return prev
      const newSlides = [...prev]
      const [moved] = newSlides.splice(sourceIndex, 1)
      newSlides.splice(targetIndex, 0, moved)
      return newSlides
    })
    setDraggedSlideId(null)
    setDragOverIndex(null)
  }, [])

  const handleSlideDragEnd = useCallback(() => {
    setDraggedSlideId(null)
    setDragOverIndex(null)
  }, [])

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const imageFiles = fileArray.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) { setError('Please upload image files (JPG, PNG, etc.)'); return }
    const newSlides: SlideData[] = imageFiles.map(file => ({
      id: generateId(), imageUrl: URL.createObjectURL(file), imageName: file.name,
      overlayText: '', boxX: 10, boxY: 60, boxWidth: 80, boxHeight: 30, fontSize: 18, bgColor: slideBgColor,
    }))
    setSlides(prev => [...prev, ...newSlides]); setError('')
  }, [slideBgColor])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dropZoneRef.current?.classList.add('drop-zone--active') }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dropZoneRef.current?.classList.remove('drop-zone--active') }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); dropZoneRef.current?.classList.remove('drop-zone--active')
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleGenerate = async () => {
    if (slides.length === 0) { setError('Please upload at least one photo first.'); return }
    if (!sourceText.trim()) { setError('Please enter source text for the carousel.'); return }
    if (isGeneratingRef.current) return
    isGeneratingRef.current = true; setIsGenerating(true); setError(''); setStreamingText(''); setCaption('')

    // Build the prompt dynamically — inject slide count
    const igPrompt = settings.instagramPrompt.includes('${slides.length}')
      ? settings.instagramPrompt.replace(/\$\{slides\.length\}/g, String(slides.length))
      : `${settings.instagramPrompt}\nThe "slides" array must have exactly ${slides.length} items.`

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.model,
          systemPrompt: igPrompt,
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
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullText += parsed.delta.text; setStreamingText(fullText)
              }
            } catch { /* skip */ }
          }
        }
      }
      const jsonMatch = fullText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0])
          if (result.slides && Array.isArray(result.slides)) {
            setSlides(prev => prev.map((slide, i) => ({ ...slide, overlayText: result.slides[i]?.overlayText || slide.overlayText })))
          }
          if (result.caption) setCaption(result.caption)
        } catch { setError('Could not parse carousel data from response. Please try again.') }
      } else { setError('Could not parse carousel data from response. Please try again.') }
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to generate carousel') }
    finally { isGeneratingRef.current = false; setIsGenerating(false); setStreamingText('') }
  }

  const updateSlide = useCallback((slideId: string, updates: Partial<SlideData>) => {
    setSlides(prev => prev.map(s => s.id === slideId ? { ...s, ...updates } : s))
  }, [])

  const handleRemoveSlide = (slideId: string) => setSlides(prev => prev.filter(s => s.id !== slideId))

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
    try { await navigator.clipboard.writeText(caption); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000) }
    catch {
      const ta = document.createElement('textarea'); ta.value = caption; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const handleExport = async () => {
    if (slides.length === 0) { setError('No slides to export.'); return }
    setIsExporting(true); setError('')

    try {
      // ── Step 1: Wait for document fonts (custom fonts need to be ready for canvas) ──
      if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]) }
        catch { /* proceed even if font API fails */ }
      }

      // ── Step 2: Render each slide to PNG bytes ──
      const pngFiles: { name: string; data: Uint8Array }[] = []

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i]
        console.log(`[export] rendering slide ${i + 1}/${slides.length}`)

        const canvas = document.createElement('canvas')
        canvas.width = 1080; canvas.height = 1350
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas 2D context not available in this browser')

        // NaN-safe helpers – all slide dimensions default to sane values
        const safeNum = (v: unknown, fallback: number) => {
          const n = Number(v); return Number.isFinite(n) ? n : fallback
        }
        const boxX   = safeNum(slide.boxX, 10)
        const boxY   = safeNum(slide.boxY, 60)
        const boxW   = safeNum(slide.boxWidth, 80)
        const boxH   = safeNum(slide.boxHeight, 30)
        const fSize  = safeNum(slide.fontSize, 18)

        // Background
        ctx.fillStyle = slide.bgColor || '#000000'
        ctx.fillRect(0, 0, 1080, 1350)

        // Draw photo (skip for blank slides)
        if (slide.imageUrl) {
          try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image()
              image.onload = () => resolve(image)
              image.onerror = () => reject(new Error(`Image load failed for slide ${i + 1}`))
              // ONLY set crossOrigin for remote http(s) URLs.
              // blob: and data: URLs are same-origin; adding crossOrigin taints the canvas.
              if (/^https?:\/\//.test(slide.imageUrl)) image.crossOrigin = 'anonymous'
              image.src = slide.imageUrl
            })
            const imgAspect = img.naturalWidth / img.naturalHeight
            const canvasAspect = 1080 / 1350
            let dw: number, dh: number, dx: number, dy: number
            if (imgAspect > canvasAspect) { dh = 1350; dw = 1350 * imgAspect; dx = (1080 - dw) / 2; dy = 0 }
            else { dw = 1080; dh = 1080 / imgAspect; dx = 0; dy = (1350 - dh) / 2 }
            ctx.drawImage(img, dx, dy, dw, dh)
          } catch (imgErr) {
            console.warn(`[export] slide ${i + 1} image skipped:`, imgErr)
            // Continue — export the slide with just the background colour
          }
        }

        // Draw overlay text
        if (slide.overlayText) {
          const bx = (boxX / 100) * 1080; const by = (boxY / 100) * 1350
          const bw = (boxW / 100) * 1080; const bh = (boxH / 100) * 1350
          ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, bw, bh)
          const fontFamily = selectedFont === 'Times Condensed'
            ? '"Times New Roman", Times, serif'
            : `${selectedFont}, sans-serif`
          const exportFontSize = fSize * (1080 / 272)
          ctx.font = `${exportFontSize}px ${fontFamily}`
          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          const maxTextWidth = bw * 0.9; const words = slide.overlayText.split(' ')
          const lines: string[] = []; let curLine = ''
          for (const word of words) {
            const test = curLine ? `${curLine} ${word}` : word
            if (ctx.measureText(test).width > maxTextWidth && curLine) { lines.push(curLine); curLine = word }
            else curLine = test
          }
          if (curLine) lines.push(curLine)
          const lineH = exportFontSize * 1.3; const th = lines.length * lineH
          const startY = by + (bh - th) / 2; const cx = bx + bw / 2
          if (selectedFont === 'Times Condensed') {
            ctx.save(); ctx.translate(cx, 0); ctx.scale(0.8, 1)
            lines.forEach((line, li) => ctx.fillText(line, 0, startY + li * lineH + lineH / 2))
            ctx.restore()
          } else {
            lines.forEach((line, li) => ctx.fillText(line, cx, startY + li * lineH + lineH / 2))
          }
        }

        // Canvas → PNG bytes (with multi-strategy fallback)
        console.log(`[export] converting slide ${i + 1} to PNG`)
        const pngData = await canvasToPngBytes(canvas)
        console.log(`[export] slide ${i + 1} PNG size: ${pngData.byteLength} bytes`)
        if (pngData.byteLength < 100) {
          console.warn(`[export] slide ${i + 1} PNG suspiciously small (${pngData.byteLength}B)`)
        }
        pngFiles.push({ name: `slide-${i + 1}.png`, data: pngData })
      }

      // ── Step 3: Build ZIP ──
      console.log('[export] building ZIP from', pngFiles.length, 'files')
      let zipBlob: Blob

      // Strategy A: client-side ZIP
      try {
        zipBlob = buildZipBlob(pngFiles)
        console.log('[export] client ZIP size:', zipBlob.size)
        if (zipBlob.size < 22) throw new Error('ZIP blob too small — likely empty')
      } catch (zipErr) {
        console.warn('[export] client-side ZIP failed, trying server fallback:', zipErr)
        // Strategy B: fall back to server-side ZIP builder via /api/carousel/export
        const slidePayloads = pngFiles.map(f => {
          let b64 = ''
          const chunk = 8192
          for (let off = 0; off < f.data.length; off += chunk) {
            b64 += String.fromCharCode(...Array.from(f.data.subarray(off, off + chunk)))
          }
          return { imageData: btoa(b64), filename: f.name }
        })
        const serverRes = await fetch('/api/carousel/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slides: slidePayloads }),
        })
        if (!serverRes.ok) throw new Error(`Server ZIP failed (${serverRes.status})`)
        zipBlob = await serverRes.blob()
        console.log('[export] server ZIP size:', zipBlob.size)
      }

      // ── Step 4: Trigger download ──
      console.log('[export] triggering download')
      downloadBlob(zipBlob, 'carousel-export.zip')
      console.log('[export] download triggered successfully')
    } catch (err) {
      console.error('[export] FAILED:', err)
      setError(err instanceof Error ? err.message : 'Export failed — check browser console for details')
    } finally {
      setIsExporting(false)
    }
  }

  const handleCaptionEdit = async () => {
    if (!captionEditInstruction.trim() || !caption) return
    setIsGenerating(true); setError('')
    try {
      const response = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.model,
          systemPrompt: 'You are an Instagram caption editor. You will receive the current caption and an edit instruction. Return ONLY the updated caption text. No JSON, no explanations.',
          userContent: `Current caption:\n${caption}\n\nEdit instruction: ${captionEditInstruction}`,
        }),
      })
      if (!response.ok) throw new Error('Failed to edit caption')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')
      const decoder = new TextDecoder(); let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try { const p = JSON.parse(data); if (p.type === 'content_block_delta' && p.delta?.text) fullText += p.delta.text } catch { /* skip */ }
          }
        }
      }
      if (fullText.trim()) { setCaption(fullText.trim()); setCaptionEditInstruction('') }
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to edit caption') }
    finally { setIsGenerating(false) }
  }

  return (
    <div className="instagram-layout">
      <div className="instagram-main">
      <div className="instagram-tool">
      <TabSettingsInline
        settings={settings}
        onUpdate={onUpdateSettings}
        onReset={onResetSettings}
        promptLabel="Instagram system prompt"
        promptValue={settings.instagramPrompt}
        onPromptChange={(v) => onUpdateSettings({ instagramPrompt: v })}
      />

      <p className="tool-description">Create Instagram carousel slides from photos and text.</p>

      {/* Fixed FAB — 44px touch target per UX/UI Pro */}
      <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open carousel assistant" title="Carousel assistant">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 2h16v12H6l-4 4V2z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {/* Photo Upload */}
      <div ref={dropZoneRef} className="drop-zone" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0}
        aria-label="Upload photos" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}>
        <div className="drop-zone__content">
          <span className="drop-zone__icon">+</span>
          <span className="drop-zone__text">
            {slides.length === 0 ? 'Drop photos here or click to upload (multiple allowed)' : `${slides.length} photo${slides.length > 1 ? 's' : ''} uploaded — drop or click to add more`}
          </span>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="drop-zone__input"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }} />
      </div>

      {/* Google Doc */}
      <div className="gdoc-section">
        <label htmlFor="ig-gdoc-url" className="ig-label">Google Doc link (optional source text)</label>
        <div className="gdoc-input-row">
          <input id="ig-gdoc-url" type="url" className="gdoc-input" placeholder="https://docs.google.com/document/d/..."
            value={googleDocUrl} onChange={(e) => { setGoogleDocUrl(e.target.value); if (docFetchError) setDocFetchError('') }} disabled={isFetchingDoc} />
          {googleConnected ? (
            <button className="gdoc-fetch-btn" onClick={handleFetchDoc} disabled={isFetchingDoc || !googleDocUrl.trim()}>{isFetchingDoc ? 'Fetching...' : 'Fetch'}</button>
          ) : (
            <button className="gdoc-connect-btn" onClick={handleConnectGoogle} disabled={googleConnected === null}>Connect Google</button>
          )}
        </div>
        {docFetchError && <div className="gdoc-error" role="alert">{docFetchError}</div>}
      </div>

      {/* Source Text */}
      <div className="ig-form-group">
        <label htmlFor="ig-source-text" className="ig-label">Source text</label>
        <textarea id="ig-source-text" className="ig-textarea" placeholder="Paste your long-form source text here, or fetch from Google Docs above..."
          value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={5} />
      </div>

      {/* Font Selector + Global Background Color */}
      <div className="ig-form-group ig-form-row ig-form-row--controls">
        <label htmlFor="ig-font" className="ig-label">Overlay font</label>
        <select id="ig-font" className="ig-select" value={selectedFont} onChange={(e) => setSelectedFont(e.target.value)}>
          {OVERLAY_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <div className="ig-color-control">
          <label htmlFor="ig-bg-color" className="ig-label ig-label--color">Background</label>
          <div className="ig-color-row">
            <input id="ig-bg-color" type="color" value={slideBgColor} onChange={(e) => setSlideBgColor(e.target.value)}
              className="ig-color-input" title="Background color for all slides" />
            <div className="ig-color-swatches">
              {favoriteColors.map(c => (
                <button key={c} type="button" className="ig-color-swatch" style={{ backgroundColor: c }}
                  onClick={() => setSlideBgColor(c)} title={`Use ${c}`} aria-label={`Use color ${c}`} />
              ))}
              <button type="button" className="ig-color-swatch ig-color-swatch--add" onClick={handleAddColorToFavorites}
                title="Add current color to favorites" aria-label="Add current color to favorites">+</button>
            </div>
          </div>
        </div>
      </div>

      {/* Generate */}
      <button className="ig-button ig-button--primary" onClick={handleGenerate} disabled={isGenerating || slides.length === 0 || !sourceText.trim()}>
        {isGenerating ? 'Generating...' : 'Generate carousel'}
      </button>

      {isGenerating && streamingText && (
        <div className="ig-streaming">
          <p className="ig-streaming__label">Generating content...</p>
          <pre className="ig-streaming__text">{streamingText}</pre>
        </div>
      )}

      {error && <div className="ig-error" role="alert">{error}</div>}

      {/* Carousel Preview */}
      {slides.length > 0 && (
        <div className="carousel-section">
          <h2 className="carousel-section__title">Carousel Preview</h2>
          <p className="carousel-section__hint">Drag slides by the number to reorder. Drag the white text box to reposition. Click text to edit.</p>
          <div className="carousel-strip">
            {slides.map((slide, index) => (
              <InteractiveSlide key={slide.id} slide={slide} index={index} totalSlides={slides.length} selectedFont={selectedFont}
                onUpdate={(u) => updateSlide(slide.id, u)} onRemove={() => handleRemoveSlide(slide.id)}
                onMoveLeft={() => handleMoveSlide(slide.id, 'left')} onMoveRight={() => handleMoveSlide(slide.id, 'right')}
                isDraggedOver={dragOverIndex === index} isDragging={draggedSlideId === slide.id}
                onSlideDragStart={(e) => handleSlideDragStart(e, slide.id)}
                onSlideDragOver={(e) => handleSlideDragOver(e, index)}
                onSlideDrop={(e) => handleSlideDrop(e, index)}
                onSlideDragEnd={handleSlideDragEnd} />
            ))}
            <div className="carousel-slide carousel-slide--add" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0}
              aria-label="Add another photo" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}>
              <span className="carousel-slide__add-icon">+</span>
              <span className="carousel-slide__add-text">Add photo</span>
            </div>
            <div className="carousel-slide carousel-slide--add-blank">
              <button className="add-blank__btn" onClick={() => handleAddBlankSlide()} aria-label="Add blank slide">
                <span className="carousel-slide__add-icon">+</span>
                <span className="carousel-slide__add-text">Blank slide</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Caption */}
      {caption && (
        <div className={`caption-section ${fontChanged ? 'caption-section--font-changed' : ''}`}>
          <div className="caption-section__header-row">
            <h2 className="caption-section__title">Instagram Caption</h2>
            <span className="caption-section__font-badge" key={selectedFont}>{selectedFont}</span>
          </div>
          <textarea className="caption-section__text" value={caption} onChange={(e) => setCaption(e.target.value)} rows={6} aria-label="Instagram caption" style={{ fontFamily: getFontFamily(selectedFont) }} />
          <div className="caption-section__edit-row">
            <input type="text" className="caption-section__edit-input" placeholder='Edit caption ("shorter", "add hashtags", etc.)' value={captionEditInstruction}
              onChange={(e) => setCaptionEditInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCaptionEdit() }} />
            <button className="ig-button" onClick={handleCaptionEdit} disabled={isGenerating || !captionEditInstruction.trim()}>Edit</button>
          </div>
          <button className="ig-button ig-button--copy" onClick={handleCopyCaption}>{copySuccess ? 'Copied!' : 'Copy caption'}</button>
        </div>
      )}

      {/* Export */}
      {slides.length > 0 && slides.some(s => s.overlayText) && (
        <div className="export-section">
          <button className="ig-button ig-button--primary ig-button--export" onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'Exporting...' : 'Export as ZIP'}
          </button>
        </div>
      )}
    </div>
      </div>

      {/* Chat sidebar — inline right panel on desktop, full screen on mobile */}
      {chatOpen && (
        <aside className="chat-panel chat-panel--open" role="dialog" aria-label="Carousel assistant">
          <CarouselChat
            slides={slides}
            caption={caption}
            instagramPrompt={settings.instagramPrompt}
            substackPrompt={settings.substackPrompt}
            selectedFont={selectedFont}
            model={settings.model}
            onUpdateSlide={handleChatUpdateSlide}
            onUpdateCaption={setCaption}
            onUpdateInstagramPrompt={onUpdateInstagramPrompt}
            onUpdateSubstackPrompt={onUpdateSubstackPrompt}
            onClose={() => setChatOpen(false)}
          />
        </aside>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Interactive Slide — draggable/resizable white text box
// ────────────────────────────────────────────────────────────────────

function InteractiveSlide({
  slide, index, totalSlides, selectedFont, onUpdate, onRemove, onMoveLeft, onMoveRight,
  isDraggedOver, isDragging: isSlideDragging,
  onSlideDragStart, onSlideDragOver, onSlideDrop, onSlideDragEnd,
}: {
  slide: SlideData; index: number; totalSlides: number; selectedFont: string
  onUpdate: (updates: Partial<SlideData>) => void; onRemove: () => void; onMoveLeft: () => void; onMoveRight: () => void
  isDraggedOver: boolean; isDragging: boolean
  onSlideDragStart: (e: React.DragEvent) => void; onSlideDragOver: (e: React.DragEvent) => void
  onSlideDrop: (e: React.DragEvent) => void; onSlideDragEnd: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(slide.overlayText)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, boxX: 0, boxY: 0 })
  const resizeStartRef = useRef({ x: 0, y: 0, boxW: 0, boxH: 0, boxX: 0, boxY: 0, edge: '' })

  useEffect(() => { setEditText(slide.overlayText) }, [slide.overlayText])

  const PW = 272, PH = 340

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); e.stopPropagation()
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragStartRef.current = { x: cx, y: cy, boxX: slide.boxX, boxY: slide.boxY }
    setIsDragging(true)
  }, [slide.boxX, slide.boxY])

  useEffect(() => {
    if (!isDragging) return
    const move = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY
      const newX = Math.max(0, Math.min(100 - slide.boxWidth, dragStartRef.current.boxX + ((cx - dragStartRef.current.x) / PW) * 100))
      const newY = Math.max(0, Math.min(100 - slide.boxHeight, dragStartRef.current.boxY + ((cy - dragStartRef.current.y) / PH) * 100))
      onUpdate({ boxX: newX, boxY: newY })
    }
    const up = () => setIsDragging(false)
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up) }
  }, [isDragging, slide.boxWidth, slide.boxHeight, onUpdate])

  const handleResizeStart = useCallback((edge: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); e.stopPropagation()
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY
    resizeStartRef.current = { x: cx, y: cy, boxW: slide.boxWidth, boxH: slide.boxHeight, boxX: slide.boxX, boxY: slide.boxY, edge }
    setIsResizing(true)
  }, [slide.boxWidth, slide.boxHeight, slide.boxX, slide.boxY])

  useEffect(() => {
    if (!isResizing) return
    const move = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY
      const { x, y, boxW, boxH, boxX, boxY, edge } = resizeStartRef.current
      const dx = ((cx - x) / PW) * 100; const dy = ((cy - y) / PH) * 100
      const updates: Partial<SlideData> = {}; const min = 15
      if (edge.includes('right')) updates.boxWidth = Math.max(min, Math.min(100 - boxX, boxW + dx))
      if (edge.includes('bottom')) updates.boxHeight = Math.max(min, Math.min(100 - boxY, boxH + dy))
      if (edge.includes('left')) { const nw = Math.max(min, boxW - dx); const nx = boxX + boxW - nw; if (nx >= 0) { updates.boxWidth = nw; updates.boxX = nx } }
      if (edge.includes('top')) { const nh = Math.max(min, boxH - dy); const ny = boxY + boxH - nh; if (ny >= 0) { updates.boxHeight = nh; updates.boxY = ny } }
      onUpdate(updates)
    }
    const up = () => setIsResizing(false)
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up) }
  }, [isResizing, onUpdate])

  const fontStyle: React.CSSProperties = selectedFont === 'Times Condensed'
    ? { fontFamily: '"Times New Roman", Times, serif', transform: 'scaleX(0.8)', transformOrigin: 'center' }
    : { fontFamily: `${selectedFont}, sans-serif` }

  return (
    <div
      className={`carousel-slide ${isSlideDragging ? 'carousel-slide--dragging' : ''} ${isDraggedOver && !isSlideDragging ? 'carousel-slide--drag-over' : ''}`}
      draggable
      onDragStart={onSlideDragStart}
      onDragOver={onSlideDragOver}
      onDrop={onSlideDrop}
      onDragEnd={onSlideDragEnd}
    >
      <div className="carousel-slide__number" title="Drag to reorder">⠿ {index + 1}/{totalSlides}</div>
      <div className="slide-preview" style={{ width: PW, height: PH, position: 'relative', overflow: 'hidden', background: slide.bgColor || '#000' }} draggable={false}>
        {slide.imageUrl && (
          <img src={slide.imageUrl} alt={`Slide ${index + 1}`} className="slide-preview__img" draggable={false} />
        )}
        {!slide.imageUrl && (
          <div className="slide-preview__blank-label">Blank</div>
        )}
        {(slide.overlayText || isEditing) && (
          <div className={`text-box ${isDragging ? 'text-box--dragging' : ''}`}
            style={{ left: `${slide.boxX}%`, top: `${slide.boxY}%`, width: `${slide.boxWidth}%`, height: `${slide.boxHeight}%` }}
            onMouseDown={handleDragStart} onTouchStart={handleDragStart}>
            <div className="text-box__handle text-box__handle--tl" onMouseDown={(e) => handleResizeStart('top-left', e)} onTouchStart={(e) => handleResizeStart('top-left', e)} />
            <div className="text-box__handle text-box__handle--tr" onMouseDown={(e) => handleResizeStart('top-right', e)} onTouchStart={(e) => handleResizeStart('top-right', e)} />
            <div className="text-box__handle text-box__handle--bl" onMouseDown={(e) => handleResizeStart('bottom-left', e)} onTouchStart={(e) => handleResizeStart('bottom-left', e)} />
            <div className="text-box__handle text-box__handle--br" onMouseDown={(e) => handleResizeStart('bottom-right', e)} onTouchStart={(e) => handleResizeStart('bottom-right', e)} />
            <div className="text-box__content" style={{ fontSize: `${slide.fontSize}px`, ...fontStyle }}
              onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}>
              {slide.overlayText || 'Click to add text'}
            </div>
          </div>
        )}
        {!slide.overlayText && !isEditing && (
          <div className="slide-preview__add-text" onClick={() => setIsEditing(true)}>Click to add overlay text</div>
        )}
      </div>

      <div className="carousel-slide__controls">
        <button className="carousel-slide__btn" onClick={onMoveLeft} disabled={index === 0} title="Move left">←</button>
        <button className="carousel-slide__btn" onClick={() => onUpdate({ fontSize: Math.max(8, slide.fontSize - 1) })} title="Decrease text size">A−</button>
        <button className="carousel-slide__btn" onClick={() => onUpdate({ fontSize: Math.min(48, slide.fontSize + 1) })} title="Increase text size">A+</button>
        <button className="carousel-slide__btn" onClick={onMoveRight} disabled={index === totalSlides - 1} title="Move right">→</button>
        <button className="carousel-slide__btn carousel-slide__btn--remove" onClick={onRemove} title="Remove slide">×</button>
      </div>

      {isEditing && (
        <div className="carousel-slide__editor">
          <textarea className="carousel-slide__editor-input" value={editText} onChange={(e) => setEditText(e.target.value)}
            placeholder="Enter overlay text..." rows={3} autoFocus aria-label={`Overlay text for slide ${index + 1}`} />
          <div className="carousel-slide__editor-actions">
            <button className="ig-button" onClick={() => { onUpdate({ overlayText: editText }); setIsEditing(false) }}>Save</button>
            <button className="ig-button" onClick={() => setIsEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
