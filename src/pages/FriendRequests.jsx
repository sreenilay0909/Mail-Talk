import { useEffect, useState } from "react";
import { db } from "../firebase"; // Import db
import {
  doc,
  onSnapshot, // Use onSnapshot for real-time updates
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

export default function FriendRequests({ currentUser }) {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // --- Real-time Friend Requests Listener ---
  useEffect(() => {
    console.log("FriendRequests: Setting up real-time listener for requests for:", currentUser);
    if (!currentUser) {
      setIsLoading(false);
      return;
    }

    const userDocRef = doc(db, "users", currentUser);

    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          setRequests(userData.requests || []);
          console.log("FriendRequests: Requests list updated in real-time:", userData.requests);
        } else {
          setRequests([]);
          console.log("FriendRequests: User document not found for requests.");
        }
        setIsLoading(false);
      },
      (error) => {
        console.error("FriendRequests: Error fetching real-time requests:", error);
        setError("Failed to load friend requests. Please try again.");
        setIsLoading(false);
      }
    );

    // Cleanup listener on component unmount or currentUser change
    return () => {
      console.log("FriendRequests: Cleaning up real-time requests listener.");
      unsubscribe();
    };
  }, [currentUser]); // Re-run when currentUser changes

  // --- Handle Accept Request ---
  const handleAcceptRequest = async (requesterEmail) => {
    setError("");
    console.log("FriendRequests: Accepting request from:", requesterEmail);
    try {
      // 1. Add requester to current user's friends list & remove from requests
      const currentUserDocRef = doc(db, "users", currentUser);
      await updateDoc(currentUserDocRef, {
        friends: arrayUnion(requesterEmail),
        requests: arrayRemove(requesterEmail),
      });

      // 2. Add current user to requester's friends list & remove from pendingSent
      const requesterDocRef = doc(db, "users", requesterEmail);
      await updateDoc(requesterDocRef, {
        friends: arrayUnion(currentUser),
        pendingSent: arrayRemove(currentUser), // Remove from pendingSent
      });

      console.log("FriendRequests: Request accepted from:", requesterEmail);
    } catch (err) {
      console.error("FriendRequests: Error accepting request:", err);
      setError("Failed to accept friend request: " + err.message);
    }
  };

  // --- Handle Reject Request ---
  const handleRejectRequest = async (requesterEmail) => {
    setError("");
    console.log("FriendRequests: Rejecting request from:", requesterEmail);
    try {
      // 1. Remove from current user's requests list
      const currentUserDocRef = doc(db, "users", currentUser);
      await updateDoc(currentUserDocRef, {
        requests: arrayRemove(requesterEmail),
      });

      // 2. Remove current user from requester's pendingSent list
      const requesterDocRef = doc(db, "users", requesterEmail);
      await updateDoc(requesterDocRef, {
        pendingSent: arrayRemove(currentUser), // Remove from pendingSent
      });

      console.log("FriendRequests: Request rejected from:", requesterEmail);
    } catch (err) {
      console.error("FriendRequests: Error rejecting request:", err);
      setError("Failed to reject friend request: " + err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="ml-3 text-gray-600">Loading requests...</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Friend Requests</h2>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <p className="text-gray-600 text-center">No new friend requests.</p>
      ) : (
        <ul className="space-y-4">
          {requests.map((requester) => (
            <li key={requester} className="flex items-center justify-between bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-purple-200 flex items-center justify-center text-purple-800 font-semibold mr-3">
                  {requester.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-gray-800">{requester}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleAcceptRequest(requester)}
                  className="px-4 py-2 bg-green-500 text-white rounded-full text-sm font-semibold hover:bg-green-600 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleRejectRequest(requester)}
                  className="px-4 py-2 bg-red-500 text-white rounded-full text-sm font-semibold hover:bg-red-600 transition-colors"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
