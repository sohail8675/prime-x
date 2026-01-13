import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Login function with HEAVY LOGGING
async function loginUser(email, password) {
    console.log("👉 Step 1: Login process start hua...");
    try {
        // 1. Authenticate
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("✅ Step 2: Password sahi hai. User UID mil gaya:", user.uid);

        // 2. Read role from 'users' collection
        console.log("👉 Step 3: Database se Role dhund rahe hain...");
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        let role = "Unknown";
        if (userDoc.exists()) {
            role = userDoc.data().role;
            console.log("✅ Step 4: Role mil gaya:", role);
        } else {
            console.error("❌ ERROR: Database me is UID ka document nahi mila!");
            console.error("Check karo: Firestore > users > " + user.uid);
            alert("Login Error: User database me nahi mila. Step 2 dobara check karo.");
            throw new Error("User document missing");
        }

        // 3. Log entry create karna
        try {
            await addDoc(collection(db, "loginLogs"), {
                uid: user.uid,
                role: role,
                timestamp: serverTimestamp()
            });
            console.log("✅ Step 5: Login log save ho gaya.");
        } catch(err) {
            console.warn("⚠️ Log save nahi hua (Rules check karo), par login continue hoga.");
        }

        return { uid: user.uid, role: role };

    } catch (error) {
        console.error("❌ LOGIN FAILED:", error.message);
        throw error; // UI ko batane ke liye error wapas pheko
    }
}

async function logoutUser() {
    try {
        await signOut(auth);
        console.log("Logged out");
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

function watchAuth(callback) {
    onAuthStateChanged(auth, (user) => {
        callback(user);
    });
}

export { loginUser, logoutUser, watchAuth };