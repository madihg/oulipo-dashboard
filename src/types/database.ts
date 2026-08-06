/**
 * Hand-maintained Supabase types matching supabase/migrations/0001_init.sql.
 * Replace with auto-generated output once the project is provisioned:
 *   pnpm dlx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type ProjectState = "active" | "someday" | "completed" | "cancelled";
export type Cadence = "daily" | "weekly" | "monthly" | "yearly";
export type TodoState =
  | "inbox"
  | "today"
  | "anytime"
  | "upcoming"
  | "someday"
  | "completed"
  | "cancelled"
  | "logbook";
export type Priority = "P0" | "P1" | "P2" | "ongoing";
export type CaptureSource = "mobile" | "web" | "dispatch" | "obsidian";
export type CaptureState =
  "pending" | "routing" | "routed" | "needs_review" | "failed";
export type ClaudeMode = "manual" | "auto" | "checkin";
export type ClaudeStatus = "queued" | "running" | "completed" | "failed";
export type MemoryKind =
  | "user_rule"
  | "project_rule"
  | "feedback"
  | "reference"
  | "style_guide"
  | "wiki";

// --- Reservoir enums (see supabase/migrations/0002_reservoirs.sql) ---
export type NetworkCategory =
  | "podcast"
  | "publication"
  | "gallery"
  | "peer"
  | "curator"
  | "journalist"
  | "org"
  | "collector"
  | "other";
export type NetworkStatus =
  | "lead"
  | "contacted"
  | "responded"
  | "meeting_scheduled"
  | "in_relationship"
  | "dormant";
export type ApplyKind =
  | "residency"
  | "submission"
  | "grant"
  | "fellowship"
  | "journal"
  | "podcast_pitch"
  | "other";
export type ApplyStatus =
  | "watchlist"
  | "doing"
  | "applied"
  | "accepted"
  | "rejected"
  | "declined"
  | "skipped";
export type LearnKind = "lit" | "tech";
export type LearnStatus = "backlog" | "doing" | "done" | "skipped";
export type WikiPriority = "P0" | "P1" | "P2" | "dormant";
export type PieceKind =
  | "Piece"
  | "Exhibition"
  | "Residency"
  | "Talk"
  | "Workshop"
  | "Show"
  | "Writing"
  | "Gathering"
  | "Press"
  | "Press Kit";
export type PieceStatus =
  "someday" | "active" | "in_progress" | "shipped" | "archived";
export type WriteState = "in_progress" | "active" | "completed";
export type OutingsSignal = "high" | "medium" | "low";
export type ShareKind =
  | "work_share"
  | "announcement"
  | "event_reminder"
  | "reshare"
  | "substack_essay"
  | "substack_chat"
  | "quote_card"
  | "micro"
  | "other";
export type ShareFormat =
  | "ig_carousel"
  | "ig_reel"
  | "ig_single"
  | "ig_story"
  | "substack_post"
  | "substack_chat"
  | "cross_platform"
  | "other";
export type ShareStatus =
  | "backlog"
  | "suggested"
  | "locked"
  | "drafted"
  | "shipped"
  | "slot_skipped"
  | "dropped";
export type ShareTouchpoint = "announce" | "during" | "after";
export type SurfaceSourceTable =
  | "network_contacts"
  | "apply_opportunities"
  | "learn_items"
  | "learn_wikis"
  | "make_pieces"
  | "write_drafts"
  | "outings_events"
  | "share_items";

export interface AreaRow {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  position: number;
  color: string | null;
  icon: string | null;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  area_id: string;
  slug: string;
  name: string;
  notes: string | null;
  deadline: string | null;
  state: ProjectState;
  cadence: Cadence | null;
  cadence_target: number | null;
  position: number;
  obsidian_uri: string | null;
  created_at: string;
}

export interface HeadingRow {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  position: number;
  created_at: string;
}

export interface TodoRow {
  id: string;
  user_id: string;
  area_id: string | null;
  project_id: string | null;
  heading_id: string | null;
  title: string;
  notes: string | null;
  state: TodoState;
  priority: Priority | null;
  start_date: string | null;
  deadline: string | null;
  evening: boolean;
  completed_at: string | null;
  position: number;
  obsidian_uri: string | null;
  drafts: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  /**
   * NOT a column. Hydrated at load time from the todo_tags join
   * (lib/todoTags.ts) - a sorted array of tag names. Absent on rows that
   * arrive via realtime until the next load.
   */
  tags?: string[];
}

