// deno-lint-ignore-file no-explicit-any
/**
 * Composio Gmail wrapper for Edge Functions.
 *
 * Wraps the actions area_picker (network branch) needs:
 *   - listThreads(query) for inbox scanning
 *   - getThread(threadId) for reply context
 *   - listDrafts() for floor-of-5 audit
 *   - createDraft(spec) for outreach + replies
 *
 * Env required:
 *   COMPOSIO_API_KEY - from https://app.composio.dev/settings/api-keys
 *   COMPOSIO_USER_ID - the connected-account user id (madihalim@gmail.com's)
 *
 * If COMPOSIO_API_KEY is unset, methods return null/empty so callers can
 * gracefully degrade. Network routine will surface the setup gap in its footer
 * notes instead of crashing.
 */

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";

export type GmailThread = {
  id: string;
  snippet: string | null;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  internal_date: string | null;
  last_message_date: string | null;
  message_id: string | null;
  has_my_reply: boolean;
  url: string;
};

export type GmailDraft = {
  id: string;
  recipient_email: string | null;
  subject: string | null;
  snippet: string | null;
  thread_id: string | null;
  url: string;
};

export type DraftSpec = {
  to: string;
  subject: string;
  body: string;
  thread_id?: string; // when replying within a thread
  in_reply_to_message_id?: string;
};

export type CreatedDraft = {
  id: string;
  thread_id: string | null;
  url: string;
};

export class ComposioGmail {
  apiKey: string;
  userId: string;
  enabled: boolean;

  constructor(opts: { apiKey?: string; userId?: string }) {
    this.apiKey = opts.apiKey ?? Deno.env.get("COMPOSIO_API_KEY") ?? "";
    this.userId = opts.userId ?? Deno.env.get("COMPOSIO_USER_ID") ?? "default";
    this.enabled = !!this.apiKey;
  }

  async listThreads(query: string, maxResults = 20): Promise<GmailThread[]> {
    if (!this.enabled) return [];
    const data = await this.execute("GMAIL_LIST_THREADS", {
      query,
      max_results: maxResults,
    });
    const raw = data?.threads ?? data?.data?.threads ?? [];
    return raw.map((t: any) => this.normalizeThread(t));
  }

  async getThread(threadId: string): Promise<GmailThread | null> {
    if (!this.enabled) return null;
    const data = await this.execute("GMAIL_GET_THREAD", {
      thread_id: threadId,
    });
    const t = data?.thread ?? data?.data ?? data;
    if (!t) return null;
    return this.normalizeThread(t);
  }

  async listDrafts(maxResults = 50): Promise<GmailDraft[]> {
    if (!this.enabled) return [];
    const data = await this.execute("GMAIL_LIST_DRAFTS", {
      max_results: maxResults,
    });
    const raw = data?.drafts ?? data?.data?.drafts ?? [];
    return raw.map((d: any) => ({
      id: d.id ?? d.draft_id ?? "",
      recipient_email: d.to ?? d.recipient_email ?? null,
      subject: d.subject ?? null,
      snippet: d.snippet ?? null,
      thread_id: d.thread_id ?? null,
      url: d.id
        ? `https://mail.google.com/mail/u/0/#drafts?compose=${d.id}`
        : "https://mail.google.com/mail/u/0/#drafts",
    }));
  }

  async createDraft(spec: DraftSpec): Promise<CreatedDraft | null> {
    if (!this.enabled) return null;
    const action = spec.thread_id
      ? "GMAIL_REPLY_TO_THREAD"
      : "GMAIL_CREATE_EMAIL_DRAFT";
    const args: Record<string, unknown> = {
      to: spec.to,
      subject: spec.subject,
      body: spec.body,
    };
    if (spec.thread_id) args.thread_id = spec.thread_id;
    if (spec.in_reply_to_message_id)
      args.in_reply_to = spec.in_reply_to_message_id;

    const data = await this.execute(action, args);
    const id = data?.draft_id ?? data?.id ?? data?.data?.draft?.id;
    const thread_id =
      data?.thread_id ?? data?.data?.thread_id ?? spec.thread_id ?? null;
    if (!id) return null;
    return {
      id,
      thread_id,
      url: `https://mail.google.com/mail/u/0/#drafts?compose=${id}`,
    };
  }

  private async execute(
    action: string,
    args: Record<string, unknown>,
  ): Promise<any> {
    let resp: Response;
    try {
      resp = await fetch(`${COMPOSIO_BASE}/tools/execute/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({ user_id: this.userId, arguments: args }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      console.warn(`[composio] ${action} threw or timed out:`, e);
      return null;
    }
    if (!resp.ok) {
      console.warn(
        `[composio] ${action} failed: ${resp.status} ${resp.statusText}`,
      );
      return null;
    }
    return await resp.json();
  }

  private normalizeThread(t: any): GmailThread {
    const headers = t.headers ?? t.last_message?.headers ?? {};
    const fromRaw = headers.from ?? t.from ?? "";
    const { name, email } = parseFromHeader(String(fromRaw));
    return {
      id: t.id ?? t.thread_id ?? "",
      snippet: t.snippet ?? null,
      subject: t.subject ?? headers.subject ?? null,
      from_email: email,
      from_name: name,
      internal_date: t.internal_date ?? null,
      last_message_date: t.last_message_date ?? null,
      message_id: t.last_message?.id ?? t.message_id ?? null,
      has_my_reply: !!t.has_my_reply,
      url: t.id
        ? `https://mail.google.com/mail/u/0/#inbox/${t.id}`
        : "https://mail.google.com/mail/u/0/#inbox",
    };
  }
}

function parseFromHeader(raw: string): {
  name: string | null;
  email: string | null;
} {
  if (!raw) return { name: null, email: null };
  const m = raw.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (m)
    return { name: m[1]!.trim() || null, email: m[2]!.trim().toLowerCase() };
  if (raw.includes("@")) return { name: null, email: raw.trim().toLowerCase() };
  return { name: raw.trim() || null, email: null };
}

/** Heuristic: looks like a hand-typed inbound (not marketing/automation). */
export function looksHandTyped(t: GmailThread): boolean {
  if (!t.from_email) return false;
  const email = t.from_email.toLowerCase();
  const subject = (t.subject ?? "").toLowerCase();
  const PATTERNS = [
    /^noreply@/,
    /^no-reply@/,
    /^donotreply@/,
    /^do-not-reply@/,
    /^notifications?@/,
    /^updates@/,
    /^newsletter@/,
    /^marketing@/,
    /^hello@.+\.(com|io|co)$/,
    /^team@.+\.(com|io|co)$/,
    /^info@.+\.(com|io|co)$/,
  ];
  if (PATTERNS.some((re) => re.test(email))) return false;
  if (subject.includes("unsubscribe")) return false;
  if (subject.startsWith("your receipt") || subject.startsWith("receipt for"))
    return false;
  if (subject.includes("verification code") || subject.includes("confirm your"))
    return false;
  return true;
}
