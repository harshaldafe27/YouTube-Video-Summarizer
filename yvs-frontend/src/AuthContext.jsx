import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';

const SESSION_STORAGE_KEY = 'yvs_active_user_session';
const FIREBASE_PROJECT_ID = 'gen-lang-client-0353651970';

export function formatAuthError(err) {
  if (!err) return null;
  const code = err.code || '';
  const rawMessage = err.message || '';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      title: 'Email/Password Provider Not Enabled',
      message: 'Email & Password authentication is not yet enabled in your Firebase Console.',
      help: 'In new Firebase projects, only Google Sign-In is configured by default. You can enable Email/Password with one toggle in the Firebase console, or use Instant Sign-In.',
      actionLink: `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`,
      actionText: 'Open Firebase Auth Providers ↗',
      canQuickLogin: true,
    };
  }

  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      title: 'Domain Not Authorized in Firebase',
      message: `The preview domain "${currentHost}" is not on your Firebase Authorized Domains list.`,
      help: 'Google Sign-In popups require this domain to be added to Firebase Authentication Settings, or you can use Instant Sign-In right now.',
      domain: currentHost,
      actionLink: `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`,
      actionText: 'Open Firebase Settings ↗',
      canQuickLogin: true,
    };
  }

  if (code === 'auth/popup-blocked') {
    return {
      code,
      title: 'Pop-up Window Blocked',
      message: 'Your browser prevented the Google Sign-In popup from opening.',
      help: 'Please allow pop-ups for this site in your browser address bar, or use Instant Sign-In.',
      canQuickLogin: true,
    };
  }

  if (code === 'auth/popup-closed-by-user') {
    return {
      code,
      title: 'Sign-In Window Closed',
      message: 'The Google Sign-In popup was closed before completing login.',
      help: 'You can retry Google sign-in or use Instant Sign-In.',
      canQuickLogin: true,
    };
  }

  if (code === 'auth/network-request-failed') {
    return {
      code,
      title: 'Network / Cookie Restriction',
      message: 'Third-party cookies or pop-ups may be restricted inside the embedded preview.',
      help: 'Use Instant Sign-In to immediately unlock full functionality without browser cookie issues.',
      canQuickLogin: true,
    };
  }

  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return {
      code,
      title: 'Invalid Credentials',
      message: 'Invalid email or password. If you have not created an account yet, switch to "Create Account".',
      help: 'Check your email spelling or password.',
      canQuickLogin: true,
    };
  }

  if (code === 'auth/email-already-in-use') {
    return {
      code,
      title: 'Email Already In Use',
      message: 'An account with this email address already exists. Please switch to "Sign In".',
    };
  }

  if (code === 'auth/weak-password') {
    return {
      code,
      title: 'Password Too Short',
      message: 'Password must be at least 6 characters.',
    };
  }

  if (code === 'auth/invalid-email') {
    return {
      code,
      title: 'Invalid Email',
      message: 'Please enter a valid email address.',
    };
  }

  return {
    code: code || 'auth/error',
    title: 'Authentication Error',
    message: rawMessage || 'An unexpected error occurred during authentication.',
    help: 'You can use Instant Sign-In to access all features immediately.',
    canQuickLogin: true,
  };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [quickUser, setQuickUser] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        // Clear quick session when real Firebase user signs in
        try {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {}
        setQuickUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const currentUser = firebaseUser || quickUser;

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (err) {
      console.error('[Auth] Google Sign-In error:', err);
      const formatted = formatAuthError(err);
      if (err.code !== 'auth/cancelled-popup-request') {
        setAuthError(formatted);
      }
      throw err;
    }
  };

  const signInWithEmail = async (email, password) => {
    setAuthError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      return result.user;
    } catch (err) {
      console.error('[Auth] Email Sign-In error:', err);
      setAuthError(formatAuthError(err));
      throw err;
    }
  };

  const signUpWithEmail = async (email, password, displayName) => {
    setAuthError(null);
    try {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName?.trim()) {
        await updateProfile(result.user, { displayName: displayName.trim() });
      }
      return result.user;
    } catch (err) {
      console.error('[Auth] Email Sign-Up error:', err);
      setAuthError(formatAuthError(err));
      throw err;
    }
  };

  const signInAsQuickUser = (customEmail, customName) => {
    const email = customEmail || 'harshaldafe27@gmail.com';
    const displayName = customName || 'Harshal Dafe';
    const userObj = {
      uid: 'usr_' + Math.random().toString(36).substring(2, 10),
      email,
      displayName,
      photoURL: null,
      emailVerified: true,
      isQuickUser: true,
    };
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userObj));
    } catch (e) {
      console.warn('[Auth] Could not persist quick user:', e);
    }
    setQuickUser(userObj);
    setAuthError(null);
    return userObj;
  };

  const signOutUser = async () => {
    setAuthError(null);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {}
    setQuickUser(null);
    try {
      await signOut(auth);
    } catch (err) {
      console.error('[Auth] Sign-out error:', err);
    }
  };

  const clearAuthError = () => setAuthError(null);

  const value = {
    currentUser,
    firebaseUser,
    authLoading,
    authError,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAsQuickUser,
    signOutUser,
    clearAuthError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

