import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const env = import.meta.env;

const realConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** Local development talks to the Firebase emulator, never to a real project. */
export const usingEmulator = env.DEV || env.VITE_USE_EMULATOR === '1';

/** True when this is a real build but nobody has filled in .env yet. */
export const configMissing = !usingEmulator && !realConfig.apiKey;

const app = initializeApp(
  usingEmulator || configMissing
    ? { apiKey: 'demo-key', projectId: 'demo-chicken-yard', authDomain: 'demo-chicken-yard.firebaseapp.com' }
    : realConfig,
);

export const auth = getAuth(app);
export const db = getFirestore(app);

if (usingEmulator) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, location.hostname, 8080);
}
