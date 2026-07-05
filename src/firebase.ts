import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Перезаписываем authDomain на тот, который точно разрешен в консоли Firebase
const customConfig = {
  ...firebaseConfig,
  authDomain: "centered-kayak-xcf5x.firebaseapp.com"
};

// Initialize Firebase App с обновленным конфигом
const app = initializeApp(customConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Firestore with the custom database ID provided in config
export const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId || "(default)");
