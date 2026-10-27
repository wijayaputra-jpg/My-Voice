import { SynthesisTake, VoiceProfile } from "../types/voice";

const DB_NAME = "voxforma_studio_db";
const DB_VERSION = 1;
const PROFILES_STORE = "voice_profiles";
const TAKES_STORE = "synthesis_takes";

function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROFILES_STORE)) {
        db.createObjectStore(PROFILES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TAKES_STORE)) {
        db.createObjectStore(TAKES_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadVoiceProfiles(): Promise<VoiceProfile[]> {
  try {
    const db = await openStudioDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PROFILES_STORE, "readonly");
      const store = tx.objectStore(PROFILES_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as VoiceProfile[]) || [];
        items.sort((a, b) => {
          if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
          return b.createdAt - a.createdAt;
        });
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveVoiceProfile(profile: VoiceProfile): Promise<void> {
  const db = await openStudioDb();
  const existing = await loadVoiceProfiles();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE, "readwrite");
    const store = tx.objectStore(PROFILES_STORE);
    if (profile.isMain) {
      for (const item of existing) {
        if (item.id !== profile.id && item.isMain) {
          store.put({ ...item, isMain: false });
        }
      }
    }
    store.put(profile);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteVoiceProfile(id: string): Promise<void> {
  const db = await openStudioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE, "readwrite");
    tx.objectStore(PROFILES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSynthesisTakes(): Promise<SynthesisTake[]> {
  try {
    const db = await openStudioDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(TAKES_STORE, "readonly");
      const req = tx.objectStore(TAKES_STORE).getAll();
      req.onsuccess = () => {
        const items = (req.result as SynthesisTake[]) || [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveSynthesisTake(take: SynthesisTake): Promise<void> {
  const db = await openStudioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TAKES_STORE, "readwrite");
    tx.objectStore(TAKES_STORE).put(take);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSynthesisTake(id: string): Promise<void> {
  const db = await openStudioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TAKES_STORE, "readwrite");
    tx.objectStore(TAKES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
