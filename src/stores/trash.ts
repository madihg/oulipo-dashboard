import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { supabase } from "../lib/supabase";
import type {
  TrashEntry,
  TrashKind,
  TrashRestoreResult,
} from "../types/database";
import {
  kindLabel,
  normalizeEntry,
  normalizeKinds,
  normalizeResult,
} from "../utils/trash";
import { useVaultStore } from "./vault";

/** One page of the trash list. */
export const TRASH_PAGE = 60;

/** Tables the vault mirrors: a restore that touches one refreshes the lists. */
const TODO_TABLES = new Set([
  "todos",
  "checklist_items",
  "todo_tags",
  "repeating_rules",
  "headings",
  "projects",
]);
const REGISTRY_TABLES = new Set(["projects", "areas", "tags"]);

/**
 * The trash: every DELETE in hmart copies the row into hmart.trash, with the
 * rows it cascaded to stored as its children. This store is the client of the
 * four RPCs (trash_search, trash_kinds, trash_restore, trash_restore_row).
 * The list itself lives in the view, which pages and searches it; the store
 * keeps the per-kind counts and, after a restore, refreshes whatever the rest
 * of the app shows from the tables that came back.
 */
export const useTrashStore = defineStore("trash", () => {
  const kinds = ref<TrashKind[]>([]);
  const kindsLoaded = ref(false);
  const total = computed(() => kinds.value.reduce((s, k) => s + k.n, 0));

  async function search(
    q = "",
    kind: string | null = null,
    offset = 0,
    limit = TRASH_PAGE,
  ): Promise<{ rows: TrashEntry[]; error: string | null }> {
    await supabase.auth.getSession();
    const { data, error } = await supabase.rpc("trash_search", {
      p_q: q,
      p_kind: kind,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) {
      console.error("[trash] search failed:", error);
      return { rows: [], error: error.message ?? String(error) };
    }
    const rows = ((data ?? []) as Partial<TrashEntry>[]).map(normalizeEntry);
    return { rows, error: null };
  }

  async function loadKinds(): Promise<void> {
    await supabase.auth.getSession();
    const { data, error } = await supabase.rpc("trash_kinds");
    if (error) {
      console.error("[trash] kinds failed:", error);
      return;
    }
    kinds.value = normalizeKinds((data ?? []) as Partial<TrashKind>[]);
    kindsLoaded.value = true;
  }

  /** Refresh what the rest of the app shows from the tables that came back.
   *  Realtime also delivers todos/projects/areas inserts; the loaders replace
   *  lists wholesale, so nothing is pushed twice by hand. */
  async function afterRestore(result: TrashRestoreResult): Promise<void> {
    const tables = new Set(result.restored.map((r) => r.table));
    if (!tables.size) return;
    const vault = useVaultStore();
    const jobs: Promise<unknown>[] = [];
    if ([...tables].some((t) => REGISTRY_TABLES.has(t))) {
      jobs.push(vault.loadAreasAndProjects({ force: true }));
    }
    if ([...tables].some((t) => TODO_TABLES.has(t))) {
      jobs.push(
        vault.refreshLoaded({ force: true }).then((ran) => {
          // A write still waiting to land holds the refresh back; the
          // detached lists still reload on rev.
          if (!ran) vault.bumpRev();
        }),
      );
    }
    await Promise.all(jobs);
  }

  /** The RPC, then a refresh of the app's lists that never blocks the caller
   *  and never throws into it: the page updates its row and toast first. */
  async function run(
    fn: "trash_restore" | "trash_restore_row",
    args: Record<string, unknown>,
  ): Promise<{ result: TrashRestoreResult | null; error: string | null }> {
    try {
      await supabase.auth.getSession();
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        console.error(`[trash] ${fn} failed:`, error);
        return { result: null, error: error.message ?? String(error) };
      }
      const result = normalizeResult(data);
      afterRestore(result).catch((e) =>
        console.error("[trash] refresh after restore failed:", e),
      );
      return { result, error: null };
    } catch (e) {
      console.error(`[trash] ${fn} threw:`, e);
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Put one entry back with everything it cascaded to; `batch` brings back
   *  every entry the same deletion made. */
  function restore(id: string, batch = false) {
    return run("trash_restore", { p_id: id, p_batch: batch });
  }

  /** Put back the latest trashed copy of a live-table row, by its own id. */
  function restoreRow(table: string, rowId: string) {
    return run("trash_restore_row", { p_table: table, p_row_id: rowId });
  }

  return {
    kinds,
    kindsLoaded,
    total,
    search,
    loadKinds,
    restore,
    restoreRow,
    kindLabel,
  };
});
