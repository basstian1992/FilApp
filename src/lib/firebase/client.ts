import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDFIOBb_k-WbutDSXyrcz4-MhEiZx0pmUE",
  authDomain: "filapp-f5682.firebaseapp.com",
  projectId: "filapp-f5682",
  storageBucket: "filapp-f5682.firebasestorage.app",
  messagingSenderId: "913826262699",
  appId: "1:913826262699:web:35c51f954bf801c65bd1ee",
  measurementId: "G-4G5QR939DY"
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
