import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signInWithCustomToken, signInAnonymously } from "firebase/auth";
import { collection, query, where, onSnapshot, doc, arrayUnion, updateDoc, getDoc } from "firebase/firestore";

import LoginPage from "./pages/LoginPage";
import FriendsPage from "./pages/FriendsPage";
import FriendRequests from "./pages/FriendRequests";
import ChatPage from "./pages/ChatPage";
import CreateGroup from "./pages/CreateGroup";
import GroupsPage from "./pages/GroupsPage";

function App() {
  const [userEmail, setUserEmail] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [view, setView] = useState("home");
  const [unreadCounts, setUnreadCounts] = useState({});
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [isUserDocReady, setIsUserDocReady] = useState(false);

  // --- Firebase Authentication Listener ---
  useEffect(() => {
    console.log("App.jsx: Setting up onAuthStateChanged listener.");
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      console.log("App.jsx: onAuthStateChanged callback triggered.");
      if (user) {
        console.log("App.jsx: User detected by onAuthStateChanged:", user.email);
        setUserEmail(user.email);
        localStorage.setItem("session", JSON.stringify({ email: user.email, timestamp: Date.now() }));

        // Listener for the current user's document to confirm its existence
        const userDocRef = doc(db, "users", user.email);
        const unsubscribeUserDocExistence = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            console.log("App.jsx: User document confirmed to exist via onSnapshot. isUserDocReady = true.");
            setIsUserDocReady(true);
          } else {
            console.log("App.jsx: User document does NOT exist (yet or deleted). isUserDocReady = false.");
            setIsUserDocReady(false);
          }
        }, (error) => {
          console.error("App.jsx: Error listening to user document for existence:", error);
          setIsUserDocReady(false);
        });
        return () => {
          console.log("App.jsx: Cleaning up user document existence listener.");
          unsubscribeUserDocExistence();
        };

      } else {
        console.log("App.jsx: No user detected by onAuthStateChanged. Attempting sign-in.");
        setUserEmail(null);
        setIsUserDocReady(false);
        localStorage.removeItem("session");

        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            console.log("App.jsx: Signing in with custom token.");
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            console.log("App.jsx: Signing in anonymously.");
            await signInAnonymously(auth);
          }
          console.log("App.jsx: Firebase sign-in attempt completed.");
        } catch (error) {
          console.error("App.jsx: Firebase authentication error during initial check:", error);
        }
      }
      setIsAuthChecked(true);
      console.log("App.jsx: Initial authentication check complete. isAuthChecked set to true.");
    });

    return () => {
      console.log("App.jsx: Cleaning up onAuthStateChanged listener.");
      unsubscribeAuth();
    };
  }, []);

  const handleLogin = async (email, isNewUser) => {
    console.log("App.jsx: handleLogin callback received for:", email, "Is New User:", isNewUser);
    setUserEmail(email);
    localStorage.setItem("session", JSON.stringify({ email, timestamp: Date.now() }));
  };

  const handleLogout = async () => {
    console.log("App.jsx: handleLogout called.");
    if (auth) {
      await auth.signOut();
      console.log("App.jsx: Firebase signOut completed.");
    }
    localStorage.removeItem("session");
    window.location.reload();
  };

  // --- Fetch Unread Message Counts ---
  useEffect(() => {
    console.log("App.jsx: useEffect for unread counts mounted/re-ran.");
    console.log("App.jsx: Unread counts setup check: isAuthChecked:", isAuthChecked, "userEmail:", userEmail, "isUserDocReady:", isUserDocReady);

    if (!isAuthChecked || !userEmail || !isUserDocReady) {
      console.log("App.jsx: Skipping unread count listener setup (auth/user/doc not ready).");
      return;
    }

    console.log("App.jsx: Setting up unread message listeners for user:", userEmail);
    const unsubscribes = [];

    const userDocRef = doc(db, "users", userEmail);
    const unsubscribeUserDoc = onSnapshot(userDocRef, (docSnap) => {
      console.log("App.jsx: User document snapshot received for unread counts.");
      if (docSnap.exists()) {
        const userData = docSnap.data();
        const friends = userData.friends || [];
        const groups = userData.groups || [];
        console.log("App.jsx: User document updated. Friends:", friends, "Groups:", groups);

        unsubscribes.forEach(unsub => unsub());
        unsubscribes.length = 0;

        const currentUnreadCounts = {};

        friends.forEach(friendEmail => {
          const privateChatId = [userEmail, friendEmail].sort().join("_");
          const messagesCollectionRef = collection(db, "chats", privateChatId, "messages");
          const q = query(
            messagesCollectionRef,
            where("sender", "==", friendEmail)
          );

          const unsubscribeChat = onSnapshot(q, (snapshot) => {
            const unreadCount = snapshot.docs.filter(doc => {
              const msgData = doc.data();
              return !msgData.readBy?.includes(userEmail);
            }).length;

            currentUnreadCounts[friendEmail] = unreadCount;
            setUnreadCounts(prevCounts => ({ ...prevCounts, [friendEmail]: unreadCount }));
            console.log(`App.jsx: Unread count for ${friendEmail}: ${unreadCount}`);
          }, (error) => {
            console.error(`App.jsx: Error listening to unread messages for ${friendEmail}:`, error);
          });
          unsubscribes.push(unsubscribeChat);
        });

        groups.forEach(groupId => {
          const messagesCollectionRef = collection(db, "chats", `group_${groupId}`, "messages");
          const q = query(
            messagesCollectionRef,
            where("sender", "!=", userEmail)
          );

          const unsubscribeGroupChat = onSnapshot(q, (snapshot) => {
            const unreadCount = snapshot.docs.filter(doc => {
              const msgData = doc.data();
              return !msgData.readBy?.includes(userEmail);
            }).length;

            currentUnreadCounts[groupId] = unreadCount;
            setUnreadCounts(prevCounts => ({ ...prevCounts, [groupId]: unreadCount }));
            console.log(`App.jsx: Unread count for group ${groupId}: ${unreadCount}`);
          }, (error) => {
            console.error(`App.jsx: Error listening to unread messages for group ${groupId}:`, error);
          });
          unsubscribes.push(unsubscribeGroupChat);
        });

        setUnreadCounts({ ...currentUnreadCounts });

      } else {
        setUnreadCounts({});
        console.warn(`App.jsx: User document for ${userEmail} not found for unread counts. This might be a new user.`);
        setIsUserDocReady(false);
      }
    }, (error) => {
      console.error("App.jsx: Error listening to user document for friends/groups:", error);
    });
    unsubscribes.push(unsubscribeUserDoc);

    return () => {
      console.log("App.jsx: Cleaning up all unread message listeners.");
      unsubscribes.forEach(unsub => unsub());
    };
  }, [isAuthChecked, userEmail, isUserDocReady]);

  // --- Conditional Rendering based on Authentication and User Document Readiness ---
  console.log("App.jsx: Render cycle. isAuthChecked:", isAuthChecked, "userEmail:", userEmail, "isUserDocReady:", isUserDocReady);

  if (!isAuthChecked || (userEmail && !isUserDocReady)) {
    console.log("App.jsx: Rendering Loading screen.");
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="flex flex-col items-center">
          <svg className="animate-spin h-10 w-10 text-indigo-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-lg text-gray-700">Loading MailTalk...</p>
        </div>
      </div>
    );
  }

  if (!userEmail) {
    console.log("App.jsx: Rendering LoginPage (userEmail is null).");
    return <LoginPage onLogin={handleLogin} auth={auth} db={db} />;
  }

  if (selectedFriend || selectedGroup) {
    console.log("App.jsx: Rendering ChatPage.");
    return (
      <ChatPage
        currentUser={userEmail}
        selectedFriend={selectedFriend}
        selectedGroup={selectedGroup}
        onBack={() => {
          setSelectedFriend(null);
          setSelectedGroup(null);
        }}
      />
    );
  }

  console.log("App.jsx: Showing Main Dashboard.");
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 animate-fade-in">
      {/* Sidebar Navigation */}
      <nav className="w-64 bg-indigo-700 text-white flex flex-col p-4 shadow-2xl z-10 relative">
        {/* App Logo and Title */}
        <div className="flex items-center justify-center mb-8 py-2 border-b border-indigo-600">
          <img src="/logo.png" alt="MailTalk Logo" className="h-12 w-12 mr-3 object-contain rounded-full shadow-lg" onError={(e) => e.target.style.display='none'} />
          <span className="text-3xl font-extrabold text-white">MailTalk</span>
        </div>

        {/* User Profile Section */}
        <div className="mb-8 p-3 bg-indigo-600 rounded-xl flex flex-col items-center gap-3 shadow-inner">
          <div className="h-16 w-16 bg-indigo-400 flex items-center justify-center text-3xl font-semibold text-white border-2 border-indigo-300">
            {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
          </div>
          <span className="font-medium text-lg text-white truncate w-full text-center">{userEmail}</span>
        </div>

        {/* Navigation Links */}
        <ul className="flex-1 space-y-3">
          <li>
            <button
              className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 transform hover:scale-105 hover:bg-indigo-600 ${
                view === "home" ? "bg-indigo-800 shadow-md" : ""
              }`}
              onClick={() => setView("home")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m0 0l-7 7m7-7v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-lg font-medium">Home</span>
            </button>
          </li>
          <li>
            <button
              className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 transform hover:scale-105 hover:bg-indigo-600 ${
                view === "createGroup" ? "bg-indigo-800 shadow-md" : ""
              }`}
              onClick={() => setView("createGroup")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-lg font-medium">Create Group</span>
            </button>
          </li>
          <li>
            <button
              className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 transform hover:scale-105 hover:bg-indigo-600 ${
                view === "friendRequests" ? "bg-indigo-800 shadow-md" : ""
              }`}
              onClick={() => setView("friendRequests")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span className="text-lg font-medium">Friend Requests</span>
            </button>
          </li>
        </ul>

        {/* Logout Button */}
        <div className="mt-auto pt-4 border-t border-indigo-600">
          <button
            className="flex items-center w-full p-3 rounded-lg bg-red-600 hover:bg-red-700 transition-colors duration-200 font-semibold shadow-md transform hover:scale-105"
            onClick={handleLogout}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="text-lg">Logout</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {view === "home" && (
          <div className="w-full max-w-7xl mx-auto bg-white rounded-2xl shadow-xl p-6 lg:p-8 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
              <h1 className="text-3xl font-extrabold text-gray-800 animate-slide-down">
                Dashboard
              </h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Friends Page (Left, Wider): Takes 2 columns on large screens */}
              <div className="lg:col-span-2 bg-blue-50 p-6 rounded-xl shadow-md transform transition-transform duration-300 hover:scale-[1.01] animate-slide-left">
                <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2 border-blue-200">
                  <span className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h2a2 2 0 002-2V7a2 2 0 00-2-2h-2V3a1 1 0 00-1-1H8a1 1 0 00-1 1v2H5a2 2 0 00-2 2v11a2 2 0 002 2h2v-2.5A1.5 1.5 0 018.5 16h7a1.5 1.5 0 011.5 1.5V20zm0 0H7" />
                    </svg>
                    Your Friends
                  </span>
                </h2>
                {/* Pass unreadCounts to FriendsPage */}
                <FriendsPage
                  currentUser={userEmail}
                  onSelectFriend={setSelectedFriend}
                  unreadCounts={unreadCounts}
                />
              </div>

              {/* Groups Page (Right, Wider): Takes 2 columns on large screens */}
              <div className="lg:col-span-2 bg-purple-50 p-6 rounded-xl shadow-md transform transition-transform duration-300 hover:scale-[1.01] animate-slide-up">
                <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2 border-purple-200">
                  <span className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h2a2 2 0 002-2V7a2 2 0 00-2-2h-2V3a1 1 0 00-1-1H8a1 1 0 00-1 1v2H5a2 2 0 00-2 2v11a2 2 0 002 2h2v-2.5A1.5 1.5 0 018.5 16h7a1.5 1.5 0 011.5 1.5V20zm0 0H7" />
                    </svg>
                    Your Groups
                  </span>
                </h2>
                {/* Pass unreadCounts to GroupsPage */}
                <GroupsPage
                  currentUser={userEmail}
                  onSelectGroup={setSelectedGroup}
                  unreadCounts={unreadCounts}
                />
              </div>
            </div>
          </div>
        )}

        {view === "createGroup" && (
          <div className="w-full max-w-lg mx-auto animate-fade-in">
            <CreateGroup currentUser={userEmail} />
          </div>
        )}

        {view === "friendRequests" && (
          <div className="w-full max-w-xl mx-auto animate-fade-in">
            <button
              className="mb-6 text-blue-600 hover:text-blue-800 underline flex items-center gap-2 font-medium transition-all duration-200"
              onClick={() => setView("home")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Back to Home
            </button>
            <FriendRequests currentUser={userEmail} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
