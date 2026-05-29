import { onBeforeUnmount, onMounted } from "vue";
import type { Router } from "vue-router";

/**
 * Single global keyboard registrar, mounted once in App.vue. Desktop-only in
 * practice (no hardware keyboard fires these on touch). It ignores keystrokes
 * while the user is typing in an input / textarea / contenteditable.
 *
 * Shortcuts:
 *   n            new task in the current view (clicks the toolbar "+ new")
 *   c            global capture sheet
 *   /            command palette / search
 *   ?            shortcuts help overlay (toggle)
 *   g then t/i/a go to today / inbox / anytime
 *   j / k        move row selection down / up (roving focus over .d-row)
 *   x / Space    toggle complete on the focused row
 *   e / Enter    expand / edit the focused row
 *
 * Row navigation is DOM-driven (queries `main .d-row`), so it works across every
 * list/kanban view without per-component wiring.
 */
export interface ShortcutCallbacks {
  capture: () => void;
  search: () => void;
  help: () => void;
}

export function useKeyboardShortcuts(router: Router, cb: ShortcutCallbacks) {
  let gPending = false;
  let gTimer: number | undefined;
  let focusIndex = -1;

  function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || !!el.isContentEditable;
  }

  function rows(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll("main .d-row"),
    ) as HTMLElement[];
  }

  function clearFocus() {
    for (const r of document.querySelectorAll(".d-row-kbd"))
      r.classList.remove("d-row-kbd");
  }

  function focusRow(i: number) {
    const list = rows();
    if (!list.length) return;
    focusIndex = Math.max(0, Math.min(i, list.length - 1));
    clearFocus();
    const el = list[focusIndex]!;
    el.classList.add("d-row-kbd");
    el.scrollIntoView({ block: "nearest" });
  }

  function moveFocus(delta: number) {
    const list = rows();
    if (!list.length) return;
    const current = list[focusIndex];
    if (!current || !current.classList.contains("d-row-kbd")) {
      focusRow(delta > 0 ? 0 : list.length - 1);
      return;
    }
    focusRow(focusIndex + delta);
  }

  function activeRow(): HTMLElement | null {
    const list = rows();
    const el = list[focusIndex];
    return el && el.classList.contains("d-row-kbd") ? el : null;
  }

  function onKeydown(e: KeyboardEvent) {
    // Leave modified chords (⌘k, etc.) to their own handlers. Shift is allowed
    // so "?" (Shift+/) still reaches us.
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const typing = isTyping(e.target);

    // "g" prefix: g then t/i/a
    if (gPending) {
      gPending = false;
      window.clearTimeout(gTimer);
      if (!typing) {
        const dest: Record<string, string> = {
          t: "/today",
          i: "/inbox",
          a: "/anytime",
        };
        const to = dest[e.key.toLowerCase()];
        if (to) {
          e.preventDefault();
          void router.push(to);
          return;
        }
      }
    }

    if (typing) return;

    switch (e.key) {
      case "g":
        gPending = true;
        window.clearTimeout(gTimer);
        gTimer = window.setTimeout(() => (gPending = false), 800);
        return;
      case "n": {
        const btn = document.querySelector(
          'main [data-action="new-task"]',
        ) as HTMLElement | null;
        if (btn) {
          e.preventDefault();
          btn.click();
        }
        return;
      }
      case "c":
        e.preventDefault();
        cb.capture();
        return;
      case "/":
        e.preventDefault();
        cb.search();
        return;
      case "?":
        e.preventDefault();
        cb.help();
        return;
      case "j":
        e.preventDefault();
        moveFocus(1);
        return;
      case "k":
        e.preventDefault();
        moveFocus(-1);
        return;
      case "x":
      case " ": {
        const row = activeRow();
        if (row) {
          e.preventDefault();
          (row.querySelector(".d-checkbox") as HTMLElement | null)?.click();
        }
        return;
      }
      case "e":
      case "Enter": {
        const row = activeRow();
        if (row) {
          e.preventDefault();
          row.click();
        }
        return;
      }
    }
  }

  onMounted(() => window.addEventListener("keydown", onKeydown));
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown);
    window.clearTimeout(gTimer);
    clearFocus();
  });
}
