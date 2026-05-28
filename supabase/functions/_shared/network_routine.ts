// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callClaude, type TextBlock } from "./anthropic.ts";
import { ComposioGmail, looksHandTyped, type GmailThread } from "./composio.ts";

/**
 * Network routine post-pick logic, factored out of area_picker.
 *
 * Runs AFTER the Sonnet picker has selected today's picks. Adds:
 *   1. Inbox reply scanning (known contacts + warm signals)
 *   2. Reply drafting via Claude with the email voice guide
 *   3. Gmail draft creation via Composio, floor-of-5 enforced
 *   4. Goal computation against area_goals
 *   5. Briefing assembly into the NetworkBriefing shape persisted on picker_runs.summary
 *
 * Keep the NetworkBriefing types here in sync with src/types/briefing.ts.
 */

const FLOOR_TARGET = 5;

// Mirrored from src/types/briefing.ts. Keep in sync.
type Priority = "P0" | "P1" | "P2";
type GoalSnapshot = {
  name: string;
  total_sent: number;
  total_target: number;
  subtally: Record<string, { sent: number; target: number }>;
  deadline: string | null;
  days_left: number | null;
};
type DraftPick = {
  id: string;
  contact_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  recipient_channel: "gmail" | "instagram" | "linkedin" | "imessage" | "other";
  category: string;
  priority: Priority;
  hook: string;
  why_today: string;
  subject: string | null;
  body: string;
  gmail_draft_id: string | null;
  gmail_draft_url: string | null;
};
type InboxReply = {
  id: string;
  thread_id: string;
  sender_name: string | null;
  sender_email: string;
  subject: string | null;
  snippet: string;
  drafted_body: string;
  confidence: "known" | "warm" | "starred";
  contact_id: string | null;
  gmail_draft_id: string | null;
  gmail_draft_url: string | null;
};
type NewContact = {
  thread_id: string;
  sender_name: string | null;
  sender_email: string;
  proposed_category: string;
  proposed_tier: number;
  context: string;
};
type NetworkBriefing = {
  generated_at: string;
  area_slug: string;
  goal: GoalSnapshot | null;
  todays_picks: DraftPick[];
  inbox_replies: { known: InboxReply[]; warm: InboxReply[] };
  new_from_inbox: NewContact[];
  maintenance_due: any[];
  recently_sent: any[];
  carried_over: any[];
  footer: {
    gmail_floor: { current: number; target: number; topped_up_today: number };
    last_run: string;
    source: "scheduled" | "manual";
    notes?: string[];
  };
};

export type RunNetworkRoutineOpts = {
  supabaseUrl: string;
  serviceRoleKey: string;
  anthropicApiKey: string;
  areaId: string;
  userId: string;
  pickerRunId: string;
  source: "scheduled" | "manual";
  /** Sonnet picks already created as todos. We map them into DraftPick shape. */
  sonnetPicks: Array<{
    todo_id: string;
    title: string;
    notes: string;
    priority: Priority | null;
    source_id: string | null;
  }>;
  /** Email voice style guide preloaded from search_memory. */
  emailVoice: string | null;
};

