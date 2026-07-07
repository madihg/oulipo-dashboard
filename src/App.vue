<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "./composables/useAuth";
import { useVaultStore } from "./stores/vault";
import AreasNav from "./components/AreasNav.vue";
import CommandPalette from "./components/CommandPalette.vue";
import ToastBar from "./components/ToastBar.vue";
import CaptureBar from "./components/CaptureBar.vue";
import InstallPrompt from "./components/InstallPrompt.vue";
import MobileTabBar from "./components/MobileTabBar.vue";
import ShortcutsHelp from "./components/ShortcutsHelp.vue";
import TodoEditorModal from "./components/TodoEditorModal.vue";
import { useKeyboardShortcuts } from "./composables/useKeyboardShortcuts";
import { useReservoirStore } from "./stores/reservoir";

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
    } else vault.unsubscribeRealtime();
  },
  { immediate: true },
);
onMounted(() => {
  if (isAuthed.value) void vault.subscribeRealtime();
});
onBeforeUnmount(() => vault.unsubscribeRealtime());

const isAuthRoute = computed(
  () => route.path === "/login" || route.path === "/auth/callback",
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
</script>

<template>
  <div class="min-h-screen">
    <!-- Auth + showcase routes: no chrome, no width constraint -->
    <main v-if="isAuthRoute" class="reading-column">
      <router-view />
    </main>

    <!-- Authed routes: app shell -->
    <div v-else class="app-shell">
      <aside>
        <div class="flex items-baseline justify-between mb-s-5">
          <router-link
            to="/today"
            class="interactive font-display text-xl lowercase"
            >hmart</router-link
          >
          <div class="flex items-center gap-s-1">
            <button
              class="d-kbd interactive"
              title="search (⌘k)"
              @click="paletteRef?.open()"
            >
              ⌘k
            </button>
            <button
              class="d-kbd interactive"
              title="keyboard shortcuts (?)"
              aria-label="keyboard shortcuts"
              @click="helpRef?.show()"
            >
              ?
            </button>
          </div>
        </div>

        <nav class="d-nav-primary flex flex-col gap-s-1 mb-s-5">
          <router-link
            v-for="link in primaryNav"
            :key="link.path"
            :to="link.path"
            class="d-nav-link interactive"
            :class="{ 'd-nav-link-active': isActive(link.path) }"
          >
            {{ link.label }}
          </router-link>
        </nav>

        <div class="d-nav-section">
          <p class="d-nav-caption">areas</p>
          <AreasNav />
        </div>

        <div class="d-nav-section">
          <p class="d-nav-caption">reservoirs</p>
          <nav class="flex flex-col gap-s-1" aria-label="reservoirs">
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

        <div
          v-if="isAuthed"
          class="mt-s-5 d-nav-section font-mono text-meta text-[var(--sl-400)] lowercase"
        >
          <p class="truncate">{{ user?.email }}</p>
          <button class="interactive mt-s-1 lowercase" @click="doSignOut">
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
    <TodoEditorModal />
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
  font-size: 0.8125rem;
  /* Solid, readable idle - no longer the washed-out 50% grey. Hierarchy comes
     from the cobalt active state (rail + tint + colored text), not by fading
     idle links out. */
  color: var(--sl-800);
  text-transform: lowercase;
  padding: 3px 8px;
  text-decoration: none;
  border-left: 2px solid transparent;
  border-radius: 0 4px 4px 0;
  transition:
    color 120ms ease,
    border-color 120ms ease,
    background 120ms ease;
}
.d-nav-link:hover {
  color: var(--sl-900);
  background: var(--sl-100);
}
.d-nav-link-active {
  color: var(--acc-carnation-text);
  font-weight: 600;
  border-left-color: var(--acc-carnation);
  background: var(--cobalt-tint);
}
.d-nav-section {
  border-top: 1px solid var(--sl-200);
  padding-top: 12px;
  margin-top: 12px;
}
.d-nav-caption {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sl-400);
  margin-bottom: 8px;
}
.d-kbd {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  color: var(--sl-500);
  background: transparent;
  border: 1px solid var(--sl-200);
  padding: 2px 6px;
  border-radius: 4px;
}
.d-kbd:hover {
  background: var(--sl-100);
  color: var(--sl-900);
}
</style>
