import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Claude API not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { systemPrompt, userContent, messages: customMessages } = body

    if (!userContent && (!customMessages || customMessages.length === 0)) {
      return NextResponse.json(
        { error: 'User content is required' },
        { status: 400 }
      )
    }

    // Support both simple userContent and full messages array for iterative editing
    const messages = customMessages && customMessages.length > 0
      ? customMessages
      : [{ role: 'user', content: userContent }]

    // Proxy to Anthropic API with streaming via SSE
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        stream: true,
        system: systemPrompt || 'You are a helpful assistant.',
        messages,
      }),
    })

    if (!response.ok) {
      const status = response.status
      if (status === 429) {
        return NextResponse.json(
          { error: 'Try again in a moment' },
          { status: 429 }
        )
      }
      return NextResponse.json(
        { error: 'Claude API error' },
        { status: status }
      )
    }

    // Stream SSE response back to client
    const stream = response.body
    if (!stream) {
      return NextResponse.json(
        { error: 'No response stream' },
        { status: 500 }
      )
    }

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to process request. Please try again.' },
      { status: 500 }
    )
  }
}