export async function runNetworkRoutine(
  opts: RunNetworkRoutineOpts,
): Promise<NetworkBriefing> {
  const admin = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    db: { schema: "hmart" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const gmail = new ComposioGmail({});
  const notes: string[] = [];
  if (!gmail.enabled) {
    notes.push(
      "COMPOSIO_API_KEY unset: skipped inbox scan and Gmail draft creation.",
    );
  }

  // 1. Pull contacts (for known-sender match + draft enrichment).
  // Trimmed payload - the routine only needs the routing/identity columns,
  // not the heavy jsonb fields like drive_refs or freeform notes.
  const { data: contactsRaw } = await admin
    .from("network_contacts")
    .select(
      "id, user_id, name, email, category, tier, status, hook, vault_section, last_touch_at, last_thread_summary, social",
    )
    .eq("user_id", opts.userId);
  const contacts = (contactsRaw ?? []) as any[];
  const contactByEmail = new Map<string, any>();
  for (const c of contacts) {
    if (c.email) contactByEmail.set(String(c.email).toLowerCase(), c);
  }

  // 2. Map Sonnet picks into DraftPick shape (enriched with contact context)
  const todays_picks: DraftPick[] = opts.sonnetPicks.map((p) => {
    const contact = p.source_id
      ? contacts.find((c) => c.id === p.source_id)
      : null;
    const parsed = parsePickNotes(p.notes);
    const channel = inferChannel(
      contact?.email,
      contact?.social,
      parsed.suggestedChannel,
    );
    return {
      id: p.todo_id,
      contact_id: contact?.id ?? null,
      recipient_name: contact?.name ?? p.title,
      recipient_email: contact?.email ?? null,
      recipient_channel: channel,
      category: contact?.category ?? "other",
      priority: (p.priority ?? "P2") as Priority,
      hook: parsed.hook ?? contact?.hook ?? "",
      why_today: parsed.whyToday ?? p.title,
      subject: parsed.subject,
      body: parsed.body ?? p.notes,
      gmail_draft_id: null,
      gmail_draft_url: null,
    };
  });

  // 3. Inbox scan for reply candidates
  const replyCandidates = await scanInboxReplies(
    gmail,
    contactByEmail,
    contacts,
  );

  // 4. Draft all replies via Claude in PARALLEL (was serial - was the
  // single biggest bottleneck, ~10s for 5 candidates).
  const inbox_replies = { known: [] as InboxReply[], warm: [] as InboxReply[] };
  const draftedReplies = await Promise.all(
    replyCandidates.map(async (cand) => {
      const body = await draftReply(
        opts.anthropicApiKey,
        opts.emailVoice,
        cand,
      );
      if (!body) return null;
      const reply: InboxReply = {
        id: crypto.randomUUID(),
        thread_id: cand.thread.id,
        sender_name: cand.thread.from_name,
        sender_email: cand.thread.from_email ?? "",
        subject: cand.thread.subject,
        snippet: cand.thread.snippet ?? "",
        drafted_body: body,
        confidence: cand.confidence,
        contact_id: cand.contactId ?? null,
        gmail_draft_id: null,
        gmail_draft_url: null,
      };
      return { reply, candidate: cand };
    }),
  );
  for (const r of draftedReplies) {
    if (!r) continue;
    if (r.reply.confidence === "known") inbox_replies.known.push(r.reply);
    else inbox_replies.warm.push(r.reply);
  }

  const allReplies = [...inbox_replies.known, ...inbox_replies.warm];

  // 5. Create Gmail reply drafts in PARALLEL (was serial).
  if (gmail.enabled) {
    await Promise.all(
      allReplies
        .filter((r) => r.sender_email)
        .map(async (r) => {
          const draft = await gmail.createDraft({
            to: r.sender_email,
            subject: r.subject
              ? `Re: ${r.subject.replace(/^Re:\s*/i, "")}`
              : "Re:",
            body: r.drafted_body,
            thread_id: r.thread_id,
          });
          if (draft) {
            r.gmail_draft_id = draft.id;
            r.gmail_draft_url = draft.url;
          }
        }),
    );
  }

  // Single-batch upsert of all inbox_reply_drafts rows.
  if (allReplies.length) {
    const rows = allReplies.map((r) => ({
      user_id: opts.userId,
      gmail_thread_id: r.thread_id,
      gmail_message_id:
        replyCandidates.find((c) => c.thread.id === r.thread_id)?.thread
          .message_id ?? r.thread_id,
      sender_email: r.sender_email,
      sender_name: r.sender_name,
      subject: r.subject,
      snippet: r.snippet,
      drafted_body: r.drafted_body,
      confidence: r.confidence,
      contact_id: r.contact_id,
      status: r.gmail_draft_id ? "drafted_in_gmail" : "pending",
      gmail_draft_id: r.gmail_draft_id,
      gmail_draft_url: r.gmail_draft_url,
      picker_run_id: opts.pickerRunId,
    }));
    await admin
      .from("inbox_reply_drafts")
      .upsert(rows as never, { onConflict: "user_id,gmail_thread_id" });
  }

  // 6. Create Gmail drafts for today's picks in PARALLEL (was serial).
  let toppedUp = 0;
  if (gmail.enabled) {
    const gmailPicks = todays_picks.filter(
      (p) => p.recipient_email && p.recipient_channel === "gmail",
    );
    const created = await Promise.all(
      gmailPicks.map((pick) =>
        gmail.createDraft({
          to: pick.recipient_email!,
          subject: pick.subject ?? "quick note from halim",
          body: pick.body,
        }),
      ),
    );
    for (let i = 0; i < gmailPicks.length; i++) {
      const draft = created[i];
      if (draft) {
        gmailPicks[i]!.gmail_draft_id = draft.id;
        gmailPicks[i]!.gmail_draft_url = draft.url;
        toppedUp++;
      }
    }
  }

  // 7. Floor-of-5 audit
  const existingDrafts = gmail.enabled ? await gmail.listDrafts(100) : [];
  const networkRelated = existingDrafts.filter((d) =>
    isNetworkRelatedDraft(d.recipient_email, contactByEmail, todays_picks),
  );
  // (Top-up beyond what picks already created is out of scope for v1 - the
  // picks themselves drive the floor. If the floor is still short, surface a
  // note for Halim instead of inventing recipients.)
  if (gmail.enabled && networkRelated.length < FLOOR_TARGET) {
    notes.push(
      `gmail draft floor below target (${networkRelated.length}/${FLOOR_TARGET}). consider triggering refresh after sending some.`,
    );
  }

  // 8. New from inbox: any inbound sender from last 24h not in contacts and not in replies
  const new_from_inbox = await scanNewContacts(
    gmail,
    contactByEmail,
    allReplies.map((r) => r.thread_id),
  );

  // 9-11. Goal + recently sent + maintenance due, in parallel.
  const [goal, recently_sent, maintenance_due] = await Promise.all([
    computeGoal(admin, opts.areaId, opts.userId),
    loadRecentlySent(admin, opts.userId),
    loadMaintenanceDue(admin, opts.userId),
  ]);

  const briefing: NetworkBriefing = {
    generated_at: new Date().toISOString(),
    area_slug: "network",
    goal,
    todays_picks,
    inbox_replies,
    new_from_inbox,
    maintenance_due,
    recently_sent,
    carried_over: [],
    footer: {
      gmail_floor: {
        current: networkRelated.length,
        target: FLOOR_TARGET,
        topped_up_today: toppedUp,
      },
      last_run: new Date().toISOString(),
      source: opts.source,
      notes: notes.length ? notes : undefined,
    },
  };

  // 12. Persist into picker_runs.summary
  await admin
    .from("picker_runs")
    .update({ summary: briefing as never })
    .eq("id", opts.pickerRunId);

  return briefing;
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

type ReplyCandidate = {
  thread: GmailThread;
  confidence: "known" | "warm";
  contactId: string | null;
};

async function scanInboxReplies(
  gmail: ComposioGmail,
  contactByEmail: Map<string, any>,
  contacts: any[],
): Promise<ReplyCandidate[]> {
  if (!gmail.enabled || contacts.length === 0) return [];
  const out: ReplyCandidate[] = [];

  // Known contacts: limited to those with email
  const knownEmails = contacts
    .filter((c) => c.email)
    .slice(0, 50)
    .map((c) => c.email as string);
  if (knownEmails.length) {
    const query = `${knownEmails.map((e) => `from:${e}`).join(" OR ")} newer_than:7d -from:me`;
    const knownThreads = await gmail.listThreads(query, 25);
    for (const t of knownThreads) {
      if (t.has_my_reply) continue;
      if (!t.from_email) continue;
      const contact = contactByEmail.get(t.from_email);
      out.push({
        thread: t,
        confidence: "known",
        contactId: contact?.id ?? null,
      });
    }
  }

  // Warm signals: hand-typed inbound, not already covered as known
  const warmQuery =
    "newer_than:3d -from:me -category:promotions -category:social -category:updates";
  const warmThreads = await gmail.listThreads(warmQuery, 30);
  const seen = new Set(out.map((c) => c.thread.id));
  for (const t of warmThreads) {
    if (seen.has(t.id)) continue;
    if (t.has_my_reply) continue;
    if (!looksHandTyped(t)) continue;
    if (t.from_email && contactByEmail.has(t.from_email)) continue;
    out.push({ thread: t, confidence: "warm", contactId: null });
    if (out.length > 30) break;
  }

  return out;
}

async function draftReply(
  apiKey: string,
  emailVoice: string | null,
  cand: ReplyCandidate,
): Promise<string | null> {
  const system: TextBlock[] = [
    {
      type: "text",
      text: `You draft Halim's email replies in his voice.

Rules:
- No em dashes ever. Use hyphens with spaces.
- Warm, first name, concrete, embodied. No MFA-applicant prose.
- Match the energy of the inbound; if short and friendly, reply short and friendly.
- End with a brief sign-off (warm, no marketing).
- Do not invent specifics. If you cannot anchor the reply in the inbound content, write a tight acknowledgement that surfaces the question to answer.
- Output ONLY the reply body. No headers, no subject line, no greeting like "Hi,", just start with the first sentence.`,
    },
    ...(emailVoice
      ? [
          {
            type: "text" as const,
            text: emailVoice,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : []),
  ];
  const userMsg = [
    `Inbound from ${cand.thread.from_name ?? cand.thread.from_email ?? "unknown"} <${cand.thread.from_email ?? "?"}>`,
    `Subject: ${cand.thread.subject ?? "(no subject)"}`,
    "",
    "Snippet:",
    cand.thread.snippet ?? "(no snippet)",
    "",
    "Draft Halim's reply.",
  ].join("\n");

  try {
    const { text } = await callClaude({
      apiKey,
      system,
      maxTokens: 1024,
      temperature: 0.5,
      messages: [{ role: "user", content: userMsg }],
    });
    return text.replace(/—/g, " - ").trim();
  } catch (e) {
    console.warn("[network_routine] draftReply failed", e);
    return null;
  }
}

async function scanNewContacts(
  gmail: ComposioGmail,
  contactByEmail: Map<string, any>,
  excludeThreadIds: string[],
): Promise<NewContact[]> {
  if (!gmail.enabled) return [];
  const threads = await gmail.listThreads(
    "newer_than:7d -from:me -category:promotions -category:social -category:updates",
    50,
  );
  const exclude = new Set(excludeThreadIds);
  const out: NewContact[] = [];
  const seenEmails = new Set<string>();
  for (const t of threads) {
    if (!t.from_email || seenEmails.has(t.from_email)) continue;
    if (exclude.has(t.id)) continue;
    if (contactByEmail.has(t.from_email)) continue;
    if (!looksHandTyped(t)) continue;
    seenEmails.add(t.from_email);
    out.push({
      thread_id: t.id,
      sender_name: t.from_name,
      sender_email: t.from_email,
      proposed_category: proposeCategory(t),
      proposed_tier: 3,
      context: t.snippet ?? t.subject ?? "no preview available",
    });
    if (out.length >= 10) break;
  }
  return out;
}

async function computeGoal(
  admin: any,
  areaId: string,
  userId: string,
): Promise<GoalSnapshot | null> {
  const { data: goalRow } = await admin
    .from("area_goals")
    .select("*")
    .eq("area_id", areaId)
    .eq("user_id", userId)
    .eq("active", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!goalRow) return null;

  const predicate = goalRow.status_predicate as Record<string, any>;
  const wantedStatuses: string[] = predicate.status ?? [];
  const sectionPrefix: string | null = predicate.vault_section_prefix ?? null;
  const sinceIso: string | null = predicate.last_touch_at_gte ?? null;

  let q = admin
    .from("network_contacts")
    .select("category, status, vault_section, last_touch_at")
    .eq("user_id", userId);
  if (wantedStatuses.length) q = q.in("status", wantedStatuses);
  if (sinceIso) q = q.gte("last_touch_at", sinceIso);
  const { data: matchedRaw } = await q;
  const matched = (matchedRaw ?? []) as any[];
  const filtered = sectionPrefix
    ? matched.filter((m) => (m.vault_section ?? "").startsWith(sectionPrefix))
    : matched;

  const targets = (goalRow.category_targets as Record<string, number>) ?? {};
  const subtally: Record<string, { sent: number; target: number }> = {};
  for (const [k, v] of Object.entries(targets)) {
    subtally[k] = { sent: 0, target: v };
  }
  for (const c of filtered) {
    const cat = String(c.category ?? "other");
    if (subtally[cat]) subtally[cat]!.sent += 1;
  }

  const deadline = goalRow.deadline ? new Date(goalRow.deadline) : null;
  const days_left = deadline
    ? Math.ceil((deadline.getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    name: goalRow.name,
    total_sent: filtered.length,
    total_target: goalRow.target,
    subtally,
    deadline: goalRow.deadline,
    days_left,
  };
}

async function loadRecentlySent(admin: any, userId: string): Promise<any[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data } = await admin
    .from("network_contacts")
    .select("id, name, last_touch_at, last_thread_summary")
    .eq("user_id", userId)
    .gte("last_touch_at", since)
    .order("last_touch_at", { ascending: false })
    .limit(10);
  return ((data ?? []) as any[]).map((c) => ({
    contact_id: c.id,
    recipient_name: c.name,
    sent_at: c.last_touch_at,
    subject: c.last_thread_summary,
    outcome: null,
  }));
}

async function loadMaintenanceDue(admin: any, userId: string): Promise<any[]> {
  const now = new Date();
  const { data } = await admin
    .from("network_contacts")
    .select("id, name, tier, last_touch_at")
    .eq("user_id", userId)
    .not("tier", "is", null)
    .order("last_touch_at", { ascending: true, nullsFirst: true })
    .limit(50);
  const out: any[] = [];
  for (const c of (data ?? []) as any[]) {
    const tier = Number(c.tier);
    const cadenceDays =
      tier === 0 ? 30 : tier === 1 ? 90 : tier === 4 ? 365 : 180;
    const last = c.last_touch_at ? new Date(c.last_touch_at) : null;
    const ageDays = last
      ? Math.floor((now.getTime() - last.getTime()) / 86_400_000)
      : Infinity;
    if (ageDays >= cadenceDays) {
      out.push({
        contact_id: c.id,
        recipient_name: c.name,
        tier,
        last_touch_at: c.last_touch_at,
        why_due: `tier ${tier} cadence is ${cadenceDays}d; last touched ${last ? ageDays + "d ago" : "never"}.`,
      });
    }
    if (out.length >= 10) break;
  }
  return out;
}

function parsePickNotes(notes: string): {
  whyToday: string | null;
  hook: string | null;
  subject: string | null;
  body: string | null;
  suggestedChannel: string | null;
} {
  const out = {
    whyToday: null as string | null,
    hook: null as string | null,
    subject: null as string | null,
    body: null as string | null,
    suggestedChannel: null as string | null,
  };
  const m1 = notes.match(/why today:\s*(.+?)(?:\n|$)/i);
  if (m1) out.whyToday = m1[1]!.trim();
  const m2 = notes.match(/hook:\s*(.+?)(?:\n|$)/i);
  if (m2) out.hook = m2[1]!.trim();
  const m3 = notes.match(/subject:\s*(.+?)(?:\n|$)/i);
  if (m3) out.subject = m3[1]!.trim();
  const m4 = notes.match(/(?:channel|send via):\s*(\w+)/i);
  if (m4) out.suggestedChannel = m4[1]!.toLowerCase();
  // Body is the chunk after a blank line, otherwise the whole notes
  const bodyMatch = notes.split(/\n\n+/);
  out.body =
    bodyMatch.length > 1
      ? bodyMatch.slice(1).join("\n\n").trim()
      : notes.trim();
  return out;
}

function inferChannel(
  email: string | null | undefined,
  social: any,
  suggested: string | null,
): DraftPick["recipient_channel"] {
  const s = suggested?.toLowerCase() ?? "";
  if (s.includes("instagram") || s.includes("ig")) return "instagram";
  if (s.includes("linkedin")) return "linkedin";
  if (s.includes("imessage") || s.includes("text")) return "imessage";
  if (email) return "gmail";
  if (social?.instagram) return "instagram";
  if (social?.linkedin) return "linkedin";
  return "other";
}

function isNetworkRelatedDraft(
  recipient: string | null,
  contactByEmail: Map<string, any>,
  picks: DraftPick[],
): boolean {
  if (!recipient) return false;
  const e = recipient.toLowerCase();
  if (contactByEmail.has(e)) return true;
  if (picks.some((p) => p.recipient_email?.toLowerCase() === e)) return true;
  // Outreach archetypes
  const ARCHE =
    /^(info|editor|editorial|contact|hello|submissions|queries|production|team|press)@/;
  return ARCHE.test(e);
}

function proposeCategory(t: GmailThread): string {
  const subj = (t.subject ?? "").toLowerCase();
  const email = (t.from_email ?? "").toLowerCase();
  if (subj.includes("podcast") || email.includes("podcast")) return "podcast";
  if (subj.includes("gallery") || email.includes("gallery")) return "gallery";
  if (
    subj.includes("magazine") ||
    subj.includes("journal") ||
    subj.includes("publication")
  )
    return "publication";
  return "peer";
}
