/* Надёжная локальная копия больших фото черновика вне localStorage. */
(function exposeAdminDraftStore(root) {
  'use strict';

  const DB_NAME = 'fashion-store-admin-drafts';
  const STORE_NAME = 'draft-images';

  function openDatabase() {
    if (!root.indexedDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, key, value) {
    const database = await openDatabase();
    if (!database) return null;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = mode === 'readonly' ? store.get(key) : store.put(value, key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function remove(key) {
    const database = await openDatabase();
    if (!database) return;
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  root.FashionStoreAdminDraftStore = {
    save(key, images) { return withStore('readwrite', key, Array.isArray(images) ? images : []); },
    load(key) { return withStore('readonly', key); },
    remove,
  };
}(typeof window !== 'undefined' ? window : globalThis));
