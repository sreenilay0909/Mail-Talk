import { useEffect, useState } from "react";
import { db } from "../firebase"; // Import db
import {
  collection,
  query,
  onSnapshot, // Use onSnapshot for real-time updates
  doc,
  updateDoc,
  arrayRemove,
  arrayUnion,
} from "firebase/firestore";

export default function FriendsPage({ currentUser, onSelectFriend, unreadCounts }) {
  const [allRegisteredUsers, setAllRegisteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  // States to track current user's relationships
  const [myFriends, setMyFriends] = useState([]);
  const [myRequests, setMyRequests] = useState([]); // Requests received by currentUser
  const [myPendingSent, setMyPendingSent] = useState([]); // Requests sent by currentUser

  // --- Real-time Listener for ALL Registered Users and Current User's Relationships ---
  useEffect(() => {
    console.log("FriendsPage: Setting up real-time listener for ALL registered users and current user's relationships.");
    if (!currentUser) {
      setIsLoadingUsers(false);
      return;
    }

    // Listener for all user documents (to display everyone)
    const usersCollectionRef = collection(db, "users");
    const allUsersUnsubscribe = onSnapshot(
      usersCollectionRef,
      (snapshot) => {
        const usersList = snapshot.docs
          .map((doc) => doc.data().email)
          .filter(email => email !== currentUser); // Exclude self
        setAllRegisteredUsers(usersList);
        console.log("FriendsPage: All registered users list updated in real-time:", usersList);
      },
      (error) => {
        console.error("FriendsPage: Error fetching real-time all users:", error);
        setError("Failed to load users. Please try again.");
      }
    );

    // Listener for current user's document to get their friends, requests, and pendingSent
    const currentUserDocRef = doc(db, "users", currentUser);
    const myRelationshipsUnsubscribe = onSnapshot(
      currentUserDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          setMyFriends(userData.friends || []);
          setMyRequests(userData.requests || []);
          setMyPendingSent(userData.pendingSent || []); // Update pendingSent state
          console.log("FriendsPage: Current user's relationships updated:", userData);
        } else {
          // This might happen for a brand new user whose document isn't fully initialized yet
          // or if there's a delay in document creation.
          setMyFriends([]);
          setMyRequests([]);
          setMyPendingSent([]);
          console.log("FriendsPage: Current user document not found for relationships.");
        }
        setIsLoadingUsers(false); // Only set loading to false after both listeners are active
      },
      (error) => {
        console.error("FriendsPage: Error fetching real-time current user relationships:", error);
        setError("Failed to load your relationships. Please try again.");
        setIsLoadingUsers(false);
      }
    );

    // Cleanup listeners on component unmount or currentUser change
    return () => {
      console.log("FriendsPage: Cleaning up all listeners.");
      allUsersUnsubscribe();
      myRelationshipsUnsubscribe();
    };
  }, [currentUser]); // Re-run when currentUser changes

  // Filtered users for display based on search term
  const filteredUsersForDisplay = allRegisteredUsers.filter(user =>
    user.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- Send Friend Request Function ---
  const handleSendFriendRequest = async (recipientEmail) => {
    setError("");
    console.log("FriendsPage: Attempting to send friend request to:", recipientEmail);
    try {
      // 1. Add recipient to current user's 'pendingSent' array
      const currentUserDocRef = doc(db, "users", currentUser);
      await updateDoc(currentUserDocRef, {
        pendingSent: arrayUnion(recipientEmail),
      });

      // 2. Add current user to recipient's 'requests' array
      const recipientDocRef = doc(db, "users", recipientEmail);
      await updateDoc(recipientDocRef, {
        requests: arrayUnion(currentUser),
      });

      console.log("FriendsPage: Friend request sent to:", recipientEmail);
    } catch (err) {
      console.error("FriendsPage: Error sending friend request:", err);
      setError("Failed to send friend request: " + err.message);
    }
  };

  // --- Get Button/Status for a User ---
  const getUserStatusAndButton = (userEmailItem) => {
    if (myFriends.includes(userEmailItem)) {
      return { status: "friend", text: "Chat", action: () => onSelectFriend(userEmailItem), icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ), className: "bg-indigo-500 hover:bg-indigo-600" };
    } else if (myPendingSent.includes(userEmailItem)) {
      return { status: "pending", text: "Pending", action: null, icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ), className: "bg-yellow-500 cursor-not-allowed" };
    } else if (myRequests.includes(userEmailItem)) {
      // This case means someone sent a request to currentUser,
      // and currentUser is viewing them on the "All Users" list.
      // They should handle this on the FriendRequests page.
      return { status: "incoming", text: "Incoming Request", action: null, icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ), className: "bg-blue-500 cursor-not-allowed" };
    } else {
      return { status: "none", text: "Send Request", action: () => handleSendFriendRequest(userEmailItem), icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      ), className: "bg-green-500 hover:bg-green-600" };
    }
  };

  if (isLoadingUsers) {
    return (
      <div className="flex justify-center items-center h-48">
        <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="ml-3 text-gray-600">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-gray-800">All Users</h3>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
          {error}
        </div>
      )}

      {/* Search Bar (filters locally) */}
      <div className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder="Filter users by email..."
          className="flex-1 border border-gray-300 rounded-full p-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Display All Users (filtered by search term) */}
      {filteredUsersForDisplay.length === 0 && searchTerm.trim() ? (
        <p className="text-gray-600 text-center">No users match your filter: "{searchTerm}".</p>
      ) : filteredUsersForDisplay.length === 0 && !searchTerm.trim() ? (
        <p className="text-gray-600 text-center">No other users registered yet.</p>
      ) : (
        <ul className="space-y-3">
          {filteredUsersForDisplay.map((userEmailItem) => {
            const { status, text, action, icon, className } = getUserStatusAndButton(userEmailItem);
            return (
              <li
                key={userEmailItem}
                className="flex items-center justify-between bg-gray-50 p-4 rounded-lg shadow-sm hover:bg-gray-100 transition-colors"
              >
                <div
                  className="flex items-center flex-1"
                  // Only allow clicking to chat if they are actual friends
                  onClick={() => status === "friend" && onSelectFriend(userEmailItem)}
                  style={{ cursor: status === "friend" ? "pointer" : "default" }}
                >
                  <div className="h-10 w-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-800 font-semibold mr-3">
                    {userEmailItem.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-gray-800 flex-1 truncate">{userEmailItem}</span>
                  {/* Display unread count if available and they are friends */}
                  {status === "friend" && unreadCounts[userEmailItem] > 0 && (
                    <span className="ml-2 px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full animate-bounce-in">
                      {unreadCounts[userEmailItem]}
                    </span>
                  )}
                </div>
                {/* Action Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent parent li onClick
                    action && action(); // Only call action if it exists
                  }}
                  className={`ml-4 px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-1 ${className}`}
                  disabled={status === "pending" || status === "incoming"} // Disable if pending or incoming
                >
                  {icon}
                  {text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
