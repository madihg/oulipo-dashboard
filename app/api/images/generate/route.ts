import { NextRequest, NextResponse } from 'next/server'

/**
 * Generate an image using OpenAI DALL-E 3.
 * Accepts a text prompt and returns the image as base64 or URL.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { prompt } = body as { prompt?: string }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt.trim(),
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
        quality: 'standard',
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      const message = (errData as { error?: { message?: string } })?.error?.message || response.statusText
      return NextResponse.json({ error: `OpenAI: ${message}` }, { status: response.status })
    }

    const data = (await response.json()) as { data?: Array<{ b64_json?: string }> }
    const b64 = data.data?.[0]?.b64_json
    if (!b64) {
      return NextResponse.json({ error: 'No image data in response' }, { status: 500 })
    }

    return NextResponse.json({ imageDataUrl: `data:image/png;base64,${b64}` })
  } catch (err) {
    console.error('Image generation error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
