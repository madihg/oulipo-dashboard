<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "./composables/useAuth";
import { useVaultStore } from "./stores/vault";
import type { TodoState } from "./types/database";
import AreasNav from "./components/AreasNav.vue";
import CommandPalette from "./components/CommandPalette.vue";
import ToastBar from "./components/ToastBar.vue";
import CaptureBar from "./components/CaptureBar.vue";
import InstallPrompt from "./components/InstallPrompt.vue";
import MobileTabBar from "./components/MobileTabBar.vue";
import ShortcutsHelp from "./components/ShortcutsHelp.vue";
import { MOD } from "./lib/platform";
import TodoEditorModal from "./components/TodoEditorModal.vue";
import WhenDropPicker from "./components/WhenDropPicker.vue";
import { openTaskAction } from "./composables/useOpenTask";
import BulkBar from "./components/BulkBar.vue";
import { useKeyboardShortcuts } from "./composables/useKeyboardShortcuts";
import { useReservoirStore } from "./stores/reservoir";
import { useToastStore } from "./stores/toast";
import { useSelectionStore } from "./stores/selection";
import { whenPatch, type WhenKey, type WhenPatch } from "./utils/when";

// Sidebar visibility + per-section collapse. Persisted so the shape of the nav
// survives reloads; sections default open for a first-time user.
const NAV_PREFS_KEY = "hmart.navPrefs";
type NavSection = "areas" | "reservoirs" | "settings";
const navHidden = ref(false);
const sectionOpen = reactive<Record<NavSection, boolean>>({
  areas: true,
  reservoirs: true,
  settings: true,
});
try {
  const raw = localStorage.getItem(NAV_PREFS_KEY);
  if (raw) {
    const saved = JSON.parse(raw) as {
      hidden?: boolean;
      sections?: Partial<Record<NavSection, boolean>>;
    };
    navHidden.value = Boolean(saved.hidden);
    for (const k of ["areas", "reservoirs", "settings"] as NavSection[]) {
      if (typeof saved.sections?.[k] === "boolean")
        sectionOpen[k] = saved.sections[k] as boolean;
    }
  }
} catch {
  /* corrupt or unavailable storage just means defaults */
}
watch(
  [navHidden, sectionOpen],
  () => {
    try {
      localStorage.setItem(
        NAV_PREFS_KEY,
        JSON.stringify({
          hidden: navHidden.value,
          sections: { ...sectionOpen },
        }),
      );
    } catch {
      /* ignore quota / private-mode failures */
    }
  },
  { deep: true },
);
function toggleSection(key: NavSection) {
  sectionOpen[key] = !sectionOpen[key];
}

const route = useRoute();
const router = useRouter();
const { isAuthed, signOut, user } = useAuth();
const vault = useVaultStore();
const reservoir = useReservoirStore();

watch(
  isAuthed,
  (authed) => {
    if (authed) {
      void vault.subscribeRealtime();
      // Top up the reservoir feeds on sign-in / load (apply -> 5, share -> 4).
      void reservoir.ensureAllFeeds();
      // Re-send any edit the write-ahead log still holds (a save that failed,
      // or that the phone killed before it left).
      void vault.replayPending();
    } else vault.unsubscribeRealtime();
  },
  { immediate: true },
);
// Retry queued writes when the network or the tab comes back.
function retryPending() {
  if (isAuthed.value) void vault.replayPending();
}
function onVisible() {
  if (document.visibilityState === "visible") retryPending();
}
onMounted(() => {
  if (isAuthed.value) void vault.subscribeRealtime();
  window.addEventListener("online", retryPending);
  window.addEventListener("visibilitychange", onVisible);
});
onBeforeUnmount(() => {
  vault.unsubscribeRealtime();
  window.removeEventListener("online", retryPending);
  window.removeEventListener("visibilitychange", onVisible);
});

const isAuthRoute = computed(
  () => route.path === "/login" || route.path === "/auth/callback",
);

// Multi-select is per-view: navigating away would leave invisible rows
// selected, and a later bulk delete/complete would silently hit them.
const selection = useSelectionStore();
watch(
  () => route.path,
  () => selection.clear(),
);

