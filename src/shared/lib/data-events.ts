import { useEffect } from "react";

const DATA_CHANGED_EVENT = "app:data-changed";

// Cross-page refresh signal: page hooks load data independently, so a write
// made from a global surface (e.g. the Quick Add palette) emits this event
// to tell whatever page is mounted to reload.
export function emitDataChanged(): void {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}

export function useDataChanged(callback: () => void): void {
  useEffect(() => {
    window.addEventListener(DATA_CHANGED_EVENT, callback);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, callback);
  }, [callback]);
}
