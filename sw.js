// Tombstone.
//
// The previous site at this path registered a service worker with a cache-first
// strategy for its shell. Anyone who visited it still has that worker installed
// and intercepting requests for this scope, and simply deleting this file is
// not reliable — browsers differ on whether a 404 during the update check
// unregisters the old worker or leaves the last good one running.
//
// So the file stays, and does the opposite of what it used to: drop every
// cache, unregister, and reload whatever is open so the new site is fetched
// from the network. It can be removed once returning visitors have cycled
// through, and nothing breaks if it is left here.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