const paletteRef = ref<InstanceType<typeof CommandPalette> | null>(null);
const captureRef = ref<InstanceType<typeof CaptureBar> | null>(null);
const helpRef = ref<InstanceType<typeof ShortcutsHelp> | null>(null);

// Global keyboard shortcuts (desktop). Inert without a hardware keyboard.
useKeyboardShortcuts(router, {
  capture: () => captureRef.value?.open(),
  search: () => paletteRef.value?.open(),
  help: () => helpRef.value?.toggle(),
});

async function doSignOut() {
  await signOut();
  void router.replace("/login");
}

function isActive(path: string) {
  return route.path === path;
}

const primaryNav: Array<{ path: string; label: string }> = [
  { path: "/today", label: "today" },
  { path: "/inbox", label: "inbox" },
  { path: "/anytime", label: "anytime" },
  { path: "/upcoming", label: "upcoming" },
  { path: "/someday", label: "someday" },
  { path: "/logbook", label: "logbook" },
];

// Drag a task row onto a nav item to reschedule it (Things-style). The lists
// with a date-free "when" resolve on the drop itself; inbox and logbook are not
// scheduling targets at all.
const TODO_MIME = "application/x-hmart-todo";
const WHEN_MIME = "application/x-hmart-when";
const navDropWhen: Record<string, WhenKey> = {
  "/today": "today",
  "/anytime": "clear",
  "/someday": "someday",
};
// Upcoming is the exception: "upcoming" is not a date, so the drop cannot
// finish on its own. Dropping there raises the calendar at the pointer and the
// gesture completes in one motion instead of bouncing through the editor.
const NEEDS_DATE = "/upcoming";
const dragOverNav = ref<string | null>(null);
function onNavDragOver(e: DragEvent, path: string) {
  if (!(path in navDropWhen) && path !== NEEDS_DATE) return;
  // getData is unreadable during dragover; gate on the type list only.
  if (!e.dataTransfer?.types.includes(TODO_MIME)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  dragOverNav.value = path;
}
function onNavDragLeave(path: string) {
  if (dragOverNav.value === path) dragOverNav.value = null;
}
async function onNavDrop(e: DragEvent, path: string) {
  dragOverNav.value = null;
  const id = e.dataTransfer?.getData(TODO_MIME);
  if (!id) return;

  if (path === NEEDS_DATE) {
    e.preventDefault();
    const raw = e.dataTransfer?.getData(WHEN_MIME);
    let cur: Partial<{
      state: TodoState;
      start_date: string | null;
      evening: boolean;
    }> = {};
    try {
      // JSON.parse("null") SUCCEEDS and returns null, so the truthiness check
      // has to be on the parsed value, not just on the raw string.
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") cur = parsed as typeof cur;
    } catch {
      // A drag from somewhere that does not carry a schedule; open empty.
    }
    drop.id = id;
    drop.state = cur.state ?? "anytime";
    drop.startDate = cur.start_date ?? null;
    drop.evening = !!cur.evening;
    drop.x = e.clientX;
    drop.y = e.clientY;
    drop.open = true;
    return;
  }

  const key = navDropWhen[path];
  if (!key) return;
  e.preventDefault();
  await vault.updateTodo(id, whenPatch(key) as never);
  useToastStore().show(
    `moved to ${path.slice(1)}`,
    openTaskAction(router, id, path),
  );
}

// The task waiting on a date, plus where to raise the calendar for it.
const drop = reactive({
  open: false,
  id: "" as string,
  x: 0,
  y: 0,
  state: "anytime" as TodoState,
  startDate: null as string | null,
  evening: false,
});
async function onDropPick(patch: WhenPatch) {
  const id = drop.id;
  drop.open = false;
  if (!id) return;
  await vault.updateTodo(id, patch as never);
  useToastStore().show("scheduled", openTaskAction(router, id, "/upcoming"));
}

// "no area" accepts drops too: unfile the task (keep its schedule).
function onNoAreaDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes(TODO_MIME)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  dragOverNav.value = "/no-area";
}
async function onNoAreaDrop(e: DragEvent) {
  dragOverNav.value = null;
  const id = e.dataTransfer?.getData(TODO_MIME);
  if (!id) return;
  e.preventDefault();
  await vault.updateTodo(id, { area_id: null, project_id: null });
  useToastStore().show(
    "moved to no area",
    openTaskAction(router, id, "/no-area"),
  );
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Auth + showcase routes: no chrome, no width constraint -->
    <main v-if="isAuthRoute" class="reading-column">
      <router-view />
    </main>

    <!-- Authed routes: app shell -->
    <div v-else class="app-shell" :class="{ 'nav-hidden': navHidden }">
      <!-- Reveal control, only rendered while the sidebar is hidden. -->
      <button
        v-if="navHidden"
        type="button"
        class="d-nav-reveal interactive"
        title="show sidebar"
        aria-label="show sidebar"
        @click="navHidden = false"
      >
        <span class="chev" aria-hidden="true"></span>
      </button>
      <aside>
        <div class="flex items-baseline justify-between mb-s-4">
          <router-link
            to="/today"
            class="interactive font-display text-xl lowercase"
            >hmart</router-link
          >
          <div class="flex items-center gap-s-1">
            <button
              type="button"
              class="cap d-kbd interactive"
              :title="`search (${MOD} k)`"
              @click="paletteRef?.open()"
            >
              {{ MOD }} k
            </button>
            <button
              type="button"
              class="cap d-kbd interactive"
              title="keyboard shortcuts (?)"
              aria-label="keyboard shortcuts"
              @click="helpRef?.show()"
            >
              ?
            </button>
            <button
              type="button"
              class="d-kbd interactive"
              title="hide sidebar"
              aria-label="hide sidebar"
              @click="navHidden = true"
            >
              <span class="chev chev-left" aria-hidden="true"></span>
            </button>
          </div>
        </div>

        <nav class="d-nav-primary flex flex-col mb-s-4">
          <router-link
            v-for="link in primaryNav"
            :key="link.path"
            :to="link.path"
            class="d-nav-link interactive"
            :class="{
              'd-nav-link-active': isActive(link.path),
              'd-nav-link-drop': dragOverNav === link.path,
            }"
            @dragover="onNavDragOver($event, link.path)"
            @dragleave="onNavDragLeave(link.path)"
            @drop="onNavDrop($event, link.path)"
          >
            {{ link.label }}
          </router-link>
        </nav>

        <div class="d-nav-section">
          <button
            type="button"
            class="cap d-nav-caption d-nav-toggle interactive"
            :aria-expanded="sectionOpen.areas"
            @click="toggleSection('areas')"
          >
            <span
              class="chev"
              :class="{ 'chev-open': sectionOpen.areas }"
              aria-hidden="true"
            ></span>
            areas
          </button>
          <div v-show="sectionOpen.areas">
            <AreasNav />
            <router-link
              to="/no-area"
              class="cap d-nav-noarea interactive"
              :class="{
                'd-nav-noarea-active': isActive('/no-area'),
                'd-nav-link-drop': dragOverNav === '/no-area',
              }"
              @dragover="onNoAreaDragOver"
              @dragleave="onNavDragLeave('/no-area')"
              @drop="onNoAreaDrop"
            >
              no area
            </router-link>
          </div>
        </div>

        <div class="d-nav-section">
          <button
            type="button"
            class="cap d-nav-caption d-nav-toggle interactive"
            :aria-expanded="sectionOpen.reservoirs"
            @click="toggleSection('reservoirs')"
          >
            <span
              class="chev"
              :class="{ 'chev-open': sectionOpen.reservoirs }"
              aria-hidden="true"
            ></span>
            reservoirs
          </button>
          <nav
            v-show="sectionOpen.reservoirs"
            class="flex flex-col"
            aria-label="reservoirs"
          >
            <router-link
              to="/reservoir/apply"
              class="d-nav-link interactive"
              :class="{ 'd-nav-link-active': isActive('/reservoir/apply') }"
            >
              apply
            </router-link>
            <router-link
              to="/reservoir/share"
              class="d-nav-link interactive"
              :class="{ 'd-nav-link-active': isActive('/reservoir/share') }"
            >
              share
            </router-link>
          </nav>
        </div>

        <div class="d-nav-section">
          <button
            type="button"
            class="cap d-nav-caption d-nav-toggle interactive"
            :aria-expanded="sectionOpen.settings"
            @click="toggleSection('settings')"
          >
            <span
              class="chev"
              :class="{ 'chev-open': sectionOpen.settings }"
              aria-hidden="true"
            ></span>
            settings
          </button>
          <router-link
            v-show="sectionOpen.settings"
            to="/system"
            class="d-nav-link interactive"
            :class="{ 'd-nav-link-active': isActive('/system') }"
          >
            system map
          </router-link>
          <router-link
            v-show="sectionOpen.settings"
            to="/settings"
            class="d-nav-link interactive"
            :class="{ 'd-nav-link-active': isActive('/settings') }"
          >
            tags
          </router-link>
        </div>

        <div
          v-if="isAuthed"
          class="mt-s-5 d-nav-section font-mono text-meta text-[var(--ink-40)] lowercase"
        >
          <p class="truncate">{{ user?.email }}</p>
          <button
            type="button"
            class="interactive mt-s-1 lowercase"
            @click="doSignOut"
          >
            sign out
          </button>
        </div>
      </aside>
      <main>
        <router-view />
      </main>

      <!-- Mobile bottom tab bar (< 768px); sidebar hidden via CSS on mobile -->
      <MobileTabBar
        class="m-tabbar-mount"
        @add="captureRef?.open()"
        @search="paletteRef?.open()"
      />
    </div>

    <CommandPalette ref="paletteRef" />
    <CaptureBar v-if="!isAuthRoute" ref="captureRef" />
    <BulkBar v-if="!isAuthRoute" />
    <TodoEditorModal />
    <WhenDropPicker
      :open="drop.open"
      :x="drop.x"
      :y="drop.y"
      :state="drop.state"
      :start-date="drop.startDate"
      :evening="drop.evening"
      @pick="onDropPick"
      @close="drop.open = false"
    />
    <ShortcutsHelp ref="helpRef" />
    <InstallPrompt />
    <ToastBar />
  </div>