export interface ChecklistItemRow {
  id: string;
  todo_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
}

export interface TagRow {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
}

export interface TodoTagRow {
  todo_id: string;
  tag_id: string;
}

export interface RepeatingRuleRow {
  id: string;
  todo_id: string;
  rule: Record<string, unknown>;
  next_fire_at: string | null;
  last_fired_at: string | null;
  on_miss: "backfill" | "skip" | "fire-once";
  created_at: string;
}

export interface CaptureRow {
  id: string;
  user_id: string;
  raw_text: string;
  source: CaptureSource;
  state: CaptureState;
  routed_to_todo_id: string | null;
  routed_to_claude_id: string | null;
  inference_summary: string | null;
  reasoning: string | null;
  confidence: number | null;
  tools_used: string[] | null;
  prep_duration_ms: number | null;
  created_at: string;
}

export interface ClaudeTaskRow {
  id: string;
  user_id: string;
  todo_id: string | null;
  mode: ClaudeMode;
  prompt_text: string;
  status: ClaudeStatus;
  result_text: string | null;
  result_url: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  created_at: string;
}

export interface PickerRunRow {
  id: string;
  area_id: string | null;
  function_name: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  summary: Record<string, unknown> | null;
}

export interface MemoryEntryRow {
  id: string;
  user_id: string;
  kind: MemoryKind;
  scope: string;
  title: string;
  body: string;
  source_file: string | null;
  last_updated_at: string;
  created_at: string;
}

/** Priority-board sticky notes shown on Today (week goals + week/quarter/year
 *  priorities). App-side feature over a dedicated table; mindset post-its are
 *  read separately from memory_entries. */
export type BoardKind = "week_goals" | "week" | "quarter" | "year";
export interface BoardNoteRow {
  id: string;
  user_id: string;
  board: BoardKind;
  position: number;
  body: string;
  created_at: string;
  updated_at: string;
}

// --- Reservoir row types ---

export interface NetworkContactRow {
  id: string;
  user_id: string;
  name: string;
  category: NetworkCategory;
  tier: number;
  email: string | null;
  phone: string | null;
  twitter: string | null;
  instagram: string | null;
  website: string | null;
  status: NetworkStatus;
  hook: string | null;
  hook_fetched_at: string | null;
  last_touch_at: string | null;
  last_touched_thread_id: string | null;
  last_surfaced_at: string | null;
  surfaced_count: number;
  maintenance_due_at: string | null;
  warm_bridge: string | null;
  notes: string | null;
  created_at: string;
}

export interface ApplyOpportunityRow {
  id: string;
  user_id: string;
  kind: ApplyKind;
  name: string;
  organization: string | null;
  deadline: string | null;
  rolling: boolean;
  url: string | null;
  fit_note: string | null;
  status: ApplyStatus;
  priority: Priority | null;
  materials_status: string | null;
  last_surfaced_at: string | null;
  surfaced_count: number;
  notes: string | null;
  created_at: string;
}

