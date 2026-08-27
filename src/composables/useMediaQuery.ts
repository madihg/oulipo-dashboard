import { onBeforeUnmount, ref, type Ref } from "vue";

/**
 * Reactive media query.
 *
 * A one-shot `.matches` read at setup is the tempting version and it is wrong:
 * rotating a phone, or dragging a window across the breakpoint, leaves the
 * component on the surface it happened to mount with. This subscribes.
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (typeof window === "undefined" || !window.matchMedia) return matches;

  const mql = window.matchMedia(query);
  matches.value = mql.matches;
  const onChange = (e: MediaQueryListEvent) => {
    matches.value = e.matches;
  };
  mql.addEventListener("change", onChange);
  onBeforeUnmount(() => mql.removeEventListener("change", onChange));
  return matches;
}

/**
 * The app-shell phone line. 767px is where the sidebar goes away, the tab bar
 * appears and the safe-area insets kick in (styles/main.css), so it is also
 * where an anchored popover should become a bottom sheet.
 *
 * Deliberately NOT (pointer: coarse): a coarse layout can never be seen in a
 * dev browser, and the repo has been bitten by that before. Coarse is allowed
 * to bump target sizes, not to swap surfaces.
 */
export function useIsPhone(): Ref<boolean> {
  // Height matters as much as width. An iPhone in landscape is ~850px wide and
  // ~390px tall: wide enough to miss a width-only test, far too short for an
  // anchored popover with a calendar in it, which would be height-capped into
  // a sliver. Either dimension being phone-sized picks the sheet.
  return useMediaQuery("(max-width: 767px), (max-height: 500px)");
}
