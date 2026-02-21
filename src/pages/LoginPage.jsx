import { useState } from "react";
import { auth, db } from "../firebase"; // Ensure db is imported and valid
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loginOrRegister = async () => {
    setError("");
    setIsLoading(true);

    if (!email || !password) {
      setError("Please enter both email and password.");
      setIsLoading(false);
      return;
    }

    try {
      let userCredential;
      let isNewUser = false;

      try {
        // Attempt to sign in
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("LoginPage: User logged in:", userCredential.user.email);
      } catch (signInError) {
        // If sign-in fails, attempt to create a new user
        if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/wrong-password' || signInError.code === 'auth/invalid-credential') {
          console.log("LoginPage: User not found or wrong password, attempting registration...");
          try {
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
            isNewUser = true;
            console.log("LoginPage: New user registered with Auth:", userCredential.user.email);

            // CRITICAL: Attempt to create user document in Firestore
            console.log("LoginPage: Attempting to create user document in Firestore for:", email);
            try {
              await setDoc(doc(db, "users", email), {
                email,
                friends: [],
                requests: [],
                pendingSent: [],
                groups: [],
              });
              console.log("LoginPage: User document setDoc operation COMPLETED for:", email);
            } catch (firestoreError) {
              console.error("LoginPage: FATAL ERROR: Failed to create user document in Firestore:", firestoreError);
              setError("Registration failed: Could not create user profile. " + firestoreError.message);
              setIsLoading(false);
              return; // Stop here if Firestore doc creation fails
            }

          } catch (createAuthError) {
            console.error("LoginPage: Error during Firebase Auth user creation:", createAuthError);
            if (createAuthError.code === 'auth/email-already-in-use') {
              setError("This email is already registered. Please try logging in.");
            } else if (createAuthError.code === 'auth/weak-password') {
              setError("Password is too weak. Please choose a stronger password (at least 6 characters).");
            } else if (createAuthError.code === 'auth/invalid-email') {
              setError("Invalid email format.");
            } else {
              setError("Registration failed: " + createAuthError.message);
            }
            setIsLoading(false);
            return;
          }
        } else {
          setError("Login failed: " + signInError.message);
          setIsLoading(false);
          return;
        }
      }

      onLogin(userCredential.user.email, isNewUser);
    } catch (err) {
      setError("An unexpected error occurred: " + err.message);
      console.error("LoginPage: Unexpected error in loginOrRegister (outer catch):", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 p-4 animate-fade-in">
      <div className="bg-white p-8 sm:p-10 rounded-3xl shadow-2xl w-full max-w-md transform transition-all duration-300 hover:scale-[1.01] border border-gray-100 backdrop-blur-sm bg-opacity-90">
        <div className="flex justify-center mb-6">
          <img src="/logo.png" alt="MailTalk Logo" className="h-20 w-20 object-contain rounded-full shadow-lg" onError={(e) => e.target.style.display='none'} />
        </div>

        <h2 className="text-4xl font-extrabold mb-8 text-center text-gray-900 animate-slide-down">
          Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">MailTalk</span>
        </h2>

        <div className="mb-5 relative">
          <input
            type="email"
            placeholder="Your Email"
            className="w-full border border-gray-300 p-4 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-400 transition-all duration-300 text-lg peer"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
          />
          <label
            htmlFor="email"
            className="absolute left-4 -top-3 text-sm text-gray-600 bg-white px-1 peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-focus:-top-3 peer-focus:text-sm peer-focus:text-blue-600 transition-all duration-300 pointer-events-none"
          >
            Email
          </label>
        </div>

        <div className="mb-6 relative">
          <input
            type="password"
            placeholder="Your Password"
            className="w-full border border-gray-300 p-4 rounded-xl focus:outline-none focus:ring-4 focus:ring-purple-200 focus:border-purple-400 transition-all duration-300 text-lg peer"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
          <label
            htmlFor="password"
            className="absolute left-4 -top-3 text-sm text-gray-600 bg-white px-1 peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-focus:-top-3 peer-focus:text-sm peer-focus:text-purple-600 transition-all duration-300 pointer-events-none"
          >
            Password
          </label>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6 animate-fade-in" role="alert">
            <strong className="font-bold">Oops!</strong>
            <span className="block sm:inline ml-2">{error}</span>
          </div>
        )}

        <button
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl font-bold text-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 ease-in-out flex items-center justify-center gap-3"
          onClick={loginOrRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              Login / Register
            </>
          )}
        </button>
      </div>
    </div>
  );
}
