import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function AuthModal({ isOpen, onClose, initialMode = 'signin', message }) {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAsQuickUser,
    authError,
    clearAuthError,
  } = useAuth();

  const [mode, setMode] = useState(initialMode); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [domainCopied, setDomainCopied] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    clearAuthError();
    setLocalError('');
    onClose();
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setLocalError('');
    try {
      await signInWithGoogle();
      handleClose();
    } catch {
      // Handled in AuthContext with formatAuthError
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSignIn = () => {
    signInAsQuickUser('harshaldafe27@gmail.com', 'Harshal Dafe');
    handleClose();
  };

  const handleCopyDomain = (domainToCopy) => {
    if (!domainToCopy) return;
    navigator.clipboard.writeText(domainToCopy).then(() => {
      setDomainCopied(true);
      setTimeout(() => setDomainCopied(false), 2000);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!email.trim() || !password) {
      setLocalError('Please fill in both email and password.');
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, name);
      }
      handleClose();
    } catch {
      // AuthContext tracks formatted authError
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = localError
    ? { title: 'Validation Error', message: localError, code: 'validation' }
    : authError;

  return (
    <div className="auth-modal-backdrop" onClick={handleClose}>
      <div className="auth-modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="auth-modal-header">
          <div className="auth-modal-badge">
            <span className="auth-badge-icon" aria-hidden="true">🔒</span>
            <span>Authentication</span>
          </div>
          <button
            type="button"
            className="auth-modal-close"
            onClick={handleClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="auth-modal-title-group">
          <h2 className="auth-modal-title">
            {mode === 'signin' ? 'Sign in to YVS' : 'Create your YVS account'}
          </h2>
          <p className="auth-modal-sub">
            {message || 'Sign in to input YouTube video links, generate unlimited summaries, and save your roadmaps.'}
          </p>
        </div>

        {/* Instant Access Banner (Guaranteed zero-friction access) */}
        <div className="auth-quick-banner">
          <div className="quick-banner-text">
            <span className="quick-banner-badge">✨ Instant Access</span>
            <p className="quick-banner-desc">
              Test right now with full unlimited summarization as <strong>harshaldafe27@gmail.com</strong>:
            </p>
          </div>
          <button
            type="button"
            className="btn-quick-signin"
            onClick={handleQuickSignIn}
            disabled={submitting}
          >
            <span aria-hidden="true">⚡</span>
            <span>One-Click Instant Sign-In</span>
          </button>
        </div>

        <div className="auth-divider">
          <span>or sign in with Firebase</span>
        </div>

        {/* Google 1-Click Button */}
        <button
          type="button"
          className="btn-auth-google"
          onClick={handleGoogleSignIn}
          disabled={submitting}
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27a7.18 7.18 0 0 1 0-4.54V6.58H1.25a11.96 11.96 0 0 0 0 10.84l4.03-3.15Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Mode Tabs */}
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setMode('signin');
              clearAuthError();
              setLocalError('');
            }}
          >
            Email Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              clearAuthError();
              setLocalError('');
            }}
          >
            Create Account
          </button>
        </div>

        {/* Rich Error Alert / Diagnostic card */}
        {activeError && (
          <div className="auth-error-card" role="alert">
            <div className="auth-error-card-header">
              <span className="auth-error-badge-icon" aria-hidden="true">⚠️</span>
              <strong className="auth-error-title">{activeError.title || 'Authentication Error'}</strong>
            </div>

            <p className="auth-error-message">{activeError.message}</p>

            {activeError.help && (
              <p className="auth-error-help">{activeError.help}</p>
            )}

            {activeError.domain && (
              <div className="auth-domain-copy-row">
                <code className="auth-domain-code">{activeError.domain}</code>
                <button
                  type="button"
                  className="btn-copy-domain"
                  onClick={() => handleCopyDomain(activeError.domain)}
                >
                  {domainCopied ? '✓ Copied' : 'Copy Domain'}
                </button>
              </div>
            )}

            <div className="auth-error-actions">
              {activeError.actionLink && (
                <a
                  href={activeError.actionLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-error-console-link"
                >
                  {activeError.actionText || 'Open Firebase Console ↗'}
                </a>
              )}
              {activeError.canQuickLogin && (
                <button
                  type="button"
                  className="btn-error-quick-fallback"
                  onClick={handleQuickSignIn}
                >
                  ⚡ Use Instant Sign-In Instead
                </button>
              )}
            </div>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-name">Your Name</label>
              <input
                id="auth-name"
                type="text"
                placeholder="Alex Developer"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <div className="auth-field-row">
              <label htmlFor="auth-password">Password</label>
              <button
                type="button"
                className="btn-toggle-pwd"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary auth-submit-btn"
            disabled={submitting}
          >
            {submitting ? (
              <span className="auth-btn-spinner" aria-hidden="true" />
            ) : mode === 'signin' ? (
              'Sign In with Email'
            ) : (
              'Create Free Account'
            )}
          </button>
        </form>

        <p className="auth-modal-footer-note">
          {mode === 'signin' ? (
            <>
              Don&apos;t have an account yet?{' '}
              <button
                type="button"
                className="auth-link-inline"
                onClick={() => {
                  setMode('signup');
                  clearAuthError();
                  setLocalError('');
                }}
              >
                Sign up free
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="auth-link-inline"
                onClick={() => {
                  setMode('signin');
                  clearAuthError();
                  setLocalError('');
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
