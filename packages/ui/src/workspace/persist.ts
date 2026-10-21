import type { DirectoryHandle } from "./store.js";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("simplink-workspace", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Workspace storage unavailable"));
  });
}

export async function lastDirectory(): Promise<DirectoryHandle | null> {
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    return await new Promise((resolve, reject) => {
      const request = db!
        .transaction("handles")
        .objectStore("handles")
        .get("last");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function rememberDirectory(
  handle: DirectoryHandle,
): Promise<boolean> {
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    return await new Promise((resolve, reject) => {
      const transaction = db!.transaction("handles", "readwrite");
      transaction.objectStore("handles").put(handle, "last");
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
