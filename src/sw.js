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

  // 本来はIndexedDBを読み取って詳細な条件をチェックできますが、
  // ここでは日付ベースのシンプルなリマインドを実装します。

  // 15日前後のカードリマインド
  if (day >= 14 && day <= 16) {
    await showNotification('💳 カードの振り分け時期です', {
      body: '未分類のカード利用を「カード」タブで今月の支払いに振り分けましょう！',
      tag: 'card-reminder'
    });
  }

  // 25日前後の残高照合リマインド
  if (day >= 24 && day <= 26) {
    await showNotification('🏦 残高照合のリマインド', {
      body: '家計簿の締め日です。実際の通帳残高とアプリの数字を合わせましょう！',
      tag: 'balance-reminder'
    });
  }
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