export interface LearnItemRow {
  id: string;
  user_id: string;
  kind: LearnKind;
  title: string;
  url: string | null;
  source: string | null;
  tags: string[];
  priority: Priority | null;
  deadline: string | null;
  status: LearnStatus;
  resurface_at: string | null;
  surfaced_count: number;
  last_surfaced_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface LearnWikiRow {
  id: string;
  user_id: string;
  tag: string;
  title: string;
  priority: WikiPriority;
  synthesis: string | null;
  body: string | null;
  sources_count: number;
  last_ingest_at: string | null;
  cross_refs: string[];
  frontmatter: Record<string, unknown> | null;
  created_at: string;
}

export interface MakePieceRow {
  id: string;
  user_id: string;
  parent_piece_id: string | null;
  slug: string;
  name: string;
  piece_kind: PieceKind;
  status: PieceStatus;
  deadline: string | null;
  ship_target_at: string | null;
  shipped_at: string | null;
  brief: string | null;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface WriteDraftRow {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  state: WriteState;
  wikis_used: string[];
  obsidian_uri: string | null;
  ship_target_at: string | null;
  last_touched_at: string | null;
  shipped_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface OutingsEventRow {
  id: string;
  user_id: string;
  title: string;
  kind: string | null;
  venue: string | null;
  address: string | null;
  starts_at: string | null;
  ends_at: string | null;
  url: string | null;
  source: string | null;
  signal: OutingsSignal;
  price: string | null;
  notes: string | null;
  captured_at: string;
  expires_at: string | null;
}

export interface ShareItemRow {
  id: string;
  user_id: string;
  source_piece_id: string | null;
  arc_slug: string | null;
  touchpoint: ShareTouchpoint | null;
  title: string;
  hook: string | null;
  kind: ShareKind;
  format: ShareFormat;
  platform_targets: string[];
  status: ShareStatus;
  priority: Priority | null;
  target_slot_at: string | null;
  shipped_at: string | null;
  draft_caption: string | null;
  draft_hashtags: string[];
  draft_substack_title: string | null;
  draft_substack_subtitle: string | null;
  draft_substack_body: string | null;
  draft_slides: Array<Record<string, unknown>> | null;
  draft_images: Array<Record<string, unknown>> | null;
  drive_folder_url: string | null;
  external_url: string | null;
  last_surfaced_at: string | null;
  surfaced_count: number;
  notes: string | null;
  created_at: string;
}

export interface SurfacedFromRow {
  todo_id: string;
  source_table: SurfaceSourceTable;
  source_id: string;
  surfaced_at: string;
  picker_run_id: string | null;
}

// Added by 0003_network_routine.sql
export interface InboxReplyDraftRow {
  id: string;
  user_id: string;
  gmail_thread_id: string;
  gmail_message_id: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  snippet: string | null;
  drafted_body: string;
  confidence: "known" | "warm" | "starred";
  contact_id: string | null;
  generated_at: string;
  status: "pending" | "drafted_in_gmail" | "dismissed" | "sent";
  gmail_draft_id: string | null;
  gmail_draft_url: string | null;
  picker_run_id: string | null;
}

export interface AreaGoalRow {
  id: string;
  user_id: string;
  area_id: string;
  name: string;
  target: number;
  category_targets: Record<string, number> | null;
  deadline: string | null;
  status_predicate: Record<string, unknown>;
  started_at: string;
  active: boolean;
}

export interface Database {
  hmart: {
    Tables: {
      areas: {
        Row: AreaRow;
        Insert: Partial<AreaRow> & Pick<AreaRow, "user_id" | "slug" | "name">;
        Update: Partial<AreaRow>;
      };
      projects: {
        Row: ProjectRow;
        Insert: Partial<ProjectRow> &
          Pick<ProjectRow, "user_id" | "area_id" | "slug" | "name">;
        Update: Partial<ProjectRow>;
      };
      headings: {
        Row: HeadingRow;
        Insert: Partial<HeadingRow> &
          Pick<HeadingRow, "user_id" | "project_id" | "title">;
        Update: Partial<HeadingRow>;
      };
      todos: {
        Row: TodoRow;
        Insert: Partial<TodoRow> & Pick<TodoRow, "user_id" | "title">;
        Update: Partial<TodoRow>;
      };
      checklist_items: {
        Row: ChecklistItemRow;
        Insert: Partial<ChecklistItemRow> &
          Pick<ChecklistItemRow, "todo_id" | "title">;
        Update: Partial<ChecklistItemRow>;
      };
      tags: {
        Row: TagRow;
        Insert: Partial<TagRow> & Pick<TagRow, "user_id" | "name">;
        Update: Partial<TagRow>;
      };
      todo_tags: {
        Row: TodoTagRow;
        Insert: TodoTagRow;
        Update: Partial<TodoTagRow>;
      };
      repeating_rules: {
        Row: RepeatingRuleRow;
        Insert: Partial<RepeatingRuleRow> &
          Pick<RepeatingRuleRow, "todo_id" | "rule">;
        Update: Partial<RepeatingRuleRow>;
      };
      captures: {
        Row: CaptureRow;
        Insert: Partial<CaptureRow> &
          Pick<CaptureRow, "user_id" | "raw_text" | "source">;
        Update: Partial<CaptureRow>;
      };
      claude_tasks: {
        Row: ClaudeTaskRow;
        Insert: Partial<ClaudeTaskRow> &
          Pick<ClaudeTaskRow, "user_id" | "prompt_text">;
        Update: Partial<ClaudeTaskRow>;
      };
      picker_runs: {
        Row: PickerRunRow;
        Insert: Partial<PickerRunRow> & Pick<PickerRunRow, "function_name">;
        Update: Partial<PickerRunRow>;
      };
      memory_entries: {
        Row: MemoryEntryRow;
        Insert: Partial<MemoryEntryRow> &
          Pick<MemoryEntryRow, "user_id" | "kind" | "title" | "body">;
        Update: Partial<MemoryEntryRow>;
      };
      network_contacts: {
        Row: NetworkContactRow;
        Insert: Partial<NetworkContactRow> &
          Pick<NetworkContactRow, "user_id" | "name" | "category">;
        Update: Partial<NetworkContactRow>;
      };
      apply_opportunities: {
        Row: ApplyOpportunityRow;
        Insert: Partial<ApplyOpportunityRow> &
          Pick<ApplyOpportunityRow, "user_id" | "kind" | "name">;
        Update: Partial<ApplyOpportunityRow>;
      };
      learn_items: {
        Row: LearnItemRow;
        Insert: Partial<LearnItemRow> &
          Pick<LearnItemRow, "user_id" | "kind" | "title">;
        Update: Partial<LearnItemRow>;
      };
      learn_wikis: {
        Row: LearnWikiRow;
        Insert: Partial<LearnWikiRow> &
          Pick<LearnWikiRow, "user_id" | "tag" | "title">;
        Update: Partial<LearnWikiRow>;
      };
      make_pieces: {
        Row: MakePieceRow;
        Insert: Partial<MakePieceRow> &
          Pick<MakePieceRow, "user_id" | "slug" | "name">;
        Update: Partial<MakePieceRow>;
      };
      write_drafts: {
        Row: WriteDraftRow;
        Insert: Partial<WriteDraftRow> &
          Pick<WriteDraftRow, "user_id" | "slug" | "title">;
        Update: Partial<WriteDraftRow>;
      };
      outings_events: {
        Row: OutingsEventRow;
        Insert: Partial<OutingsEventRow> &
          Pick<OutingsEventRow, "user_id" | "title">;
        Update: Partial<OutingsEventRow>;
      };
      share_items: {
        Row: ShareItemRow;
        Insert: Partial<ShareItemRow> & Pick<ShareItemRow, "user_id" | "title">;
        Update: Partial<ShareItemRow>;
      };
      surfaced_from: {
        Row: SurfacedFromRow;
        Insert: Pick<
          SurfacedFromRow,
          "todo_id" | "source_table" | "source_id"
        > &
          Partial<
            Omit<SurfacedFromRow, "todo_id" | "source_table" | "source_id">
          >;
        Update: Partial<SurfacedFromRow>;
      };
      inbox_reply_drafts: {
        Row: InboxReplyDraftRow;
        Insert: Partial<InboxReplyDraftRow> &
          Pick<
            InboxReplyDraftRow,
            | "user_id"
            | "gmail_thread_id"
            | "gmail_message_id"
            | "sender_email"
            | "drafted_body"
            | "confidence"
          >;
        Update: Partial<InboxReplyDraftRow>;
      };
      area_goals: {
        Row: AreaGoalRow;
        Insert: Partial<AreaGoalRow> &
          Pick<
            AreaGoalRow,
            "user_id" | "area_id" | "name" | "target" | "status_predicate"
          >;
        Update: Partial<AreaGoalRow>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
