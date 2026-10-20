// DOM profile tests exercise local persistence without loading Firebase clients
// or the application's boot-time Firestore connection probe.
import { registerHooks } from 'node:module';

const unexpected = `const unexpected = () => { throw new Error('Cloud Firebase access is forbidden in the offline DOM fixture'); };`;
const sources = {
  'firebase/auth': `${unexpected}
    export class GoogleAuthProvider {}
    export const signInWithPopup = unexpected, signInWithEmailAndPassword = unexpected,
      createUserWithEmailAndPassword = unexpected, updateProfile = unexpected, signOut = unexpected;
    export const onAuthStateChanged = (_auth, callback) => {
      let active = true;
      queueMicrotask(() => { if (active) callback(null); });
      return () => { active = false; };
    };`,
  'firebase/firestore': `${unexpected}
    export const doc = unexpected, collection = unexpected, getDoc = unexpected,
      setDoc = unexpected, updateDoc = unexpected, deleteDoc = unexpected,
      onSnapshot = unexpected, query = unexpected, orderBy = unexpected,
      writeBatch = unexpected, getDocs = unexpected;
    export const terminate = async () => {};`,
};
registerHooks({
  resolve(specifier, context, next) {
    if (sources[specifier]) return { url: `signalhook-fixture:${specifier}`, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    const source = url.endsWith('/src/firebase.ts')
      ? 'export const auth = { currentUser: null }; export const db = { fixtureOnly: true };'
      : sources[url.replace('signalhook-fixture:', '')];
    if (source) return { format: 'module', source, shortCircuit: true };
    return next(url, context);
  },
});
