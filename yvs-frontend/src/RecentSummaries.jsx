import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import {
  subscribeToUserSummaries,
  deleteUserSummaryFromCloud,
  migrateLocalSummariesToCloud,
  saveUserSummaryToCloud,
} from './firestore.service';

export const STORAGE_KEY = 'yvs_recent_summaries';
const MAX_RECENT = 20;

/**
 * Universal helper to save a summary:
 * - If user is authenticated, saves to Firestore and mirrors locally.
 * - If guest, saves to localStorage.
 */
export async function saveRecentSummary({ videoId, url, title, summary, userId }) {
  if (!videoId || !summary) return;

  const item = {
    id: videoId,
    videoId,
    url: url || `https://www.youtube.com/watch?v=${videoId}`,
    title: summary.title || title || 'YouTube Video Summary',
    summary,
    savedAt: Date.now(),
    createdAt: new Date().toISOString(),
  };

  // 1. Mirror locally for instant feedback
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter((it) => it.videoId !== videoId);
    const updated = [item, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('yvs-recent-updated'));
  } catch (err) {
    console.warn('[RecentSummaries] Could not save to localStorage:', err);
  }

  // 2. If authenticated with Firebase, persist to Cloud Firestore
  if (userId && !String(userId).startsWith('usr_')) {
    try {
      await saveUserSummaryToCloud(userId, item);
    } catch (err) {
      console.warn('[RecentSummaries] Could not save to Firestore:', err);
    }
  }
}

