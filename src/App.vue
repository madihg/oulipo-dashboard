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

const route = useRoute();
const router = useRouter();
const { isAuthed, signOut, user } = useAuth();
const vault = useVaultStore();

watch(
  isAuthed,
  (authed) => {
    if (authed) void vault.subscribeRealtime();
    else vault.unsubscribeRealtime();
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
          <button
            class="d-kbd interactive"
            title="search (⌘k)"
            @click="paletteRef?.open()"
          >
            ⌘k
          </button>
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
          <AreasNav />
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
  color: var(--sl-500);
  text-transform: lowercase;
  padding: 3px 8px;
  text-decoration: none;
  /* 2px left rail: transparent when idle, carnation when active.
     No dot glyph - hierarchy via opacity + the functional accent only. */
  border-left: 2px solid transparent;
  transition:
    color 120ms ease,
    border-color 120ms ease;
}
.d-nav-link:hover {
  color: var(--sl-900);
}
.d-nav-link-active {
  color: var(--sl-900);
  font-weight: 600;
  border-left-color: var(--acc-carnation);
}
.d-nav-section {
  border-top: 1px solid var(--sl-200);
  padding-top: 12px;
  margin-top: 12px;
}
.d-kbd {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
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
