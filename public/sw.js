/*
 * Watchlist deliberately does not cache pages, API responses, or user data.
 * Authentication is cookie-based, so cached responses could expose private data
 * to another session on the same device. This worker exists only to support
 * installability and immediate worker updates.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// No fetch handler: every navigation and request goes straight to the network.