</template>

<style scoped>
/* Sidebar nav - dense edition, slate lowercase to match the main panel */
.d-nav-primary {
  margin-top: -2px;
}
.d-nav-link {
  font-size: var(--fs-row);
  /* Solid, readable idle - no longer the washed-out 50% grey. Hierarchy comes
     from the cobalt active state (rail + tint + colored text), not by fading
     idle links out. */
  color: var(--ink-85);
  text-transform: lowercase;
  padding: 2px 8px;
  text-decoration: none;
  border-left: 2px solid transparent;
  border-radius: 0 4px 4px 0;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
.d-nav-link:hover {
  color: var(--ink);
  background: var(--ground-2);
}
.d-nav-link-active {
  color: var(--acc-carnation-text);
  font-weight: 600;
  border-left-color: var(--acc-carnation);
  background: var(--cobalt-tint);
}
.d-nav-link-drop {
  background: var(--cobalt-tint);
  box-shadow: inset 0 0 0 1px var(--metal);
}
/* "no area" sits inside the areas section, so it dresses like an area row:
   the caption (.cap) as an eyebrow, indented past where the drag grips sit,
   slightly muted because it's a pseudo-area. */
.d-nav-noarea {
  display: block;
  letter-spacing: 0.08em;
  text-decoration: none;
  padding: 2px 6px 2px 20px;
  border-radius: 4px;
  margin-top: 1px;
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
.d-nav-noarea:hover {
  color: var(--ink);
  background: var(--ground-2);
}
.d-nav-noarea-active {
  color: var(--acc-carnation-text);
}
.d-nav-section {
  border-top: 1px solid var(--hair);
  padding-top: 8px;
  margin-top: 8px;
}
/* Section eyebrows: the caption with the eyebrow's wider tracking. */
.d-nav-caption {
  letter-spacing: 0.08em;
  color: var(--ink-40);
  margin-bottom: 4px;
}
.d-kbd {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  background: transparent;
  border: 1px solid var(--hair);
  padding: 2px 6px;
  border-radius: 4px;
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
.d-kbd:hover {
  background: var(--ground-2);
  color: var(--ink);
}
/* The hide control points at the edge the sidebar leaves through. */
.chev-left {
  transform: rotate(135deg);
}
</style>
