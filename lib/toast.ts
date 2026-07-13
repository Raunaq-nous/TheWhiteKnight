// Tiny global toast bus. Write-through helpers call showToast() on failure so
// no save is ever silently swallowed to console-only. app/toast-host.tsx renders it.

export type ToastKind = "ok" | "error";
export type ToastPayload = { text: string; kind: ToastKind };

const EVENT = "careeros-toast";

export function showToast(text: string, kind: ToastKind = "error") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT, { detail: { text, kind } }));
}

export function onToast(handler: (payload: ToastPayload) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<ToastPayload>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
