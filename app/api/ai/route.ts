import { NextRequest, NextResponse } from 'next/server'

/**
 * Unified AI endpoint — routes to Anthropic (Claude) or OpenAI (GPT)
 * based on the `model` parameter in the request body.
 *
 * Supported models:
 *   Claude:  claude-sonnet-4-5-20250929, claude-haiku-3-5-20241022
 *   OpenAI:  gpt-4o, gpt-4o-mini
 */

function isOpenAIModel(model: string): boolean {
  return model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')
}

async function handleAnthropic(
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const status = response.status
    if (status === 429) {
      return NextResponse.json({ error: 'Rate limited — try again in a moment' }, { status: 429 })
    }
    const body = await response.text().catch(() => '')
    return NextResponse.json({ error: `Anthropic API error (${status}): ${body.slice(0, 200)}` }, { status })
  }

  if (!response.body) {
    return NextResponse.json({ error: 'No response stream from Anthropic' }, { status: 500 })
  }

  return new NextResponse(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

async function handleOpenAI(
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  // OpenAI expects system message as a message in the array
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages: openaiMessages,
    }),
  })

  if (!response.ok) {
    const status = response.status
    if (status === 429) {
      return NextResponse.json({ error: 'Rate limited — try again in a moment' }, { status: 429 })
    }
    const body = await response.text().catch(() => '')
    return NextResponse.json({ error: `OpenAI API error (${status}): ${body.slice(0, 200)}` }, { status })
  }

  if (!response.body) {
    return NextResponse.json({ error: 'No response stream from OpenAI' }, { status: 500 })
  }

  // OpenAI SSE format is different from Anthropic — we need to transform it
  // so the client sees a consistent format. We'll transform OpenAI's
  // `choices[0].delta.content` into Anthropic's `content_block_delta` format.
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                continue
              }
              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content
                if (content) {
                  // Re-encode in Anthropic's content_block_delta format
                  const event = {
                    type: 'content_block_delta',
                    delta: { text: content },
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        }
      } catch {
        // Stream ended or errored
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      model = 'claude-sonnet-4-5-20250929',
      systemPrompt = 'You are a helpful assistant.',
      userContent,
      messages: customMessages,
    } = body

    if (!userContent && (!customMessages || customMessages.length === 0)) {
      return NextResponse.json({ error: 'User content is required' }, { status: 400 })
    }

    const messages = customMessages && customMessages.length > 0
      ? customMessages
      : [{ role: 'user', content: userContent }]

    if (isOpenAIModel(model)) {
      return handleOpenAI(model, systemPrompt, messages)
    } else {
      return handleAnthropic(model, systemPrompt, messages)
    }
  } catch {
    return NextResponse.json(
      { error: 'Failed to process request. Please try again.' },
      { status: 500 }
    )
  }
}
