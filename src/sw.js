import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

// Precaching
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
clientsClaim();

// Periodic Background Sync のイベント名
const NOTIFICATION_SYNC_TAG = 'check-notifications';

/**
 * 通知を表示する関数
 */
const showNotification = (title, options) => {
  return self.registration.showNotification(title, {
    icon: '/favicon.png',
    badge: '/pwa-192x192.png',
    ...options
  });
};

/**
 * 通知が必要かチェックして表示するロジック
 */
const checkAndShowReminders = async () => {
  const now = new Date();
  const day = now.getDate();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // IndexedDBから通知設定を読み取る
  return new Promise((resolve) => {
    const request = indexedDB.open('kakeiboDB');
    request.onsuccess = async (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('notifications')) {
        resolve();
        return;
      }

      const tx = db.transaction('notifications', 'readwrite');
      const store = tx.objectStore('notifications');
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = async () => {
        const notifications = getAllRequest.result;
        for (const n of notifications) {
          if (day >= n.day && n.lastProcessedMonth !== month) {
            await showNotification('格が違う家計簿', {
              body: n.message,
              tag: `reminder-${n.id}`,
              silent: true
            });
            n.lastProcessedMonth = month;
            store.put(n);
          }
        }
        resolve();
      };
      getAllRequest.onerror = () => resolve();
    };
    request.onerror = () => resolve();
  });
};

// Periodic Sync イベントのリスナー
self.addEventListener('periodicsync', (event) => {
  if (event.tag === NOTIFICATION_SYNC_TAG) {
    event.waitUntil(checkAndShowReminders());
  }
});

// 通知クリック時の挙動
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // 既にアプリが開いていればフォーカス、なければ開く
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// 通常のプッシュ通知（サーバーがある場合用）への備え
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '格が違う家計簿';
  const options = {
    body: data.body || '新しい通知があります',
    icon: '/favicon.png',
    badge: '/pwa-192x192.png',
    data: data.url || '/'
  };
  event.waitUntil(showNotification(title, options));
});
