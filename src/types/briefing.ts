/**
 * Shape of the briefing JSON the area_picker writes into picker_runs.summary.
 * The frontend reads this shape; the Edge Function writes it.
 *
 * Keep this file in sync with the Deno code in
 * supabase/functions/area_picker/types.ts - any change here needs a
 * matching change there.
 */

export type Priority = "P0" | "P1" | "P2";

export interface GoalSnapshot {
  name: string;
  total_sent: number;
  total_target: number;
  subtally: Record<string, { sent: number; target: number }>;
  deadline: string | null;
  days_left: number | null;
}

export interface DraftPick {
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
  marked_sent_at?: string | null;
}

export interface InboxReply {
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
}

export interface NewContact {
  thread_id: string;
  sender_name: string | null;
  sender_email: string;
  proposed_category: string;
  proposed_tier: number;
  context: string;
}

export interface ParkedItem {
  contact_id: string | null;
  recipient_name: string;
  reason: string;
  unblocks_when: string | null;
}

export interface SentItem {
  contact_id: string | null;
  recipient_name: string;
  sent_at: string;
  subject: string | null;
  outcome: string | null;
}

export interface MaintenanceItem {
  contact_id: string;
  recipient_name: string;
  tier: number;
  last_touch_at: string | null;
  why_due: string;
}

export interface BriefingFooter {
  gmail_floor: { current: number; target: number; topped_up_today: number };
  last_run: string;
  source: "scheduled" | "manual";
  notes?: string[];
}

export interface NetworkBriefing {
  generated_at: string;
  area_slug: string;
  goal: GoalSnapshot | null;
  todays_picks: DraftPick[];
  inbox_replies: { known: InboxReply[]; warm: InboxReply[] };
  new_from_inbox: NewContact[];
  maintenance_due: MaintenanceItem[];
  recently_sent: SentItem[];
  carried_over: ParkedItem[];
  footer: BriefingFooter;
}

export function emptyBriefing(area_slug: string): NetworkBriefing {
  return {
    generated_at: new Date().toISOString(),
    area_slug,
    goal: null,
    todays_picks: [],
    inbox_replies: { known: [], warm: [] },
    new_from_inbox: [],
    maintenance_due: [],
    recently_sent: [],
    carried_over: [],
    footer: {
      gmail_floor: { current: 0, target: 5, topped_up_today: 0 },
      last_run: new Date().toISOString(),
      source: "scheduled",
    },
  };
}
