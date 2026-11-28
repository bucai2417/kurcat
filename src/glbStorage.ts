/** Browser/Android preview binary storage, separate from small localStorage settings. */
let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    let cancelled = false;
    const request = indexedDB.open('diy-cat-model-assets', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('glb');
    request.onsuccess = () => { if (cancelled) { request.result.close(); return; } request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(Error('无法打开模型存储：' + request.error?.message)); };
    request.onblocked = () => { cancelled = true; database = undefined; reject(Error('模型存储被其他页面占用，请关闭其他预览页面后重试')); };
  });
}
async function transaction<T>(write: boolean, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('glb', write ? 'readwrite' : 'readonly'); const request = run(tx.objectStore('glb'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(Error('模型存储失败：' + (tx.error?.message ?? request.error?.message ?? '空间不足或访问被拒绝')));
  });
}
export async function saveBrowserGlb(hash: string, bytes: Uint8Array): Promise<void> { await transaction(true, store => store.put(bytes, hash)); }
export async function readBrowserGlb(hash: string): Promise<Uint8Array> { const bytes = await transaction(false, store => store.get(hash)); if (!(bytes instanceof Uint8Array)) throw Error('3D 文件已丢失，请重新导入模型'); return bytes; }
export async function deleteBrowserGlb(hash: string): Promise<void> { await transaction(true, store => store.delete(hash)); }
