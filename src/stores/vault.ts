import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { supabase } from "../lib/supabase";
import { invokeEnrich } from "../lib/enrichTodo";
import {
  stage,
  settle,
  replay,
  type Patch as PendingPatch,
} from "../lib/pendingWrites";
import type { AreaRow, ProjectRow, TagRow, TodoRow } from "../types/database";
import { belongsInToday, todayISO } from "../utils/when";

/**
 * Memoized session resolver: every loader needs to wait for the auth session
 * to hydrate before issuing a query (otherwise RLS silently filters to []).
 * We cache the promise so a burst of parallel loaders share a single round
 * trip. `supabase.auth.onAuthStateChange` invalidates the memo so the next
 * session change re-resolves.
 */
let sessionPromise: ReturnType<typeof supabase.auth.getSession> | null = null;
function getSessionMemo() {
  if (!sessionPromise) sessionPromise = supabase.auth.getSession();
  return sessionPromise;
}
supabase.auth.onAuthStateChange(() => {
  sessionPromise = null;
});

/**
 * Vault store - in-memory mirror of the Supabase tables read most.
 * Holds areas, projects, and per-view slices of todos with optimistic CRUD.
 */
export const useVaultStore = defineStore("vault", () => {
  const areas = ref<AreaRow[]>([]);
  const projects = ref<ProjectRow[]>([]);
  const todayTodos = ref<TodoRow[]>([]);
  const inboxTodos = ref<TodoRow[]>([]);
  const projectTodos = ref<TodoRow[]>([]); // currently-viewed project
  const areaTodos = ref<TodoRow[]>([]); // currently-viewed area aggregate
  const tags = ref<TagRow[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Monotonic revision bumped on every todo mutation / realtime change. Views
  // that render from a DETACHED fetch result (StateList: anytime/upcoming/
  // someday/logbook load into their own ref, which reconcileListsMembership and
  // applyTodoChange never touch) watch this and re-load so in-place edits there
  // don't go stale.
  const rev = ref(0);
  function bumpRev() {
    rev.value++;
  }

  // Navigation cache: skip refetch when re-entering the same area/project.
  // Realtime subscriptions keep the in-memory rows fresh between navs.
  const lastLoadedAreaId = ref<string | null>(null);
  const lastLoadedProjectId = ref<string | null>(null);
  const areasAndProjectsLoaded = ref(false);

  const projectsByArea = computed(() => {
    const map = new Map<string, ProjectRow[]>();
    for (const p of projects.value) {
      const list = map.get(p.area_id) ?? [];
      list.push(p);
      map.set(p.area_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  });

  const areaBySlug = computed(
    () => (slug: string) => areas.value.find((a) => a.slug === slug) ?? null,
  );
  const projectBySlug = computed(
    () => (slug: string) => projects.value.find((p) => p.slug === slug) ?? null,
  );

  // ===========================================================================
  // Loaders
  // ===========================================================================

  async function loadAreasAndProjects(opts: { force?: boolean } = {}) {
    if (!opts.force && areasAndProjectsLoaded.value) return;
    loading.value = true;
    error.value = null;
    try {
      // Force-resolve auth before any query - first request on mount can
      // otherwise race ahead of session hydration and go anon, which RLS
      // silently filters to []. Looks identical to "no data".
      const { data: sess } = await getSessionMemo();
      if (!sess.session?.user) {
        // Auth hasn't hydrated yet (common on mobile/PWA cold starts). Bail
        // WITHOUT marking loaded so this isn't cached as an empty result - the
        // auth-state listener below force-reloads once the session arrives.
        return;
      }
      const [a, p, t] = await Promise.all([
        supabase.from("areas").select("*").order("position").limit(500),
        supabase.from("projects").select("*").order("position").limit(500),
        supabase.from("tags").select("*").order("name").limit(500),
      ]);
      if (a.error) throw a.error;
      if (p.error) throw p.error;
      areas.value = a.data ?? [];
      projects.value = p.data ?? [];
      tags.value = t.data ?? [];
      areasAndProjectsLoaded.value = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error.value = msg;
      console.error("[vault] loadAreasAndProjects failed:", msg, e);
    } finally {
      loading.value = false;
    }
  }

  async function createTag(
    name: string,
    color?: string,
  ): Promise<TagRow | null> {
    const clean = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    if (!clean) return null;
    const existing = tags.value.find((t) => t.name === clean);
    if (existing) return existing;
    await getSessionMemo();
    const { data: sess } = await getSessionMemo();
    const userId = sess.session?.user?.id;
    if (!userId) return null;
    const { data } = await supabase
      .from("tags")
      .insert({ user_id: userId, name: clean, color: color ?? null } as never)
      .select()
      .single();
    if (data) tags.value.push(data as TagRow);
    return (data as TagRow) ?? null;
  }

  async function loadToday() {
    await getSessionMemo();
    // LOCAL date - toISOString() is UTC and shifts the day west of UTC.
    const today = todayISO();
    // Things 3 semantics, mirror of belongsInToday() in utils/when.ts:
    // when=today OR scheduled date arrived (someday excluded) OR deadline
    // arrived. Priority alone never qualifies.
    const { data, error: err } = await supabase
      .from("todos")
      .select("*")
      .not("state", "in", "(completed,cancelled,logbook)")
      .or(
        [
          `state.eq.today`,
          `and(start_date.lte.${today},state.neq.someday)`,
          `deadline.lte.${today}`,
        ].join(","),
      )
      .order("priority", { ascending: true, nullsFirst: false })
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("position");
    if (err) {
      error.value = err.message;
      console.error("[vault] loadToday failed:", err);
      return;
    }
    todayTodos.value = data ?? [];
  }

  async function loadInbox() {
    await getSessionMemo();
    // Inbox is the unfiled bucket: state=inbox AND not yet assigned to an area
    // or project. A todo that has an area_id/project_id has been filed and must
    // not show here even if its state still reads "inbox".
    const { data, error: err } = await supabase
      .from("todos")
      .select("*")
      .eq("state", "inbox")
      .is("area_id", null)
      .is("project_id", null)
      // position first so manual drag-reorder persists across reloads; newest
      // breaks ties (a fresh capture with position 0 lands at the top).
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    if (err) {
      error.value = err.message;
      console.error("[vault] loadInbox failed:", err);
      return;
    }
    inboxTodos.value = data ?? [];
  }

  async function loadProjectTodos(
    projectId: string,
    opts: { force?: boolean } = {},
  ) {
    if (!opts.force && lastLoadedProjectId.value === projectId) return;
    await getSessionMemo();
    const { data, error: err } = await supabase
      .from("todos")
      .select("*")
      .eq("project_id", projectId)
      .neq("state", "completed")
      .order("priority", { ascending: true, nullsFirst: false })
      .order("position");
    if (err) {
      error.value = err.message;
      console.error("[vault] loadProjectTodos failed:", err);
      return;
    }
    projectTodos.value = data ?? [];
    lastLoadedProjectId.value = projectId;
  }

  /**
   * Generic state-scoped loader for Anytime / Upcoming / Someday / Logbook.
   * Returns the rows so the view can render directly without persisting to a
   * dedicated ref slot.
   */
  async function loadByState(opts: {
    state?: "anytime" | "upcoming" | "someday" | "completed" | "inbox";
    startDateAfter?: string;
    completedOnly?: boolean;
    limit?: number;
  }): Promise<TodoRow[]> {
    await getSessionMemo();
    const today = todayISO();
    let q = supabase.from("todos").select("*");
    if (opts.state) q = q.eq("state", opts.state);
    // Anytime = available now: no start_date, or one that has already arrived.
    // Future-dated 'anytime' tasks (e.g. when=tomorrow/weekend) belong to
    // Upcoming, so exclude them here to avoid showing in BOTH lists.
    if (opts.state === "anytime") {
      q = q.or(`start_date.is.null,start_date.lte.${today}`);
    }
    // Upcoming = future start_date, still open (don't leak completed ones).
    if (opts.startDateAfter) {
      q = q.gt("start_date", opts.startDateAfter).neq("state", "completed");
    }
    if (opts.completedOnly) q = q.eq("state", "completed");
    if (opts.completedOnly) {
      q = q.order("completed_at", { ascending: false });
    } else {
      q = q
        .order("priority", { ascending: true, nullsFirst: false })
        .order("start_date", { ascending: true, nullsFirst: false });
    }
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error: err } = await q;
    if (err) {
      error.value = err.message;
      console.error("[vault] loadByState failed:", err);
      return [];
    }
    return (data as TodoRow[]) ?? [];
  }

  /**
   * Detached fetch for the "no area" view: active tasks filed nowhere - no
   * area, no project - excluding the inbox (its own unfiled surface).
   */
  async function loadNoArea(): Promise<TodoRow[]> {
    await getSessionMemo();
    const { data, error: err } = await supabase
      .from("todos")
      .select("*")
      .is("area_id", null)
      .is("project_id", null)
      .not("state", "in", "(inbox,completed,cancelled,logbook)")
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    if (err) {
      error.value = err.message;
      console.error("[vault] loadNoArea failed:", err);
      return [];
    }
    return (data as TodoRow[]) ?? [];
  }

  /**
   * Detached fetch for the Today horizon view: everything scheduled beyond
   * today plus the ongoing lane. Bucketed client-side by utils/horizon.ts.
   */
  async function loadHorizon(): Promise<TodoRow[]> {
    await getSessionMemo();
    const today = todayISO();
    const { data, error: err } = await supabase
      .from("todos")
      .select("*")
      .not("state", "in", "(completed,cancelled,logbook)")
      .or(`start_date.gt.${today},priority.eq.ongoing`)
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("position", { ascending: true });
    if (err) {
      error.value = err.message;
      console.error("[vault] loadHorizon failed:", err);
      return [];
    }
    return (data as TodoRow[]) ?? [];
  }

  async function loadAreaTodos(areaId: string, opts: { force?: boolean } = {}) {
    if (!opts.force && lastLoadedAreaId.value === areaId) return;
    await getSessionMemo();
    // Task-level only: todos anchored directly to the area (project_id null).
    // After the project->task collapse, areas hold tasks directly; this also
    // keeps the area view from showing legacy project sub-todos.
    const { data, error: err } = await supabase
      .from("todos")
      .select("*")
      .eq("area_id", areaId)
      .is("project_id", null)
      .neq("state", "completed")
      .order("priority", { ascending: true, nullsFirst: false })
      .order("position");
    if (err) {
      error.value = err.message;
      console.error("[vault] loadAreaTodos failed:", err);
      return;
    }
    areaTodos.value = data ?? [];
    lastLoadedAreaId.value = areaId;
  }

  // ===========================================================================
  // CRUD - optimistic, with rollback on error
  // ===========================================================================

  type NewTodo = {
    title: string;
    priority?: "P0" | "P1" | "P2" | "ongoing" | null;
    project_id?: string | null;
    area_id?: string | null;
    state?: "inbox" | "anytime" | "today" | "someday";
    deadline?: string | null;
    // Opt-in AI enrichment (quick-capture only). Fires fire-and-forget after
    // insert; the live editor (CaptureBar) leaves this off so it isn't raced.
    enrich?: boolean;
    // Opt-in toast naming where the task landed ("added to today" / "added to
    // <area>"). Quick-add sets this so you always know the destination; the
    // full editor leaves it off (you can see the fields there).
    announce?: boolean;
  };

  async function createTodo(input: NewTodo): Promise<TodoRow | null> {
    await getSessionMemo();
    const { data: sess } = await getSessionMemo();
    const userId = sess.session?.user?.id;
    if (!userId) {
      error.value = "not signed in";
      return null;
    }
    const payload = {
      user_id: userId,
      title: input.title.trim(),
      priority: input.priority ?? null,
      project_id: input.project_id ?? null,
      area_id: input.area_id ?? null,
      state: input.state ?? "anytime",
      deadline: input.deadline ?? null,
    };
    if (!payload.title) return null;

    const { data, error: err } = await supabase
      .from("todos")
      .insert(payload)
      .select()
      .single();
    if (err || !data) {
      error.value = err?.message ?? "insert failed";
      console.error("[vault] createTodo failed:", err);
      return null;
    }
    // Push into any in-memory list this row would belong to. Guard every push
    // with a dedup check: the realtime INSERT subscription also inserts this
    // row, and if its event lands before this response we'd otherwise show the
    // task twice. Both paths must be idempotent.
    const pushUnique = (list: typeof inboxTodos, row: TodoRow) => {
      if (!list.value.some((t) => t.id === row.id)) list.value.unshift(row);
    };
    if (data.state === "inbox") pushUnique(inboxTodos, data);
    if (data.project_id && data.project_id === currentProjectId.value) {
      pushUnique(projectTodos, data);
    }
    if (data.area_id && data.area_id === currentAreaId.value) {
      pushUnique(areaTodos, data);
    }
    // Today list: include if matches the today filter
    const fitsToday = belongsInToday(data);
    if (fitsToday) pushUnique(todayTodos, data);
    bumpRev();
    // Tell the user where it landed. Quick-add can drop a task in today / an
    // area / anytime depending on context, and the destination was previously
    // invisible - this names it.
    if (input.announce) {
      const label = data.project_id
        ? (projects.value.find((p) => p.id === data.project_id)?.name ??
          "a project")
        : data.area_id
          ? (areas.value.find((a) => a.id === data.area_id)?.name ?? "an area")
          : data.state === "inbox"
            ? "inbox"
            : fitsToday
              ? "today"
              : data.state === "someday"
                ? "someday"
                : "anytime";
      const { useToastStore } = await import("./toast");
      useToastStore().show(`added to ${label.toLowerCase()}`);
    }
    // Fire-and-forget AI enrichment for quick-capture (title-only) tasks. Never
    // awaited; degrades to a no-op if the edge function / API key is absent.
    if (input.enrich && data.title.trim().length >= 3) {
      void invokeEnrich(data.id);
    }
    return data;
  }

  async function toggleComplete(todo: TodoRow): Promise<void> {
    await getSessionMemo();
    const wasCompleted = todo.state === "completed";
    const nextState = wasCompleted ? "anytime" : "completed";
    const nextCompletedAt = wasCompleted ? null : new Date().toISOString();
    // Optimistic update across every list
    applyToAllLists(todo.id, (t) => {
      t.state = nextState;
      t.completed_at = nextCompletedAt;
    });
    // If newly completed, drop from active-only lists
    if (!wasCompleted) {
      todayTodos.value = todayTodos.value.filter((t) => t.id !== todo.id);
      projectTodos.value = projectTodos.value.filter((t) => t.id !== todo.id);
      areaTodos.value = areaTodos.value.filter((t) => t.id !== todo.id);
      inboxTodos.value = inboxTodos.value.filter((t) => t.id !== todo.id);
    }
    const { error: err } = await supabase
      .from("todos")
      .update({ state: nextState, completed_at: nextCompletedAt })
      .eq("id", todo.id);
    if (err) {
      error.value = err.message;
      console.error("[vault] toggleComplete failed:", err);
      // Rollback by re-fetching the affected slice would be simplest;
      // for now log loud and let the next refresh reconcile.
      return;
    }
    bumpRev();
    // Completing a reservoir-fed task refills that area's feed (apply -> 5,
    // share -> 4). Dynamic import avoids a static circular dep at store init.
    const meta = (todo.metadata ?? {}) as { reservoir?: boolean };
    if (!wasCompleted && meta.reservoir) {
      const { useReservoirStore } = await import("./reservoir");
      void useReservoirStore().refillFeedForArea(todo.area_id);
    }
  }

  async function deleteTodoWithUndo(todo: TodoRow): Promise<void> {
    // Stash the row + reinsert on undo. Lazy-import the toast store to avoid
    // circular dep on app init.
    const { useToastStore } = await import("./toast");
    const toast = useToastStore();
    const snapshot = { ...todo };
    await deleteTodo(todo);
    toast.show(`deleted "${truncate(todo.title, 40)}"`, {
      label: "undo",
      run: async () => {
        const { id, ...rest } = snapshot;
        const { data } = await supabase
          .from("todos")
          .insert({ id, ...rest } as never)
          .select()
          .single();
        if (data) {
          // re-broadcast to whichever lists it belonged to via the loader paths
          if (snapshot.state === "inbox") inboxTodos.value.unshift(data);
          if (
            snapshot.project_id &&
            snapshot.project_id === currentProjectId.value
          )
            projectTodos.value.unshift(data);
          if (snapshot.area_id && snapshot.area_id === currentAreaId.value)
            areaTodos.value.unshift(data);
          if (
            belongsInToday(data) &&
            !todayTodos.value.some((t) => t.id === data.id)
          )
            todayTodos.value.unshift(data);
        }
      },
    });
  }

  function truncate(s: string, n: number) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  async function deleteTodo(todo: TodoRow): Promise<void> {
    await getSessionMemo();
    // Optimistic removal from every list
    todayTodos.value = todayTodos.value.filter((t) => t.id !== todo.id);
    inboxTodos.value = inboxTodos.value.filter((t) => t.id !== todo.id);
    projectTodos.value = projectTodos.value.filter((t) => t.id !== todo.id);
    areaTodos.value = areaTodos.value.filter((t) => t.id !== todo.id);
    const { error: err } = await supabase
      .from("todos")
      .delete()
      .eq("id", todo.id);
    if (err) {
      error.value = err.message;
      console.error("[vault] deleteTodo failed:", err);
    }
    bumpRev();
  }

  /**
   * Patch a todo. Returns whether the server CONFIRMED the write.
   *
   * Three things matter here and each fixes a way edits were being lost:
   *  1. The patch is staged to a synchronous write-ahead log before anything is
   *     awaited, so a phone that kills the page mid-request still has it.
   *  2. The optimistic mirror is applied before `await getSessionMemo()`, not
   *     after - callers that read the row straight after (CaptureBar deciding
   *     whether a draft is empty) used to see a stale row and discard real work.
   *  3. `.select("id")` makes the write verifiable. A bare update returns
   *     {data:null,error:null} even when RLS matched ZERO rows - an expired
   *     session on a long-backgrounded PWA silently wrote nothing.
   */
  async function updateTodo(
    id: string,
    patch: Partial<TodoRow>,
  ): Promise<boolean> {
    stage(id, patch as PendingPatch);
    applyToAllLists(id, (t) => Object.assign(t, patch));
    // Re-evaluate which in-memory lists this row belongs to NOW. Covers: a date
    // being cleared (drop out of Today on the spot), an area/project being
    // assigned (drop out of Inbox immediately), priority changes, etc. - no
    // page refresh needed.
    reconcileListsMembership(id);
    bumpRev();

    await getSessionMemo();
    const { data, error: err } = await supabase
      .from("todos")
      .update(patch)
      .eq("id", id)
      .select("id");
    const wrote = !err && Array.isArray(data) && data.length > 0;
    if (!wrote) {
      error.value = err?.message ?? "update matched no rows";
      console.error("[vault] updateTodo failed:", err ?? "0 rows", id, patch);
      const { useToastStore } = await import("./toast");
      useToastStore().show("couldn't save - will retry");
      return false;
    }
    settle(id, patch as PendingPatch);
    return true;
  }

  /**
   * Re-send anything the write-ahead log still holds (load / reconnect / focus).
   * Single-flight: three triggers (auth watcher, "online", visibilitychange) can
   * fire together, and two concurrent replays would send the same patch twice.
   */
  let replayInFlight: Promise<number> | null = null;
  function replayPending(): Promise<number> {
    if (replayInFlight) return replayInFlight;
    replayInFlight = runReplay().finally(() => {
      replayInFlight = null;
    });
    return replayInFlight;
  }
  async function runReplay(): Promise<number> {
    const { data: sess } = await getSessionMemo();
    if (!sess.session?.user?.id) return 0;
    return replay(async (id, patch) => {
      const { data, error: err } = await supabase
        .from("todos")
        .update(patch as Partial<TodoRow>)
        .eq("id", id)
        .select("id");
      const ok = !err && Array.isArray(data) && data.length > 0;
      if (ok) {
        // replay() settles the log entry itself.
        applyToAllLists(id, (t) => Object.assign(t, patch));
        reconcileListsMembership(id);
        bumpRev();
      }
      return ok;
    });
  }

  /**
   * Bulk reorder + (optional) re-priority + (optional) state move - one round
   * trip to Supabase via a single upsert per row. Used by kanban drag-drop.
   */
  async function reorderTodos(
    updates: Array<{
      id: string;
      position: number;
      priority?: TodoRow["priority"];
      state?: TodoRow["state"];
    }>,
  ): Promise<void> {
    await getSessionMemo();
    // Optimistic local mirror
    for (const u of updates) {
      applyToAllLists(u.id, (t) => {
        t.position = u.position;
        if (u.priority !== undefined) t.priority = u.priority;
        if (u.state !== undefined) t.state = u.state;
      });
      // A drag that changes priority or state can change which lists the row
      // belongs to (e.g. dropping P0->P1 makes it no longer match Today; a
      // state move out of inbox must remove it there). Re-evaluate membership on
      // the spot - same contract as updateTodo. Without this the row goes stale
      // or "disappears" from a list until refresh.
      if (u.priority !== undefined || u.state !== undefined) {
        reconcileListsMembership(u.id);
      }
    }
    // Issue updates in parallel
    const results = await Promise.all(
      updates.map((u) =>
        supabase
          .from("todos")
          .update({
            position: u.position,
            ...(u.priority !== undefined ? { priority: u.priority } : {}),
            ...(u.state !== undefined ? { state: u.state } : {}),
          } as never)
          .eq("id", u.id),
      ),
    );
    const errors = results.filter((r) => r.error);
    if (errors.length) {
      error.value = errors[0]!.error!.message;
      console.error("[vault] reorderTodos failed:", errors);
    }
    bumpRev();
  }

  /**
   * Bulk edit N selected todos in one round trip. Same optimistic +
   * reconcile contract as updateTodo. Used by the multi-select bulk bar.
   */
  async function bulkUpdate(
    ids: string[],
    patch: Partial<TodoRow>,
  ): Promise<void> {
    if (!ids.length) return;
    await getSessionMemo();
    for (const id of ids) applyToAllLists(id, (t) => Object.assign(t, patch));
    for (const id of ids) reconcileListsMembership(id);
    const { error: err } = await supabase
      .from("todos")
      .update(patch)
      .in("id", ids);
    if (err) {
      error.value = err.message;
      console.error("[vault] bulkUpdate failed:", err);
    }
    bumpRev();
  }

  /** Bulk complete. Mirrors toggleComplete, including the reservoir refill. */
  async function bulkComplete(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await getSessionMemo();
    const completed_at = new Date().toISOString();
    for (const id of ids) {
      applyToAllLists(id, (t) => {
        t.state = "completed";
        t.completed_at = completed_at;
      });
    }
    for (const l of [todayTodos, projectTodos, areaTodos, inboxTodos]) {
      l.value = l.value.filter((t) => !ids.includes(t.id));
    }
    const { data, error: err } = await supabase
      .from("todos")
      .update({ state: "completed", completed_at })
      .in("id", ids)
      .select();
    if (err) {
      error.value = err.message;
      console.error("[vault] bulkComplete failed:", err);
      return;
    }
    bumpRev();
    const areaIds = new Set<string>();
    for (const row of (data ?? []) as TodoRow[]) {
      const meta = (row.metadata ?? {}) as { reservoir?: boolean };
      if (meta.reservoir && row.area_id) areaIds.add(row.area_id);
    }
    if (areaIds.size) {
      const { useReservoirStore } = await import("./reservoir");
      const store = useReservoirStore();
      for (const areaId of areaIds) void store.refillFeedForArea(areaId);
    }
  }

  /** Bulk delete with a single undo toast that reinserts every row. */
  async function bulkDelete(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await getSessionMemo();
    for (const l of [todayTodos, inboxTodos, projectTodos, areaTodos]) {
      l.value = l.value.filter((t) => !ids.includes(t.id));
    }
    // DELETE ... RETURNING doubles as the undo snapshot, so rows selected in
    // detached views (Anytime/Someday/...) can be restored too.
    const { data, error: err } = await supabase
      .from("todos")
      .delete()
      .in("id", ids)
      .select();
    if (err) {
      error.value = err.message;
      console.error("[vault] bulkDelete failed:", err);
    }
    bumpRev();
    const snapshots = (data ?? []) as TodoRow[];
    if (!snapshots.length) return;
    const { useToastStore } = await import("./toast");
    useToastStore().show(
      snapshots.length === 1
        ? `deleted "${truncate(snapshots[0]!.title, 40)}"`
        : `deleted ${snapshots.length} tasks`,
      {
        label: "undo",
        run: async () => {
          const { data: restored } = await supabase
            .from("todos")
            .insert(snapshots as never)
            .select();
          for (const row of (restored ?? []) as TodoRow[]) {
            if (row.state === "inbox") inboxTodos.value.unshift(row);
            if (row.project_id && row.project_id === currentProjectId.value)
              projectTodos.value.unshift(row);
            if (row.area_id && row.area_id === currentAreaId.value)
              areaTodos.value.unshift(row);
            if (
              belongsInToday(row) &&
              !todayTodos.value.some((t) => t.id === row.id)
            )
              todayTodos.value.unshift(row);
          }
          bumpRev();
        },
      },
    );
  }

  /**
   * Rename a project. Optional re-slug if name was the source of the slug.
   * Slug stays stable unless explicitly passed - URL routes depend on it.
   */
  async function renameProject(
    id: string,
    name: string,
    slug?: string,
  ): Promise<void> {
    await getSessionMemo();
    const patch: Record<string, unknown> = { name: name.trim() };
    if (slug)
      patch.slug = slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
    const p = projects.value.find((x) => x.id === id);
    if (p) {
      p.name = patch.name as string;
      if (patch.slug) p.slug = patch.slug as string;
    }
    const { error: err } = await supabase
      .from("projects")
      .update(patch as never)
      .eq("id", id);
    if (err) {
      error.value = err.message;
      console.error("[vault] renameProject failed:", err);
    }
  }

  /**
   * Delete a project with todo handling: either cascade-delete the todos,
   * orphan them (set project_id null but keep area_id), or move to another
   * project.
   */
  async function deleteProject(
    id: string,
    opts: {
      todosMode: "cascade" | "orphan" | "move";
      moveToProjectId?: string;
    },
  ): Promise<void> {
    await getSessionMemo();
    if (opts.todosMode === "cascade") {
      await supabase.from("todos").delete().eq("project_id", id);
    } else if (opts.todosMode === "orphan") {
      await supabase
        .from("todos")
        .update({ project_id: null } as never)
        .eq("project_id", id);
    } else if (opts.todosMode === "move" && opts.moveToProjectId) {
      // Move todos to a different project + sync area_id
      const target = projects.value.find((p) => p.id === opts.moveToProjectId);
      await supabase
        .from("todos")
        .update({
          project_id: opts.moveToProjectId,
          ...(target ? { area_id: target.area_id } : {}),
        } as never)
        .eq("project_id", id);
    }
    // Optimistic: drop from local
    projects.value = projects.value.filter((p) => p.id !== id);
    // Clear any in-memory todo references
    for (const list of [
      todayTodos.value,
      inboxTodos.value,
      projectTodos.value,
      areaTodos.value,
    ]) {
      if (opts.todosMode === "cascade") {
        // Remove rows that pointed at this project
        const idx = list.findIndex((t) => t.project_id === id);
        if (idx >= 0) {
          for (let i = list.length - 1; i >= 0; i--) {
            if (list[i]!.project_id === id) list.splice(i, 1);
          }
        }
      } else if (opts.todosMode === "orphan") {
        for (const t of list) {
          if (t.project_id === id) t.project_id = null;
        }
      } else if (opts.todosMode === "move" && opts.moveToProjectId) {
        for (const t of list) {
          if (t.project_id === id) t.project_id = opts.moveToProjectId;
        }
      }
    }
    const { error: err } = await supabase
      .from("projects")
      .delete()
      .eq("id", id);
    if (err) {
      error.value = err.message;
      console.error("[vault] deleteProject failed:", err);
    }
  }

  /**
   * Rename an area. Slug stays stable unless explicitly passed.
   */
  async function renameArea(
    id: string,
    name: string,
    slug?: string,
  ): Promise<void> {
    await getSessionMemo();
    const patch: Record<string, unknown> = { name: name.trim() };
    if (slug)
      patch.slug = slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
    const a = areas.value.find((x) => x.id === id);
    if (a) {
      a.name = patch.name as string;
      if (patch.slug) a.slug = patch.slug as string;
    }
    const { error: err } = await supabase
      .from("areas")
      .update(patch as never)
      .eq("id", id);
    if (err) {
      error.value = err.message;
      console.error("[vault] renameArea failed:", err);
    }
  }

  /**
   * Delete an area. Refuses if the area has any projects or todos.
   * Returns {ok, reason?} so the caller can show a useful message.
   */
  async function deleteArea(
    id: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    await getSessionMemo();
    const projectCount = projects.value.filter((p) => p.area_id === id).length;
    if (projectCount > 0) {
      return {
        ok: false,
        reason: `area has ${projectCount} project${projectCount === 1 ? "" : "s"}. delete or move them first.`,
      };
    }
    const { count: todoCount } = await supabase
      .from("todos")
      .select("id", { count: "exact", head: true })
      .eq("area_id", id);
    if ((todoCount ?? 0) > 0) {
      return {
        ok: false,
        reason: `area has ${todoCount} todo${todoCount === 1 ? "" : "s"}. move them first.`,
      };
    }
    areas.value = areas.value.filter((a) => a.id !== id);
    const { error: err } = await supabase.from("areas").delete().eq("id", id);
    if (err) {
      error.value = err.message;
      console.error("[vault] deleteArea failed:", err);
      return { ok: false, reason: err.message };
    }
    return { ok: true };
  }

  async function createProject(
    areaId: string,
    name: string,
  ): Promise<string | null> {
    await getSessionMemo();
    const { data: sess } = await getSessionMemo();
    const userId = sess.session?.user?.id;
    if (!userId) return null;
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    // Append timestamp suffix to avoid slug collisions
    const finalSlug = projects.value.find((p) => p.slug === slug)
      ? `${slug}-${Date.now().toString(36).slice(-4)}`
      : slug;
    const position = projects.value.filter((p) => p.area_id === areaId).length;
    const { data, error: err } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        area_id: areaId,
        name: name.trim(),
        slug: finalSlug,
        position,
      } as never)
      .select()
      .single();
    if (err || !data) {
      error.value = err?.message ?? "create project failed";
      console.error("[vault] createProject failed:", err);
      return null;
    }
    projects.value.push(data);
    return (data as { id: string }).id;
  }

  /**
   * Bulk reorder projects in the sidebar. Updates may also move projects
   * between areas (drag from area A onto area B's list).
   */
  async function reorderProjects(
    updates: Array<{ id: string; position: number; area_id?: string }>,
  ): Promise<void> {
    await getSessionMemo();
    // Optimistic local mirror
    for (const u of updates) {
      const p = projects.value.find((x) => x.id === u.id);
      if (p) {
        p.position = u.position;
        if (u.area_id !== undefined) p.area_id = u.area_id;
      }
    }
    const results = await Promise.all(
      updates.map((u) =>
        supabase
          .from("projects")
          .update({
            position: u.position,
            ...(u.area_id !== undefined ? { area_id: u.area_id } : {}),
          } as never)
          .eq("id", u.id),
      ),
    );
    const errors = results.filter((r) => r.error);
    if (errors.length) {
      error.value = errors[0]!.error!.message;
      console.error("[vault] reorderProjects failed:", errors);
    }
  }

  /**
   * Bulk reorder areas in the sidebar (manual, user-chosen order). Mirrors
   * reorderProjects; the areas table already has a `position` column.
   */
  async function reorderAreas(
    updates: Array<{ id: string; position: number }>,
  ): Promise<void> {
    await getSessionMemo();
    for (const u of updates) {
      const a = areas.value.find((x) => x.id === u.id);
      if (a) a.position = u.position;
    }
    // Keep the in-memory array in the new order so views that read it directly
    // (Areas.vue sorts defensively, but AreasNav renders `areas` as-is) match.
    areas.value = [...areas.value].sort((x, y) => x.position - y.position);
    const results = await Promise.all(
      updates.map((u) =>
        supabase
          .from("areas")
          .update({ position: u.position } as never)
          .eq("id", u.id),
      ),
    );
    const errors = results.filter((r) => r.error);
    if (errors.length) {
      error.value = errors[0]!.error!.message;
      console.error("[vault] reorderAreas failed:", errors);
    }
  }

  function applyToAllLists(id: string, fn: (t: TodoRow) => void) {
    for (const list of [
      todayTodos.value,
      inboxTodos.value,
      projectTodos.value,
      areaTodos.value,
    ]) {
      const t = list.find((x) => x.id === id);
      if (t) fn(t);
    }
  }

  // Track currently-viewed scope so createTodo can land in the active list
  const currentProjectId = ref<string | null>(null);
  const currentAreaId = ref<string | null>(null);

  // -- Live list-membership reconciliation -----------------------------------
  // After a todo is edited, decide whether it still belongs in each in-memory
  // list and add/remove it so the current view updates without a refresh.
  function matchesToday(t: TodoRow): boolean {
    return belongsInToday(t);
  }
  function syncList(
    list: typeof inboxTodos,
    row: TodoRow,
    shouldBeIn: boolean,
  ) {
    const idx = list.value.findIndex((t) => t.id === row.id);
    if (shouldBeIn && idx === -1) list.value.push(row);
    else if (!shouldBeIn && idx !== -1) list.value.splice(idx, 1);
  }
  function reconcileListsMembership(id: string) {
    // Resolve the freshest copy of the row from whichever list holds it
    // (applyToAllLists already merged the patch into those copies).
    let row: TodoRow | undefined;
    for (const l of [inboxTodos, todayTodos, areaTodos, projectTodos]) {
      const f = l.value.find((t) => t.id === id);
      if (f) {
        row = f;
        break;
      }
    }
    if (!row) return;
    const active = row.state !== "completed" && row.state !== "cancelled";
    syncList(
      inboxTodos,
      row,
      row.state === "inbox" && !row.area_id && !row.project_id,
    );
    syncList(todayTodos, row, matchesToday(row));
    syncList(
      areaTodos,
      row,
      active &&
        !!row.area_id &&
        row.area_id === currentAreaId.value &&
        !row.project_id,
    );
    syncList(
      projectTodos,
      row,
      active && !!row.project_id && row.project_id === currentProjectId.value,
    );
  }

  // ===========================================================================
  // Realtime subscriptions - one channel for the schema's writes per user
  // ===========================================================================

  let realtimeChan: ReturnType<typeof supabase.channel> | null = null;

  async function subscribeRealtime() {
    if (realtimeChan) return;
    const { data: sess } = await getSessionMemo();
    const userId = sess.session?.user?.id;
    if (!userId) return;
    realtimeChan = supabase
      .channel(`vault-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "hmart",
          table: "todos",
          filter: `user_id=eq.${userId}`,
        },
        (payload) =>
          applyTodoChange(
            payload as unknown as {
              eventType: "INSERT" | "UPDATE" | "DELETE";
              new: TodoRow;
              old: TodoRow;
            },
          ),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "hmart",
          table: "projects",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadAreasAndProjects(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "hmart",
          table: "areas",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadAreasAndProjects(),
      )
      .subscribe();
  }

  function unsubscribeRealtime() {
    if (realtimeChan) {
      void supabase.removeChannel(realtimeChan);
      realtimeChan = null;
    }
  }

  // Auth-state bridge: the very first loadAreasAndProjects() can fire before the
  // session has hydrated (mobile/PWA cold starts especially), in which case it
  // bails without caching. Once auth resolves we force a refetch so areas and
  // projects populate. SIGNED_OUT resets the cache so a re-login starts clean.
  //
  // IMPORTANT: the callback must NOT call other supabase auth methods inline -
  // loadAreasAndProjects() awaits getSession(), and calling it while the
  // onAuthStateChange callback still holds the auth lock deadlocks every
  // subsequent getSession() (including the router's beforeEach guard, which
  // makes navigation silently hang). We defer with setTimeout(0) so the work
  // runs after the callback returns and the lock is released.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      areasAndProjectsLoaded.value = false;
      return;
    }
    if (
      session?.user &&
      (event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED")
    ) {
      setTimeout(() => void loadAreasAndProjects({ force: true }), 0);
    }
  });

  function applyTodoChange(payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE";
    new: TodoRow;
    old: TodoRow;
  }) {
    if (payload.eventType === "DELETE") {
      const id = payload.old.id;
      todayTodos.value = todayTodos.value.filter((t) => t.id !== id);
      inboxTodos.value = inboxTodos.value.filter((t) => t.id !== id);
      projectTodos.value = projectTodos.value.filter((t) => t.id !== id);
      areaTodos.value = areaTodos.value.filter((t) => t.id !== id);
      return;
    }
    const row = payload.new;
    // Update-in-place across every list; tolerate missing entries
    applyToAllLists(row.id, (t) => Object.assign(t, row));
    // For INSERT, push into matching scope lists if not already there
    if (payload.eventType === "INSERT") {
      if (
        row.state === "inbox" &&
        !inboxTodos.value.find((t) => t.id === row.id)
      ) {
        inboxTodos.value.unshift(row);
      }
      if (
        row.project_id === currentProjectId.value &&
        !projectTodos.value.find((t) => t.id === row.id)
      ) {
        projectTodos.value.unshift(row);
      }
      if (
        row.area_id === currentAreaId.value &&
        !areaTodos.value.find((t) => t.id === row.id)
      ) {
        areaTodos.value.unshift(row);
      }
    }
    // Normalize membership for realtime INSERT/UPDATE (e.g. an edit from another
    // session, or the echo of our own write): drop the row from lists it no
    // longer belongs to and add it to ones it now matches. Mirrors the local
    // reconcile in updateTodo/reorderTodos so cross-client state never drifts.
    reconcileListsMembership(row.id);
    bumpRev();
  }

  function reset() {
    areas.value = [];
    projects.value = [];
    todayTodos.value = [];
    inboxTodos.value = [];
    projectTodos.value = [];
    areaTodos.value = [];
    error.value = null;
  }

  return {
    areas,
    projects,
    todayTodos,
    inboxTodos,
    projectTodos,
    areaTodos,
    tags,
    loading,
    error,
    rev,
    currentProjectId,
    currentAreaId,
    projectsByArea,
    areaBySlug,
    projectBySlug,
    loadAreasAndProjects,
    createTag,
    loadToday,
    loadInbox,
    loadProjectTodos,
    loadAreaTodos,
    loadByState,
    loadNoArea,
    loadHorizon,
    createTodo,
    toggleComplete,
    deleteTodo,
    deleteTodoWithUndo,
    updateTodo,
    replayPending,
    reorderTodos,
    bulkUpdate,
    bulkComplete,
    bulkDelete,
    reorderProjects,
    reorderAreas,
    renameProject,
    deleteProject,
    renameArea,
    deleteArea,
    createProject,
    subscribeRealtime,
    unsubscribeRealtime,
    reset,
  };
});
