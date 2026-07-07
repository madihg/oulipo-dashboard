import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { supabase } from "../lib/supabase";
import type { BoardKind, BoardNoteRow } from "../types/database";

/**
 * Priority board shown on Today: an editable weekly-goals field plus week /
 * quarter / year priority sticky notes (3 max each), backed by hmart.board_notes.
 * Mindset post-its are read-only, rotated from existing memory_entries.
 * App-side only; the source (memory_entries) is never written here.
 */

export interface MindsetCard {
  id: string;
  title: string;
  body: string;
}

export const MAX_PER_BOARD = 3;

export const useBoardsStore = defineStore("boards", () => {
  const notes = ref<BoardNoteRow[]>([]);
  const mindset = ref<MindsetCard[]>([]);
  const loaded = ref(false);
  const lastError = ref<string | null>(null);

  async function userId(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  async function load(): Promise<void> {
    const uid = await userId();
    if (!uid) return;
    const { data, error } = await supabase
      .from("board_notes")
      .select("*")
      .order("board", { ascending: true })
      .order("position", { ascending: true });
    if (error) lastError.value = error.message;
    notes.value = (data as BoardNoteRow[] | null) ?? [];

    // Mindset insights: read-only, from the existing memory vault.
    const { data: mind } = await supabase
      .from("memory_entries")
      .select("id,title,body")
      .ilike("scope", "%mindset%")
      .limit(50);
    mindset.value = ((mind as MindsetCard[] | null) ?? []).filter((m) =>
      (m.body ?? "").trim(),
    );
    loaded.value = true;
  }

  function notesFor(board: BoardKind): BoardNoteRow[] {
    return notes.value
      .filter((n) => n.board === board)
      .sort((a, b) => a.position - b.position);
  }

  const weekGoals = computed<string>(
    () => notesFor("week_goals")[0]?.body ?? "",
  );

  // Serialize saves so two rapid blurs can't both create a week_goals row
  // (weekGoals reads [0], so a duplicate would silently shadow edits).
  let savingWeekGoals: Promise<void> | null = null;
  async function saveWeekGoals(text: string): Promise<void> {
    if (savingWeekGoals) await savingWeekGoals;
    savingWeekGoals = (async () => {
      const existing = notesFor("week_goals")[0];
      if (existing) {
        if (existing.body === text) return;
        existing.body = text;
        await supabase
          .from("board_notes")
          .update({ body: text, updated_at: new Date().toISOString() } as never)
          .eq("id", existing.id);
      } else if (text.trim()) {
        await addNote("week_goals", text);
      }
    })().finally(() => {
      savingWeekGoals = null;
    });
    await savingWeekGoals;
  }

  async function addNote(
    board: BoardKind,
    body: string,
  ): Promise<BoardNoteRow | null> {
    const uid = await userId();
    if (!uid) return null;
    // Cap the list boards at MAX_PER_BOARD (week_goals is a single field).
    const siblings = notesFor(board);
    if (board !== "week_goals" && siblings.length >= MAX_PER_BOARD) {
      return null;
    }
    // max+1, not length: length collides after a middle note is removed.
    const position = siblings.length
      ? Math.max(...siblings.map((n) => n.position)) + 1
      : 0;
    const { data, error } = await supabase
      .from("board_notes")
      .insert({ user_id: uid, board, position, body } as never)
      .select()
      .single();
    if (error || !data) {
      lastError.value = error?.message ?? "add note failed";
      return null;
    }
    notes.value.push(data as BoardNoteRow);
    return data as BoardNoteRow;
  }

  async function updateNote(id: string, body: string): Promise<void> {
    const n = notes.value.find((x) => x.id === id);
    if (n) n.body = body;
    await supabase
      .from("board_notes")
      .update({ body, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
  }

  async function removeNote(id: string): Promise<void> {
    notes.value = notes.value.filter((n) => n.id !== id);
    await supabase.from("board_notes").delete().eq("id", id);
  }

  function canAdd(board: BoardKind): boolean {
    return board === "week_goals" || notesFor(board).length < MAX_PER_BOARD;
  }

  return {
    notes,
    mindset,
    loaded,
    lastError,
    load,
    notesFor,
    weekGoals,
    saveWeekGoals,
    addNote,
    updateNote,
    removeNote,
    canAdd,
  };
});
