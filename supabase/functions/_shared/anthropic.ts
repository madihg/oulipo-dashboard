/**
 * Minimal Anthropic Messages API wrapper for Deno Edge Functions.
 * We avoid the official SDK to keep the cold-start fast and the dep
 * surface zero. Supports prompt caching via `cache_control` blocks.
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

export type CacheControl = { type: "ephemeral" };
export type TextBlock = {
  type: "text";
  text: string;
  cache_control?: CacheControl;
};
export type Message = {
  role: "user" | "assistant";
  content: string | TextBlock[];
};

export type Tool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export type CallOpts = {
  apiKey: string;
  model?: string;
  system?: string | TextBlock[];
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  tools?: Tool[];
  toolHandlers?: Record<string, ToolHandler>;
  maxToolIterations?: number;
};

export async function callClaude(opts: CallOpts): Promise<{
  text: string;
  raw: unknown;
  usage?: { input_tokens: number; output_tokens: number };
  toolsUsed: string[];
}> {
  const messages: Message[] = [...opts.messages];
  const toolsUsed: string[] = [];
  const maxIters = opts.maxToolIterations ?? 4;
  let lastResp: any = null;

  for (let iter = 0; iter <= maxIters; iter++) {
    const body: Record<string, unknown> = {
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0,
      messages,
    };
    if (opts.system) body.system = opts.system;
    if (opts.tools?.length) body.tools = opts.tools;

    const resp = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`anthropic ${resp.status}: ${text}`);
    }
    const data = (await resp.json()) as {
      content: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      stop_reason?: string;
      usage?: { input_tokens: number; output_tokens: number };
    };
    lastResp = data;

    // If the model wants tools, dispatch + loop. Otherwise return.
    if (data.stop_reason !== "tool_use" || !opts.toolHandlers) {
      const text = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      return { text, raw: data, usage: data.usage, toolsUsed };
    }

    // Tool-use turn: append assistant content + dispatch each tool call
    messages.push({ role: "assistant", content: data.content as TextBlock[] });
    const toolResults: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];
    for (const block of data.content) {
      if (block.type !== "tool_use") continue;
      const name = block.name!;
      toolsUsed.push(name);
      const handler = opts.toolHandlers[name];
      if (!handler) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id!,
          content: JSON.stringify({ error: `no handler for tool ${name}` }),
          is_error: true,
        });
        continue;
      }
      try {
        const result = await handler(block.input ?? {});
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id!,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      } catch (e) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id!,
          content: JSON.stringify({ error: String(e) }),
          is_error: true,
        });
      }
    }
    messages.push({
      role: "user",
      content: toolResults as unknown as TextBlock[],
    });
  }

  // Hit max iterations - return whatever text we have
  const text = (lastResp?.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text ?? "")
    .join("");
  return { text, raw: lastResp, usage: lastResp?.usage, toolsUsed };
}

// search_memory tool definition that callers can include in opts.tools
export const SEARCH_MEMORY_TOOL: Tool = {
  name: "search_memory",
  description:
    "Search the user's memory entries (rules, style guides, references) for relevant context. Use this when you need to look up a specific rule, style guide, or reference that isn't in your bundled context. Returns top matches with title and snippet.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "what to search for" },
      scope: {
        type: "array",
        items: { type: "string" },
        description:
          "optional scope filter, e.g. ['global','area:network']. Omit for all scopes.",
      },
      kinds: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "user_rule",
            "project_rule",
            "feedback",
            "reference",
            "style_guide",
          ],
        },
        description: "optional kind filter",
      },
      limit: {
        type: "number",
        description: "max results, default 5",
      },
    },
    required: ["query"],
  },
};

// Helper to build the search_memory handler bound to the calling user
export function makeSearchMemoryHandler(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): ToolHandler {
  return async (input) => {
    const resp = await fetch(`${supabaseUrl}/functions/v1/search_memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, user_id: userId }),
    });
    if (!resp.ok) {
      return { error: `search_memory ${resp.status}: ${await resp.text()}` };
    }
    return await resp.json();
  };
}

/**
 * Extract a JSON object from a Claude response that may include prose / fences.
 */
export function extractJson<T>(text: string): T | null {
  // Try direct parse first.
  try {
    return JSON.parse(text) as T;
  } catch {
    /* fall through */
  }
  // Try fenced block
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) {
    try {
      return JSON.parse(fence[1]!.trim()) as T;
    } catch {
      /* fall through */
    }
  }
  // Last attempt: find first { ... } that parses
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
  return null;
}
