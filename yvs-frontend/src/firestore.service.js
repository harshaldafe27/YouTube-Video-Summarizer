import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError } from './firebase';

/**
 * Save or update a video summary in the user's Firestore collection.
 */
export async function saveUserSummaryToCloud(userId, { videoId, url, title, summary }) {
  if (!userId || !videoId || !summary) return null;

  // Guard against unauthenticated writes: only write if active Firebase Auth UID matches
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    return null;
  }

  const docPath = `users/${userId}/summaries/${videoId}`;
  try {
    const summaryRef = doc(db, 'users', userId, 'summaries', videoId);
    const payload = {
      id: videoId,
      videoId,
      url: url || `https://www.youtube.com/watch?v=${videoId}`,
      title: summary.title || title || 'YouTube Video Summary',
      summary,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      serverUpdatedAt: serverTimestamp(),
    };

    await setDoc(summaryRef, payload, { merge: true });
    return payload;
  } catch (error) {
    handleFirestoreError(error, 'write', docPath);
  }
}

/**
 * Subscribe to the authenticated user's summaries in real-time.
 */
export function subscribeToUserSummaries(userId, onUpdate, onError) {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    if (onUpdate) onUpdate([]);
    return () => {};
  }

  const collPath = `users/${userId}/summaries`;
  try {
    const q = query(
      collection(db, 'users', userId, 'summaries'),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() });
        });
        onUpdate(items);
      },
      (error) => {
        console.warn(`[Firestore] onSnapshot listener warning on ${collPath}:`, error?.message || error);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.warn(`[Firestore] query error on ${collPath}:`, error?.message || error);
    if (onError) onError(error);
    return () => {};
  }
}

/**
 * Delete a summary from the user's Firestore collection.
 */
export async function deleteUserSummaryFromCloud(userId, summaryId) {
  if (!userId || !summaryId) return;
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    return;
  }

  const docPath = `users/${userId}/summaries/${summaryId}`;
  try {
    const summaryRef = doc(db, 'users', userId, 'summaries', summaryId);
    await deleteDoc(summaryRef);
  } catch (error) {
    handleFirestoreError(error, 'delete', docPath);
  }
}

/**
 * One-click migration: Uploads pre-existing localStorage summaries to the user's cloud account.
 */
export async function migrateLocalSummariesToCloud(userId) {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) return 0;

  try {
    const raw = localStorage.getItem('yvs_recent_summaries');
    if (!raw) return 0;
    const localItems = JSON.parse(raw);
    if (!Array.isArray(localItems) || localItems.length === 0) return 0;

    let migratedCount = 0;
    for (const item of localItems) {
      if (item.videoId && item.summary) {
        await saveUserSummaryToCloud(userId, item);
        migratedCount++;
      }
    }
    return migratedCount;
  } catch (err) {
    console.warn('[firestore.service] Local migration warning:', err);
    return 0;
  }
}
