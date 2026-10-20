import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Popup sign-in uses the project's existing, registered Firebase callback.
// A custom auth domain requires an explicitly configured OAuth client as well.
const authDomain = import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain;
const app = initializeApp({ ...firebaseConfig, authDomain });
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Critical constraint: Validate connection to Firestore on boot gracefully
export async function testConnection() {
  try {
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore connection timeout')), 3000))
    ]);
  } catch (error) {
    // Graceful offline fallback / notice
    console.debug('Firestore running in offline or sandbox mode.');
  }
}
// Server rendering and unit tests must not initiate reads from the live database.
if (typeof window !== 'undefined') void testConnection();

