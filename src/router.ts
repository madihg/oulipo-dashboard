import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import { supabase } from "./lib/supabase";
import { knownSession } from "./composables/useAuth";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/today" },
  {
    path: "/login",
    name: "login",
    component: () => import("./views/Login.vue"),
    meta: { public: true },
  },
  {
    path: "/auth/callback",
    name: "auth-callback",
    component: () => import("./views/AuthCallback.vue"),
    meta: { public: true },
  },
  {
    path: "/today",
    name: "today",
    component: () => import("./views/Today.vue"),
  },
  {
    path: "/areas",
    name: "areas",
    component: () => import("./views/Areas.vue"),
  },
  {
    path: "/system",
    name: "system",
    component: () => import("./views/SystemMap.vue"),
  },
  {
    path: "/inbox",
    name: "inbox",
    component: () => import("./views/Inbox.vue"),
  },
  {
    path: "/anytime",
    name: "anytime",
    component: () => import("./views/StateList.vue"),
    meta: { stateMode: "anytime" },
  },
  {
    path: "/upcoming",
    name: "upcoming",
    component: () => import("./views/StateList.vue"),
    meta: { stateMode: "upcoming" },
  },
  {
    path: "/someday",
    name: "someday",
    component: () => import("./views/StateList.vue"),
    meta: { stateMode: "someday" },
  },
  {
    path: "/logbook",
    name: "logbook",
    component: () => import("./views/StateList.vue"),
    meta: { stateMode: "logbook" },
  },
  // "no area" is gone: an unfiled task lives in the Inbox until it is moved to
  // an area. Old links and toasts land there.
  { path: "/no-area", redirect: "/inbox" },
  {
    path: "/area/:slug",
    name: "area",
    component: () => import("./views/Area.vue"),
  },
  {
    path: "/area/:slug/kanban",
    name: "area-kanban",
    component: () => import("./views/AreaKanban.vue"),
  },
  {
    path: "/reservoir/apply",
    name: "reservoir-apply",
    component: () => import("./views/ReservoirApply.vue"),
  },
  {
    path: "/reservoir/share",
    name: "reservoir-share",
    component: () => import("./views/ReservoirShare.vue"),
  },
  {
    path: "/project/:slug",
    name: "project",
    component: () => import("./views/Project.vue"),
  },
  {
    path: "/project/:slug/kanban",
    name: "project-kanban",
    component: () => import("./views/ProjectKanban.vue"),
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("./views/Settings.vue"),
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("./views/Placeholder.vue"),
    props: { title: "nothing here" },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Every navigation used to await supabase.auth.getSession(). That call takes
// the auth lock, and on a phone the lock is often held: the app wakes, a token
// refresh starts on a slow link, and until it ends every tap on a tab or a
// link waited behind it. The screen looked alive and nothing was clickable.
// A known session answers at once; only a cold start asks, and never for
// longer than GUARD_WAIT_MS.
const GUARD_WAIT_MS = 2500;
router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (knownSession()) return true;
  const asked = supabase.auth
    .getSession()
    .then(({ data }) => (data.session ? "in" : "out") as "in" | "out")
    .catch(() => "out" as const);
  const waited = new Promise<"slow">((resolve) =>
    setTimeout(() => resolve("slow"), GUARD_WAIT_MS),
  );
  const answer = await Promise.race([asked, waited]);
  // Too slow to say: let the tap through. The views load nothing without a
  // session, and the auth listener sends a signed-out user to login.
  if (answer === "out") {
    return { path: "/login", query: { next: to.fullPath } };
  }
  return true;
});
