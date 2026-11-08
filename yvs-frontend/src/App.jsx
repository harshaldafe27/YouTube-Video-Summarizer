import { useState, useEffect, useRef, useCallback } from 'react'
import RecentSummaries, { saveRecentSummary } from './RecentSummaries'
import './App.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = '/api'          // proxied to http://localhost:5000 by Vite
const POLL_INTERVAL_MS = 3000   // poll every 3 seconds while processing

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/.test(url)
}

function getVideoId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
  return match ? match[1] : null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Animated progress bar shown while the backend is working */
function ProgressBar({ progress }) {
  const pct = typeof progress === 'number' ? progress : 0
  return (
    <div className="progress-wrap" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-label">{pct}%</span>
    </div>
  )
}

/** Processing state card — shown while job is in queue */
function ProcessingCard({ videoId, progress, onCancel }) {
  const steps = [
    { label: 'Downloading audio',    threshold: 10 },
    { label: 'Normalising audio',    threshold: 25 },
    { label: 'Transcribing speech',  threshold: 55 },
    { label: 'Summarizing chunks',   threshold: 85 },
    { label: 'Building final summary', threshold: 100 },
  ]

  const currentStep = steps.findLastIndex(s => (progress ?? 0) >= s.threshold)

  return (
    <div className="card processing-card">
      {videoId && (
        <div className="thumbnail-wrap">
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt="Video thumbnail"
            className="thumbnail"
          />
          <span className="play-badge" aria-hidden="true">▶</span>
        </div>
      )}

      <div className="processing-body">
        <div className="processing-header">
          <span className="spinner" aria-hidden="true" />
          <h2>Processing your video…</h2>
        </div>

        <ProgressBar progress={progress} />

        <ul className="step-list" aria-label="Pipeline steps">
          {steps.map((step, i) => {
            const done    = i < currentStep + 1 && (progress ?? 0) >= step.threshold
            const active  = i === currentStep + 1 && (progress ?? 0) < step.threshold
            return (
              <li key={step.label} className={`step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <span className="step-dot" aria-hidden="true" />
                {step.label}
              </li>
            )
          })}
        </ul>

        <p className="processing-note">This can take a few minutes for longer videos.</p>
      </div>

      <button className="btn-ghost" onClick={onCancel}>
        ← Try a different video
      </button>
    </div>
  )
}

/** Error card */
function ErrorCard({ message, onRetry, onReset }) {
  return (
    <div className="card error-card">
      <div className="error-icon-wrap" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.5"/>
          <path d="M12 7v5M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>
      <h2>Something went wrong</h2>
      <p className="error-detail">{message || 'The processing job failed. Please try again.'}</p>
      <div className="error-actions">
        <button className="btn-primary" onClick={onRetry}>Try again</button>
        <button className="btn-ghost" onClick={onReset}>Different video</button>
      </div>
    </div>
  )
}

/** Final summary card */
function SummaryCard({ summary, title, videoId, onReset, url }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const textParts = [
      summary.title || title || 'YouTube Video Summary',
      '',
      '=== OVERVIEW ===',
      summary.overview || '',
      '',
      '=== KEY POINTS ===',
      ...(summary.keyPoints || []).map((p) => `• ${p}`),
      '',
      '=== KEY TAKEAWAYS ===',
      ...(summary.takeaways || []).map((t) => `• ${t}`),
    ].filter(Boolean).join('\n')

    navigator.clipboard.writeText(textParts).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const ytUrl = url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null)

  return (
    <div className="card summary-card">
      {videoId && (
        <div className="thumbnail-wrap">
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt="Video thumbnail"
            className="thumbnail"
          />
          <span className="play-badge" aria-hidden="true">▶</span>
        </div>
      )}

      <div className="summary-body">
        {/* Title */}
        <h2 className="summary-title">{summary.title || title || 'Summary'}</h2>

        {/* Overview */}
        {summary.overview && (
          <section className="summary-section">
            <h3 className="section-heading">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="14" height="14" rx="2" stroke="var(--accent)" strokeWidth="1.3"/>
                <path d="M4 5h8M4 8h6M4 11h4" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Overview
            </h3>
            <p className="overview-text">{summary.overview}</p>
          </section>
        )}

        {/* Key Points */}
        {summary.keyPoints?.length > 0 && (
          <section className="summary-section">
            <h3 className="section-heading">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 4l2 2 4-4" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 9l2 2 4-4" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 14l2 2 4-4" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Key Points
            </h3>
            <ul className="bullet-list">
              {summary.keyPoints.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Key Takeaways */}
        {summary.takeaways?.length > 0 && (
          <section className="summary-section">
            <h3 className="section-heading">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 1v10M4 7l4 4 4-4" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 14h12" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Key Takeaways
            </h3>
            <ul className="takeaway-list">
              {summary.takeaways.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="summary-actions-bar">
        <div className="summary-actions-left">
          <button
            type="button"
            className={`btn-action-pill ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
            title="Copy summary text to clipboard"
          >
            {copied ? (
              <>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Copy Summary
              </>
            )}
          </button>

          {ytUrl && (
            <a
              href={ytUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-action-pill"
              title="Open video on YouTube in a new tab"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M12 4v4m0-4H8m4 0L6 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="2" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
              Watch on YouTube ↗
            </a>
          )}
        </div>

        <button type="button" className="btn-ghost" onClick={onReset}>
          ← Summarize another video
        </button>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [url, setUrl]           = useState('')
  const [inputError, setInputError] = useState('')

  // Job state
  const [phase, setPhase]       = useState('idle')   // idle | loading | processing | completed | failed
  const [jobId, setJobId]       = useState(null)
  const [progress, setProgress] = useState(0)
  const [videoId, setVideoId]   = useState(null)
  const [summary, setSummary]   = useState(null)
  const [title, setTitle]       = useState('')
  const [apiError, setApiError] = useState('')

  const pollRef = useRef(null)

  // ── Stop polling ────────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // ── Poll for result ─────────────────────────────────────────────────────────
  const pollResult = useCallback(async (id) => {
    try {
      const res  = await fetch(`${API_BASE}/result/${id}`)
      const data = await res.json()

      if (data.status === 'completed') {
        stopPolling()
        setSummary(data.summary)
        setTitle(data.title || '')
        setPhase('completed')
        saveRecentSummary({
          videoId: data.videoId || videoId,
          url: data.url || url,
          title: data.title || (data.summary && data.summary.title),
          summary: data.summary,
        })
      } else if (data.status === 'failed') {
        stopPolling()
        setApiError(data.errorMessage || 'Processing failed.')
        setPhase('failed')
      } else {
        // still processing
        if (typeof data.progress === 'number') {
          setProgress(data.progress)
        }
      }
    } catch {
      // network hiccup — keep polling, don't abort
    }
  }, [stopPolling, videoId, url])

  // ── Start polling when jobId is set ─────────────────────────────────────────
  useEffect(() => {
    if (phase === 'processing' && jobId) {
      pollResult(jobId) // immediate first check
      pollRef.current = setInterval(() => pollResult(jobId), POLL_INTERVAL_MS)
    }
    return stopPolling
  }, [phase, jobId, pollResult, stopPolling])

  // ── Submit handler ───────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    setInputError('')

    if (!url.trim()) {
      setInputError('Please enter a YouTube video link.')
      return
    }
    if (!isValidYouTubeUrl(url)) {
      setInputError("That doesn't look like a valid YouTube URL.")
      return
    }

    const vid = getVideoId(url)
    setVideoId(vid)
    setPhase('loading')
    setProgress(0)
    setApiError('')

    try {
      const res  = await fetch(`${API_BASE}/summarize`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ youtube_url: url }),
      })
      const data = await res.json()

      if (!data.success) {
        setApiError((data.errors || ['Request failed.']).join(' '))
        setPhase('failed')
        return
      }

      // Already completed (cached result)
      if (data.status === 'completed') {
        setSummary(data.summary)
        setTitle(data.title || '')
        setPhase('completed')
        saveRecentSummary({
          videoId: data.videoId || vid,
          url: url,
          title: data.title || (data.summary && data.summary.title),
          summary: data.summary,
        })
        return
      }

      // Job enqueued — start polling
      setJobId(data.jobId)
      setPhase('processing')

    } catch (err) {
      setApiError('Could not reach the backend. Make sure it is running on port 5000.')
      setPhase('failed')
    }
  }

  // ── Select a recent summary ────────────────────────────────────────────────
  function handleSelectRecent(item) {
    stopPolling()
    setSummary(item.summary)
    setTitle(item.title || '')
    setVideoId(item.videoId)
    setUrl(item.url || `https://www.youtube.com/watch?v=${item.videoId}`)
    setPhase('completed')
    setApiError('')
    setInputError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Reset ────────────────────────────────────────────────────────────────────
  function handleReset() {
    stopPolling()
    setUrl('')
    setInputError('')
    setPhase('idle')
    setJobId(null)
    setProgress(0)
    setVideoId(null)
    setSummary(null)
    setTitle('')
    setApiError('')
  }

  // ── Retry (re-submit same URL) ───────────────────────────────────────────────
  function handleRetry() {
    stopPolling()
    setPhase('idle')
    setJobId(null)
    setProgress(0)
    setSummary(null)
    setApiError('')
    // url is still set — user can just click submit again
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      {/* Header */}
      <header className="header">
        <div className="logo-mark">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#ea580c" />
              </linearGradient>
            </defs>
            <rect x="2" y="5" width="20" height="14" rx="3.5" fill="url(#logo-grad)" />
            <polygon points="10,8.5 16,12 10,15.5" fill="#ffffff" />
          </svg>
        </div>
        <span className="logo-text">YVS</span>
      </header>

      <main className="main">
        {/* Hero text — only on idle */}
        {phase === 'idle' && (
          <div className="hero-text">
            <h1>YouTube Video Summarizer</h1>
            <p className="subtitle">
              Paste any YouTube link and get a concise, AI-generated summary in seconds.
            </p>
          </div>
        )}

        {/* ── IDLE: input form ── */}
        {phase === 'idle' && (
          <form className="card" onSubmit={handleSubmit} noValidate>
            <label htmlFor="yt-url" className="input-label">Video link</label>
            <div className={`input-row ${inputError ? 'has-error' : ''}`}>
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <path d="M12.9 10a2.9 2.9 0 1 1-5.8 0 2.9 2.9 0 0 1 5.8 0Z" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M17.5 10c0 4.14-3.36 7.5-7.5 7.5S2.5 14.14 2.5 10 5.86 2.5 10 2.5s7.5 3.36 7.5 7.5Z" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M10 2.5v15M2.5 10h15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                id="yt-url"
                type="url"
                className="url-input"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => { setUrl(e.target.value); setInputError('') }}
                aria-describedby={inputError ? 'url-error' : undefined}
                autoComplete="off"
                spellCheck="false"
              />
            </div>
            {inputError && (
              <p id="url-error" className="error-msg" role="alert">{inputError}</p>
            )}
            <button type="submit" className="btn-primary">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Generate Summary
            </button>
          </form>
        )}

        {/* ── LOADING: waiting for POST response ── */}
        {phase === 'loading' && (
          <div className="card loading-card">
            <span className="spinner large" aria-label="Submitting…" />
            <p className="loading-text">Submitting your video…</p>
          </div>
        )}

        {/* ── PROCESSING: job in queue ── */}
        {phase === 'processing' && (
          <ProcessingCard
            videoId={videoId}
            progress={progress}
            onCancel={handleReset}
          />
        )}

        {/* ── COMPLETED: show summary ── */}
        {phase === 'completed' && summary && (
          <>
            <SummaryCard
              summary={summary}
              title={title}
              videoId={videoId}
              url={url}
              onReset={handleReset}
            />
            <RecentSummaries
              onSelect={handleSelectRecent}
              currentVideoId={videoId}
            />
          </>
        )}

        {/* ── FAILED: show error ── */}
        {phase === 'failed' && (
          <ErrorCard
            message={apiError}
            onRetry={handleRetry}
            onReset={handleReset}
          />
        )}

        {/* ── Recent Summaries on idle ── */}
        {phase === 'idle' && (
          <RecentSummaries
            onSelect={handleSelectRecent}
            currentVideoId={videoId}
          />
        )}

        {/* Feature pills — only on idle */}
        {phase === 'idle' && (
          <ul className="features" aria-label="Features">
            <li>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8l3 3 7-7" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Fast &amp; accurate
            </li>
            <li>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8l3 3 7-7" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Any video length
            </li>
            <li>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8l3 3 7-7" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              No sign-up needed
            </li>
          </ul>
        )}
      </main>

      <footer className="footer">
        <p>YVS · YouTube Video Summarizer</p>
      </footer>
    </div>
  )
}