/**
 * Helper to format relative time
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const dateVal = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (isNaN(dateVal)) return '';

  const diffMs = Date.now() - dateVal;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateVal).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function RecentSummaries({ onSelect, currentVideoId, onOpenAuth }) {
  const { currentUser } = useAuth();
  const [recents, setRecents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [localMigrationCount, setLocalMigrationCount] = useState(0);
  const [migrating, setMigrating] = useState(false);

  // Check for unsynced local summaries on login
  useEffect(() => {
    if (!currentUser) {
      setLocalMigrationCount(0);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const items = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          setLocalMigrationCount(items.length);
        }
      }
    } catch {
      setLocalMigrationCount(0);
    }
  }, [currentUser]);

  // Load and subscribe to summaries
  useEffect(() => {
    if (currentUser?.uid && !currentUser.isQuickUser) {
      // 1. Subscribe to Cloud Firestore
      const unsubscribe = subscribeToUserSummaries(
        currentUser.uid,
        (cloudItems) => {
          setRecents(cloudItems || []);
        },
        (error) => {
          console.warn('[RecentSummaries] Firestore listener warning, falling back to local:', error);
          loadLocalRecents();
        }
      );
      return () => unsubscribe();
    } else {
      // 2. Load from localStorage for quick/local users
      loadLocalRecents();
      const handleUpdate = () => loadLocalRecents();
      window.addEventListener('yvs-recent-updated', handleUpdate);
      window.addEventListener('storage', handleUpdate);
      return () => {
        window.removeEventListener('yvs-recent-updated', handleUpdate);
        window.removeEventListener('storage', handleUpdate);
      };
    }
  }, [currentUser]);

  const loadLocalRecents = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setRecents(Array.isArray(parsed) ? parsed : []);
      } else {
        setRecents([]);
      }
    } catch {
      setRecents([]);
    }
  };

  const handleDelete = async (e, videoId) => {
    e.stopPropagation();
    // 1. Remove from local store
    try {
      const updated = recents.filter((item) => item.videoId !== videoId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setRecents(updated);
      window.dispatchEvent(new Event('yvs-recent-updated'));
    } catch (err) {
      console.warn('[RecentSummaries] Could not delete local item:', err);
    }

    // 2. If authenticated, delete from Cloud Firestore
    if (currentUser?.uid) {
      try {
        await deleteUserSummaryFromCloud(currentUser.uid, videoId);
      } catch (err) {
        console.warn('[RecentSummaries] Could not delete cloud item:', err);
      }
    }
  };

  const handleClearAll = async (e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to clear your summary history?')) {
      localStorage.removeItem(STORAGE_KEY);
      setRecents([]);
      window.dispatchEvent(new Event('yvs-recent-updated'));

      if (currentUser?.uid) {
        for (const item of recents) {
          try {
            await deleteUserSummaryFromCloud(currentUser.uid, item.videoId);
          } catch {
            // ignore
          }
        }
      }
    }
  };

  const handleMigrate = async () => {
    if (!currentUser?.uid) return;
    setMigrating(true);
    try {
      const count = await migrateLocalSummariesToCloud(currentUser.uid);
      setLocalMigrationCount(0);
      if (count > 0) {
        // Clear local migration flag
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Migration failed:', err);
    } finally {
      setMigrating(false);
    }
  };

  const filtered = recents.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(q) ||
      item.summary?.overview?.toLowerCase().includes(q)
    );
  });

  if (recents.length === 0 && !localMigrationCount) {
    return null;
  }

  return (
    <section className="recent-summaries-container" aria-label="Recent Summaries">
      <div className="recent-header">
        <div className="recent-header-left">
          <svg viewBox="0 0 20 20" fill="none" className="recent-icon" aria-hidden="true">
            <path
              d="M10 5v5l3 2M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Z"
              stroke="#ea580c"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h2 className="recent-title">
            {currentUser ? 'Your Saved Summaries' : 'Recent Summaries'}
          </h2>
          <span className="recent-badge">{recents.length}</span>

          {currentUser ? (
            <span className="recent-cloud-status" title="Synced in real time with Cloud Firestore">
              <span className="cloud-dot" aria-hidden="true" />
              Cloud Synced
            </span>
          ) : (
            <button
              type="button"
              className="recent-cloud-prompt"
              onClick={onOpenAuth}
              title="Sign in to sync your summaries across devices"
            >
              ☁️ Sign in to sync
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn-clear-history"
          onClick={handleClearAll}
          title="Clear all recent summaries"
        >
          Clear History
        </button>
      </div>

      {/* Migration Banner if local summaries exist after login */}
      {currentUser && localMigrationCount > 0 && (
        <div className="recent-migration-banner">
          <div className="migration-banner-content">
            <span className="migration-icon" aria-hidden="true">🔄</span>
            <div>
              <strong>Sync local summaries to your cloud account?</strong>
              <p>We found {localMigrationCount} summaries saved in this browser. Upload them to access them anywhere.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary btn-migrate-cloud"
            onClick={handleMigrate}
            disabled={migrating}
          >
            {migrating ? 'Syncing…' : 'Sync to Cloud ☁️'}
          </button>
        </div>
      )}

      {recents.length > 3 && (
        <div className="recent-search-row">
          <svg viewBox="0 0 16 16" fill="none" className="recent-search-icon" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="#f59e0b" strokeWidth="1.3" />
            <path d="m11 11 3.5 3.5" stroke="#f59e0b" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            className="recent-search-input"
            placeholder="Filter recent summaries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="recent-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear filter"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="recent-grid">
        {filtered.map((item) => {
          const isActive = currentVideoId && currentVideoId === item.videoId;
          return (
            <div
              key={item.videoId || item.id}
              className={`recent-item-card ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelect(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(item);
                }
              }}
            >
              <div className="recent-thumb-wrap">
                <img
                  src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                  alt=""
                  className="recent-thumb"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <span className="recent-thumb-play" aria-hidden="true">▶</span>
              </div>

              <div className="recent-content">
                <div className="recent-meta">
                  <span className="recent-time">{formatTimeAgo(item.createdAt || item.savedAt)}</span>
                  {item.summary?.keyPoints?.length > 0 && (
                    <span className="recent-points-tag">
                      {item.summary.keyPoints.length} points
                    </span>
                  )}
                  {item.summary?.resources?.length > 0 && (
                    <span className="recent-resources-tag">
                      {item.summary.resources.length} resources
                    </span>
                  )}
                </div>

                <h3 className="recent-item-title" title={item.title}>
                  {item.title}
                </h3>

                {item.summary?.overview && (
                  <p className="recent-item-snippet">
                    {item.summary.overview}
                  </p>
                )}
              </div>

              <div className="recent-actions">
                <button
                  type="button"
                  className="btn-item-delete"
                  onClick={(e) => handleDelete(e, item.videoId)}
                  title="Remove from history"
                  aria-label={`Remove ${item.title} from history`}
                >
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M2.5 4h11M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4M6.5 7v5M9.5 7v5M3.5 4l.8 9.2a1.5 1.5 0 0 0 1.5 1.3h4.4a1.5 1.5 0 0 0 1.5-1.3L12.5 4"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && searchQuery && (
        <div className="recent-empty-filter">
          No recent summaries matching &ldquo;{searchQuery}&rdquo;
        </div>
      )}
    </section>
  );
}
