// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
   apiKey: "AIzaSyC-LcD9U_r_6zVUVfq8LTlXkHIL2tg3Qq0",
  authDomain: "payout-system-78c2a.firebaseapp.com",
  projectId: "payout-system-78c2a",
  storageBucket: "payout-system-78c2a.firebasestorage.app",
  messagingSenderId: "541411708523",
  appId: "1:541411708523:web:b8d59fa3fe632f619dab2e"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);