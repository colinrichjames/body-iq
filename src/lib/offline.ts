/** Asks the service worker to save this page for offline use. Safe to call anywhere; does nothing without a worker. */
export function prepareOffline(url: string = typeof location === "undefined" ? "" : location.pathname + location.search): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "prepare", url });
  } catch {
    // no service worker
  }
}

/** Forget saved pages, e.g. on the login screen after signing out. */
export function clearOffline(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear" });
  } catch {
    // no service worker
  }
}
