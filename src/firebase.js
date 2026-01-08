import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your actual configuration
const firebaseConfig = {
  apiKey: "AIzaSyDilO9I-eqhMSoJbpKdC-_x9UAFb_Sksk0",
  authDomain: "n8n-cost-dashboard.firebaseapp.com",
  projectId: "n8n-cost-dashboard",
  storageBucket: "n8n-cost-dashboard.firebasestorage.app",
  messagingSenderId: "921560173940",
  appId: "1:921560173940:web:00ec8811e2e787f20e3021",
  measurementId: "G-C4E1EERTZB"
};

// 1. Initialize the App
const app = initializeApp(firebaseConfig);

// 2. Initialize & Export the Database (Required for the dashboard)
export const db = getFirestore(app);