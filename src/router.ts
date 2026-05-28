import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import { supabase } from "./lib/supabase";

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
  {
    path: "/memory",
    name: "memory",
    component: () => import("./views/Memory.vue"),
  },
  {
    path: "/alternative-ui",
    name: "alternative-ui",
    component: () => import("./views/AlternativeUI.vue"),
    meta: { public: true },
  },
  {
    path: "/area/:slug",
    name: "area",
    component: () => import("./views/Area.vue"),
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

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    return { path: "/login", query: { next: to.fullPath } };
  }
  return true;
});
