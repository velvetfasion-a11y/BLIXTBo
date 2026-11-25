import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { type Firestore, connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

export function firebaseConfigured() {
  return Boolean(config.projectId && config.apiKey && config.appId);
}

export function usingEmulators() {
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";
}

function app(): FirebaseApp {
  if (getApps().length) return getApp();
  return initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
    storageBucket: config.storageBucket,
  });
}

let authEmulator = false;
let firestoreEmulator = false;

export function firebaseAuth(): Auth {
  const auth = getAuth(app());
  if (usingEmulators() && !authEmulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    authEmulator = true;
  }
  return auth;
}

export function firebaseDb(): Firestore {
  const db = getFirestore(app());
  if (usingEmulators() && !firestoreEmulator) {
    connectFirestoreEmulator(db, "127.0.0.1", 8088);
    firestoreEmulator = true;
  }
  return db;
}
