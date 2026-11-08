import { useState, useEffect } from 'react'

export const STORAGE_KEY = 'yvs_recent_summaries'
const MAX_RECENT = 20

/**
 * Save a completed summary to localStorage and notify listeners.
 */
export function saveRecentSummary({ videoId, url, title, summary }) {
  if (!videoId || !summary) return

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const existing = raw ? JSON.parse(raw) : []

    // Filter out existing video with same id to bump to top
    const filtered = existing.filter((item) => item.videoId !== videoId)

    const newItem = {
      id: videoId,
      videoId,
      url: url || `https://www.youtube.com/watch?v=${videoId}`,
      title: summary.title || title || 'YouTube Video Summary',
      summary,
      savedAt: Date.now(),
    }

    const updated = [newItem, ...filtered].slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event('yvs-recent-updated'))
  } catch (err) {
    console.warn('[RecentSummaries] Could not save to localStorage:', err)
  }
}

/**
 * Helper to format relative time
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return ''
  const diffMs = Date.now() - timestamp
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHrs = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHrs / 24)

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHrs < 24) return `${diffHrs}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * RecentSummaries Component
 * Displays saved summaries from localStorage with preview, open, and delete actions.
 */
export default function RecentSummaries({ onSelect, currentVideoId }) {
  const [recents, setRecents] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  const loadRecents = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setRecents(Array.isArray(parsed) ? parsed : [])
      } else {
        setRecents([])
      }
    } catch {
      setRecents([])
    }
  }

  useEffect(() => {
    loadRecents()

    const handleUpdate = () => loadRecents()
    window.addEventListener('yvs-recent-updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)

    return () => {
      window.removeEventListener('yvs-recent-updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  const handleDelete = (e, videoId) => {
    e.stopPropagation()
    try {
      const updated = recents.filter((item) => item.videoId !== videoId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      setRecents(updated)
      window.dispatchEvent(new Event('yvs-recent-updated'))
    } catch (err) {
      console.warn('[RecentSummaries] Could not delete item:', err)
    }
  }

  const handleClearAll = (e) => {
    e.stopPropagation()
    if (window.confirm('Are you sure you want to clear your summary history?')) {
      localStorage.removeItem(STORAGE_KEY)
      setRecents([])
      window.dispatchEvent(new Event('yvs-recent-updated'))
    }
  }

  const filtered = recents.filter((item) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      item.title?.toLowerCase().includes(q) ||
      item.summary?.overview?.toLowerCase().includes(q)
    )
  })

  if (recents.length === 0) {
    return null
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
          <h2 className="recent-title">Recent Summaries</h2>
          <span className="recent-badge">{recents.length}</span>
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
          const isActive = currentVideoId && currentVideoId === item.videoId
          return (
            <div
              key={item.videoId}
              className={`recent-item-card ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelect(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(item)
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
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <span className="recent-thumb-play" aria-hidden="true">▶</span>
              </div>

              <div className="recent-content">
                <div className="recent-meta">
                  <span className="recent-time">{formatTimeAgo(item.savedAt)}</span>
                  {item.summary?.keyPoints?.length > 0 && (
                    <span className="recent-points-tag">
                      {item.summary.keyPoints.length} points
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
          )
        })}
      </div>

      {filtered.length === 0 && searchQuery && (
        <div className="recent-empty-filter">
          No recent summaries matching &ldquo;{searchQuery}&rdquo;
        </div>
      )}
    </section>
  )
}
