// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your Firebase configuration with hardcoded API keys
const firebaseConfig = {
  apiKey: "AIzaSyAOc8Uu569PJAGMcrX-0Y9JJ60CzVYB_No",
  authDomain: "mailtalk-5a2a4.firebaseapp.com",
  projectId: "mailtalk-5a2a4",
  storageBucket: "mailtalk-5a2a4.firebasestorage.app",
  messagingSenderId: "374657831161",
  appId: "1:374657831161:web:42740748bf77c74fcfd228"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase services and export them
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log("Firebase services initialized in firebase.js with hardcoded config.");
