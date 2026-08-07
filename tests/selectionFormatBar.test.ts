import { describe, it, expect, afterEach } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import SelectionFormatBar from "../src/components/SelectionFormatBar.vue";

/**
 * The selection toolbar's interaction contract.
 *
 * Two of these guard defects that a desktop browser cannot show you:
 *
 *  - touchstart must never be cancelled. Cancelling it suppresses the
 *    compatibility mouse events the spec synthesises from a tap - INCLUDING
 *    `click`, which is the buttons' only activation path. A `@touchstart.prevent`
 *    on the container left every button inert on every phone while desktop
 *    kept working perfectly.
 *  - the bar must stay mounted. It used to be `v-if`, so its own element was
 *    null at the moment the placement code needed to measure it, and every
 *    first placement fell back to a guessed width.
 */

let mounted: App | null = null;

interface Harness {
  bar: () => HTMLElement;
  /** Nth button in the bar; throws rather than silently testing nothing. */
  button: (i: number) => HTMLElement;
  textarea: HTMLTextAreaElement;
  text: { value: string };
  formatted: () => number;
  /** What the textarea held at the instant `formatted` was emitted. */
  domWhenFormatted: () => string | null;
  select: (start: number, end: number) => void;
}

async function mountBar(initial = "hello world"): Promise<Harness> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const text = ref(initial);
  const taRef = ref<HTMLTextAreaElement | null>(null);
  let formattedCount = 0;
  let domWhenFormatted: string | null = null;

  const Wrapper = {
    setup() {
      return () =>
        h("div", [
          // Bound value, exactly as both hosts bind it with v-model - the
          // ordering assertion below is only meaningful if Vue owns the DOM.
          h("textarea", { ref: taRef, value: text.value }),
          h(SelectionFormatBar, {
            target: taRef.value,
            modelValue: text.value,
            "onUpdate:modelValue": (v: string) => {
              text.value = v;
            },
            onFormatted: () => {
              formattedCount += 1;
              domWhenFormatted = taRef.value?.value ?? null;
            },
          }),
        ]);
    },
  };

  mounted = createApp(Wrapper);
  mounted.mount(host);
  // Second render: the template ref is only populated after the first one.
  await nextTick();
  await nextTick();

  const ta = taRef.value!;
  ta.value = initial;
  ta.focus();

  return {
    bar: () => document.querySelector<HTMLElement>(".fb")!,
    button: (i: number) => {
      const b = document.querySelectorAll<HTMLElement>(".fb-btn")[i];
      if (!b) throw new Error(`no format button at index ${i}`);
      return b;
    },
    textarea: ta,
    text,
    formatted: () => formattedCount,
    domWhenFormatted: () => domWhenFormatted,
    select: (start, end) => {
      ta.focus();
      ta.setSelectionRange(start, end);
    },
  };
}

