import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

// Precaching
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
clientsClaim();

