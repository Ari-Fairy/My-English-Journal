import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Read from client-side environment variables (perfect for Vercel/production)
// with standard fallback to the AI Studio development configuration file.
const getEnvValue = (key: string, fallback: string): string => {
  const val = import.meta.env[key];
  if (typeof val === "string" && val.trim() !== "" && val !== "undefined" && val !== "null") {
    return val;
  }
  return fallback;
};

const config = {
  apiKey: getEnvValue("VITE_FIREBASE_API_KEY", firebaseConfig.apiKey),
  authDomain: getEnvValue("VITE_FIREBASE_AUTH_DOMAIN", firebaseConfig.authDomain),
  projectId: getEnvValue("VITE_FIREBASE_PROJECT_ID", firebaseConfig.projectId),
  storageBucket: getEnvValue("VITE_FIREBASE_STORAGE_BUCKET", firebaseConfig.storageBucket),
  messagingSenderId: getEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID", firebaseConfig.messagingSenderId),
  appId: getEnvValue("VITE_FIREBASE_APP_ID", firebaseConfig.appId),
  measurementId: getEnvValue("VITE_FIREBASE_MEASUREMENT_ID", firebaseConfig.measurementId),
};

const databaseId = getEnvValue("VITE_FIREBASE_DATABASE_ID", firebaseConfig.firestoreDatabaseId || "(default)");

// Initialize Firebase App
const app = initializeApp(config);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Firestore with settings optimized for sandboxed iframes and restrictive network/privacy settings
const firestoreSettings = {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  localCache: memoryLocalCache()
};

export const db = databaseId && databaseId !== "(default)"
  ? initializeFirestore(app, firestoreSettings, databaseId)
  : initializeFirestore(app, firestoreSettings);

