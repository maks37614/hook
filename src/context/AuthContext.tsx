import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { mergeProfileUpdate } from '../utils/hookchartData';
import {
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { cleanForFirestore } from '../lib/firestoreUtils';
import { getStoredPreferences, saveStoredPreferences } from '../utils/userPreferences';
import { DEFAULT_METASCALP_SETTINGS, saveStoredMetaScalpSettings } from '../utils/metaScalpService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  updateProfileData: (updates: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  authErrorCode: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const profileRef = useRef(profile);
  const userRef = useRef(user);
  const profileWriteQueue = useRef<Promise<void>>(Promise.resolve());
  profileRef.current = profile;
  userRef.current = user;
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);

  const clearAuthError = () => {
    setAuthError(null);
    setAuthErrorCode(null);
  };

  // Sync or create user profile in Firestore
  const syncUserProfile = async (firebaseUser: User) => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    try {
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        const storedPrefs = getStoredPreferences();
        const newProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Користувач'),
          photoURL: firebaseUser.photoURL || '',
          soundAlertsEnabled: storedPrefs.soundAlertsEnabled,
          defaultExchange: storedPrefs.defaultExchange,
          defaultMarketType: storedPrefs.defaultMarketType,
          defaultTimeframe: storedPrefs.defaultTimeframe,
          watchlist: [],
          watchlistFolders: {},
          metaScalpSettings: DEFAULT_METASCALP_SETTINGS,
          chartTradeMarkers: { showEntry: true, showTarget: true, showStop: true },
          chartLabelSettings: { entry: true, target: true, stop: true },
          orderbookSettings: { depth: 'all', compression: 1, soundAlertEnabled: true, heightPreset: 'lg' },
          terminalSettings: { columns: 2, blockHeight: 'medium', blocks: [] },
          searchSettings: { minVolumeUsd: 0, presetFilter: 'all', sortBy: 'volume', sortDirection: 'desc' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, cleanForFirestore(newProfile));
        if (auth.currentUser?.uid !== firebaseUser.uid) return;
        setProfile(newProfile);
        saveStoredMetaScalpSettings(newProfile.metaScalpSettings!, firebaseUser.uid);
      } else {
        const loadedProfile = snap.data() as UserProfile;
        if (auth.currentUser?.uid !== firebaseUser.uid) return;
        setProfile(loadedProfile);
        // Sync Firestore profile defaults into website-wide storage
        if (loadedProfile) {
          saveStoredPreferences({
            ...(loadedProfile.defaultExchange ? { defaultExchange: loadedProfile.defaultExchange } : {}),
            ...(loadedProfile.defaultMarketType ? { defaultMarketType: loadedProfile.defaultMarketType } : {}),
            ...(loadedProfile.defaultTimeframe ? { defaultTimeframe: loadedProfile.defaultTimeframe } : {}),
            ...(loadedProfile.soundAlertsEnabled !== undefined ? { soundAlertsEnabled: loadedProfile.soundAlertsEnabled } : {}),
          });
          if (loadedProfile.metaScalpSettings) {
            saveStoredMetaScalpSettings(loadedProfile.metaScalpSettings, firebaseUser.uid);
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
    }
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    // Check existing local session first
    try {
      const sessionRaw = localStorage.getItem('signalhook_local_session');
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        if (session?.accessToken && session.expiresAt > Date.now() && session.user) {
          setUser(session.user);
          if (session.profile) {
            setProfile(session.profile);
          }
          setLoading(false);
        }
      }
    } catch {}

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Firebase user takes precedence
        setUser(currentUser);
        try {
          localStorage.removeItem('signalhook_local_session');
        } catch {}

        await syncUserProfile(currentUser);

        // Realtime listener for profile changes
        const userDocRef = doc(db, 'users', currentUser.uid);
        unsubscribeProfile = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists() && auth.currentUser?.uid === currentUser.uid) {
              const updatedData = docSnap.data() as UserProfile;
              setProfile(updatedData);
              if (updatedData) {
                saveStoredPreferences({
                  ...(updatedData.defaultExchange ? { defaultExchange: updatedData.defaultExchange } : {}),
                  ...(updatedData.defaultMarketType ? { defaultMarketType: updatedData.defaultMarketType } : {}),
                  ...(updatedData.defaultTimeframe ? { defaultTimeframe: updatedData.defaultTimeframe } : {}),
                  ...(updatedData.soundAlertsEnabled !== undefined ? { soundAlertsEnabled: updatedData.soundAlertsEnabled } : {}),
                });
              }
            }
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          }
        );
      } else {
        // If not a Firebase user, check if we have an active local session
        const sessionRaw = localStorage.getItem('signalhook_local_session');
        if (sessionRaw) {
          try {
            const session = JSON.parse(sessionRaw);
            if (session?.accessToken && session.expiresAt > Date.now() && session?.user) {
              setUser(session.user);
              setProfile(session.profile || null);
            } else {
              setUser(null);
              setProfile(null);
            }
          } catch {
            setUser(null);
            setProfile(null);
          }
        } else {
          setUser(null);
          setProfile(null);
        }

        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    setAuthErrorCode(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        await syncUserProfile(result.user);
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Вхід скасовано (вікно було закрите)');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // silently handled
      } else if (err.code === 'auth/popup-blocked') {
        setAuthError('Браузер заблокував спливаюче вікно. Дозвольте pop-up вікна для цього сайту або відкрийте додаток у новій вкладці.');
      } else {
        setAuthError(err.message || 'Помилка авторизації через Google');
      }
      setAuthErrorCode(err.code || null);
      throw err;
    }
  };

  const openServerAccount = async (email: string, password: string, register: boolean, name?: string) => {
    const response = await fetch(`/api/auth/local/${register ? 'register' : 'login'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName: name }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw Object.assign(new Error(result.error || 'Помилка входу'), { status: response.status });
    const saved = localStorage.getItem(`signalhook_profile_${result.user.uid}`);
    const localProfile: UserProfile = saved ? JSON.parse(saved) : {
      ...result.user, soundAlertsEnabled: true, defaultExchange: 'all', defaultMarketType: 'all',
      defaultTimeframe: '1h', watchlist: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('signalhook_local_session', JSON.stringify({
      user: result.user, profile: localProfile, accessToken: result.accessToken, expiresAt: result.expiresAt,
    }));
    if (auth.currentUser) await signOut(auth);
    setUser(result.user); setProfile(localProfile);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    setAuthErrorCode(null);
    const cleanEmail = email.trim().toLowerCase();
    let localError: any;
    try { await openServerAccount(cleanEmail, pass, false); return; }
    catch (error: any) {
      localError = error;
      if (error.status === 429 || !error.status || error.status >= 500) { setAuthError(error.message); throw error; }
    }
    // Existing Firebase email accounts retain their identity and saved data.
    try {
      const result = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      localStorage.removeItem('signalhook_local_session');
      await syncUserProfile(result.user);
    } catch (error: any) {
      setAuthErrorCode(error.code || null);
      setAuthError(localError?.message || 'Невірний email або пароль');
      throw error;
    }
  };

  const registerWithEmail = async (email: string, pass: string, name?: string) => {
    setAuthError(null);
    setAuthErrorCode(null);
    try { await openServerAccount(email.trim().toLowerCase(), pass, true, name); }
    catch (error: any) { setAuthError(error.message || 'Помилка реєстрації'); throw error; }
  };

  const updateProfileData = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    const account = user;
    const write = profileWriteQueue.current.catch(() => {}).then(async () => {
      if (userRef.current?.uid !== account.uid) throw new Error('Обліковий запис змінився. Відкрийте налаштування повторно.');
      const user = account;
      const isLocalUser = Boolean((user as any).isLocalUser);

      const payload = mergeProfileUpdate(profileRef.current?.uid === user.uid ? profileRef.current : {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'Користувач',
        }, {
        ...updates,
        updatedAt: new Date().toISOString(),
      });

      if (
        updates.defaultExchange !== undefined ||
        updates.defaultMarketType !== undefined ||
        updates.defaultTimeframe !== undefined ||
        updates.soundAlertsEnabled !== undefined
      ) {
        saveStoredPreferences({
          ...(updates.defaultExchange ? { defaultExchange: updates.defaultExchange } : {}),
          ...(updates.defaultMarketType ? { defaultMarketType: updates.defaultMarketType } : {}),
          ...(updates.defaultTimeframe ? { defaultTimeframe: updates.defaultTimeframe } : {}),
          ...(updates.soundAlertsEnabled !== undefined ? { soundAlertsEnabled: updates.soundAlertsEnabled } : {}),
        });
      }

      if (isLocalUser) {
        try {
          localStorage.setItem(`signalhook_profile_${user.uid}`, JSON.stringify(payload));
          const session = JSON.parse(localStorage.getItem('signalhook_local_session') || '{}');
          localStorage.setItem('signalhook_local_session', JSON.stringify({ ...session, user, profile: payload }));
        } catch {}
        profileRef.current = payload;
        setProfile(payload);

        // Sync updated Telegram settings to server background monitor
        fetch('/api/alerts/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            alerts: [],
          }),
        }).catch(() => {});
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(
          userDocRef,
          cleanForFirestore({
            ...updates,
            ...(updates.hookChartPreferences ? { hookChartPreferences: payload.hookChartPreferences } : {}),
            updatedAt: new Date().toISOString(),
          })
        );
        if (userRef.current?.uid === user.uid) {
          const current = profileRef.current?.uid === user.uid ? profileRef.current : payload;
          const next = mergeProfileUpdate(current, { ...updates, updatedAt: payload.updatedAt });
          profileRef.current = next;
          setProfile(next);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
        throw err;
      }
    });
    profileWriteQueue.current = write;
    await write;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    try {
      if (!(user as any)?.isLocalUser) {
        await signOut(auth);
      }
    } catch (err) {
      // ignore
    } finally {
      try {
        localStorage.removeItem('signalhook_local_session');
      } catch {}
      setProfile(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        updateProfileData,
        logout,
        authError,
        authErrorCode,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

