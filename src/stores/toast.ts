import { defineStore } from "pinia";
import { ref } from "vue";

export type ToastAction = {
  label: string;
  run: () => void | Promise<void>;
};
export type Toast = {
  id: number;
  message: string;
  action?: ToastAction;
};

let seq = 1;

/**
 * Toast queue with optional undo action. Auto-dismisses after 6 seconds.
 */
export const useToastStore = defineStore("toast", () => {
  const toasts = ref<Toast[]>([]);
  const timers = new Map<number, number>();

  function show(message: string, action?: ToastAction): number {
    const id = seq++;
    toasts.value.push({ id, message, action });
    const t = window.setTimeout(() => dismiss(id), 6000);
    timers.set(id, t);
    return id;
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
    const t = timers.get(id);
    if (t) window.clearTimeout(t);
    timers.delete(id);
  }

  async function runAction(id: number) {
    const t = toasts.value.find((x) => x.id === id);
    if (t?.action) await t.action.run();
    dismiss(id);
  }

  return { toasts, show, dismiss, runAction };
});
