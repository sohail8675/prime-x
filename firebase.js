import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Tumhari Asli Configuration ✅
const firebaseConfig = {
  apiKey: "AIzaSyBV6p6FDRkqjs0fPDfOpTKI4xnrsvNH-B0",
  authDomain: "primex-8675.firebaseapp.com",
  projectId: "primex-8675",
  storageBucket: "primex-8675.firebasestorage.app",
  messagingSenderId: "590870286802",
  appId: "1:590870286802:web:1d70167e373e46d9cc380b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

console.log("🔥 Firebase Connected Successfully to: primex-8675");

export { app, db, auth };