/** Let the bar's deferred placement (setTimeout 0) run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function fire(el: EventTarget, type: string): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  document.body.innerHTML = "";
});

describe("SelectionFormatBar activation", () => {
  it("does not cancel touchstart, so the synthesized click still fires", async () => {
    const h1 = await mountBar();
    const e = fire(h1.button(0), "touchstart");
    expect(e.defaultPrevented).toBe(false);
  });

  it("does cancel pointerdown, so the textarea keeps focus and selection", async () => {
    const h1 = await mountBar();
    const e = fire(h1.button(0), "pointerdown");
    expect(e.defaultPrevented).toBe(true);
  });

  it("formats on click and reports it to the host afterwards", async () => {
    const h1 = await mountBar("hello world");
    h1.select(0, 5);
    h1.button(0).click(); // bold
    await settle();
    expect(h1.text.value).toBe("**hello** world");
    expect(h1.formatted()).toBe(1);
  });

  it("tells the host to resize only once the new text is in the DOM", async () => {
    const h1 = await mountBar("hello world");
    h1.select(0, 5);
    h1.button(0).click();
    await settle();
    // The host autosizes in this handler. Emitted before Vue's patch - as it
    // used to be - it measured the OLD text, leaving the box a line short with
    // the overflow hidden and unreachable.
    expect(h1.domWhenFormatted()).toBe("**hello** world");
  });

  it("restores the selection over the formatted text, not collapsed at the end", async () => {
    const h1 = await mountBar("hello world");
    h1.select(0, 5);
    h1.button(0).click();
    await settle();
    // "**hello**" - the wrapped word stays selected so the bar stays anchored
    // and a second press toggles it back off.
    expect([h1.textarea.selectionStart, h1.textarea.selectionEnd]).toEqual([
      2, 7,
    ]);
  });
});

describe("SelectionFormatBar placement", () => {
  it("stays mounted so its size can be measured before first placement", async () => {
    const h1 = await mountBar();
    // Present in the DOM even while hidden - this is what makes offsetWidth
    // real instead of a 240px guess.
    expect(h1.bar()).toBeTruthy();
    expect(h1.bar().style.visibility).toBe("hidden");
  });

  it("shows while the focused textarea has a selection", async () => {
    const h1 = await mountBar();
    h1.select(0, 5);
    fire(window, "pointerup");
    await settle();
    expect(h1.bar().style.visibility).toBe("visible");
  });

  it("hides when the textarea is no longer focused, selection or not", async () => {
    const h1 = await mountBar();
    h1.select(0, 5);
    fire(window, "pointerup");
    await settle();
    expect(h1.bar().style.visibility).toBe("visible");

    // Blur WITHOUT clearing the selection - selectionStart/End survive a blur,
    // which is what used to re-show the bar over an unfocused field. It must
    // go on the blur ITSELF, not merely on the next unrelated event.
    h1.textarea.blur();
    // nextTick only - a microtask, so it lands before any paint. The point is
    // that no unrelated EVENT is needed to clear it.
    await nextTick();
    expect(h1.bar().style.visibility).toBe("hidden");

    // And it must stay gone through every path that re-places the bar.
    fire(window, "pointerup");
    await settle();
    expect(h1.bar().style.visibility).toBe("hidden");
    fire(window, "scroll");
    await settle();
    expect(h1.bar().style.visibility).toBe("hidden");
  });

  it("is inert to pointer events while hidden", async () => {
    const h1 = await mountBar();
    expect(h1.bar().style.pointerEvents).toBe("none");
  });

  it("recovers from a cancelled gesture instead of latching off", async () => {
    const h1 = await mountBar();
    h1.select(0, 5);
    // A touch-scroll that began on the textarea ends in pointercancel, not
    // pointerup. Only clearing on pointerup left the bar disabled for good.
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(down, "target", { value: h1.textarea });
    window.dispatchEvent(down);
    fire(window, "pointercancel");
    await settle();
    expect(h1.bar().style.visibility).toBe("visible");
  });
});

describe("SelectionFormatBar shortcuts", () => {
  function key(init: KeyboardEventInit): KeyboardEvent {
    const e = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    window.dispatchEvent(e);
    return e;
  }

  it("formats on the platform modifier", async () => {
    const h1 = await mountBar("hello world");
    h1.select(0, 5);
    key({ key: "b", ctrlKey: true });
    await settle();
    expect(h1.text.value).toBe("**hello** world");
  });

  it("stops the event so the command palette does not also open on ⌘K", async () => {
    const h1 = await mountBar("hello world");
    h1.select(0, 5);
    let sawIt = false;
    const spy = () => {
      sawIt = true;
    };
    // The palette listens in the bubble phase on window, as it does in App.
    window.addEventListener("keydown", spy);
    key({ key: "k", ctrlKey: true });
    window.removeEventListener("keydown", spy);
    expect(sawIt).toBe(false);
  });

  it("ignores the chord when nothing is selected", async () => {
    const h1 = await mountBar("hello world");
    h1.select(3, 3);
    const e = key({ key: "b", ctrlKey: true });
    await settle();
    // No stray "****" dropped into the note, and the key stays the browser's.
    expect(h1.text.value).toBe("hello world");
    expect(e.defaultPrevented).toBe(false);
  });

  it("leaves chords carrying an extra modifier alone", async () => {
    const h1 = await mountBar("hello world");
    h1.select(0, 5);
    key({ key: "b", ctrlKey: true, altKey: true });
    await settle();
    expect(h1.text.value).toBe("hello world");
  });

  it("does nothing when the textarea is not focused", async () => {
    const h1 = await mountBar("hello world");
    h1.select(0, 5);
    h1.textarea.blur();
    key({ key: "b", ctrlKey: true });
    await settle();
    expect(h1.text.value).toBe("hello world");
  });
});
