import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage"; // ✅ Import Storage

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC-LcD9U_r_6zVUVfq8LTlXkHIL2tg3Qq0",
  authDomain: "payout-system-78c2a.firebaseapp.com",
  projectId: "payout-system-78c2a",
  storageBucket: "payout-system-78c2a.firebasestorage.app", // ✅ Corrected Storage Bucket
  messagingSenderId: "541411708523",
  appId: "1:541411708523:web:b8d59fa3fe632f619dab2e"
};

// Initialize primary app
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); // ✅ Initialize Storage

// Initialize secondary app for admin-only operations (user creation, etc.)
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

export { db, auth, secondaryAuth, storage }; // ✅ Export everything