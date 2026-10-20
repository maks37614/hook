import { registerHooks } from 'node:module';

// The integration fixture never connects to Firebase or sends a Telegram message.
const firestore = `
  const state = () => globalThis.__alertsFixture;
  export const doc = (_db, ...parts) => parts.join('/');
  export const collection = doc;
  export const query = ref => ref;
  export const orderBy = () => null;
  export const onSnapshot = (ref, callback) => {
    state().listeners.set(ref, callback);
    return () => { if (state().listeners.get(ref) === callback) state().listeners.delete(ref); };
  };
  export const setDoc = async (ref, value) => { state().writes.push({ ref, value }); };
  export const deleteDoc = async ref => { state().deletes.push(ref); };
  export const getDocs = async () => ({ forEach() {} });
  export const writeBatch = () => {
    const operations = [];
    return { set: (ref, value) => operations.push(() => setDoc(ref, value)),
      delete: ref => operations.push(() => deleteDoc(ref)),
      commit: async () => { for (const operation of operations) await operation(); } };
  };
`;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'firebase/firestore') return { url: 'alerts-fixture:firestore', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    const source = url === 'alerts-fixture:firestore' ? firestore
      : url.endsWith('/src/firebase.ts') ? 'export const db = {}; export const auth = {};'
      : url.endsWith('/src/context/AuthContext.tsx') ? 'export const useAuth = () => globalThis.__alertsFixture.auth;'
      : null;
    return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
  },
});
