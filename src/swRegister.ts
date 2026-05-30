// Register the service worker after load, skipping dev/unsupported environments.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
