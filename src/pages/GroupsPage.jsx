import { useEffect, useState } from "react";
import { db } from "../firebase"; // Import db
import {
  collection,
  query,
  where,
  onSnapshot, // Use onSnapshot for real-time updates
  doc,
} from "firebase/firestore";

export default function GroupsPage({ currentUser, onSelectGroup, unreadCounts }) {
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // --- Real-time Groups List Listener ---
  useEffect(() => {
    console.log("GroupsPage: Setting up real-time listener for groups for:", currentUser);
    if (!currentUser) {
      setIsLoading(false);
      return;
    }

    // Listen to the current user's document to get their group IDs
    const userDocRef = doc(db, "users", currentUser);
    const unsubscribeUserGroups = onSnapshot(
      userDocRef,
      (userDocSnap) => {
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const userGroupIds = userData.groups || [];
          console.log("GroupsPage: User's group IDs updated:", userGroupIds);

          if (userGroupIds.length === 0) {
            setGroups([]);
            setIsLoading(false);
            return;
          }

          // Fetch group details for each group ID the user is a member of
          // Use a new onSnapshot for the 'groups' collection with a 'where' clause
          // to efficiently fetch only the groups the user is a part of.
          const groupsRef = collection(db, "groups");
          // Firestore 'in' query has a limit of 10 items. If userGroupIds can exceed 10,
          // you'd need multiple queries or a different approach (e.g., Cloud Function).
          const q = query(groupsRef, where("__name__", "in", userGroupIds)); // __name__ refers to document ID

          const unsubscribeGroups = onSnapshot(
            q,
            (groupSnapshot) => {
              const fetchedGroups = groupSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }));
              setGroups(fetchedGroups);
              console.log("GroupsPage: Group details updated in real-time:", fetchedGroups);
              setIsLoading(false);
            },
            (error) => {
              console.error("GroupsPage: Error fetching real-time group details:", error);
              setError("Failed to load group details. Please try again.");
              setIsLoading(false);
            }
          );

          // Return a cleanup function that unsubscribes from the groups listener
          return () => {
            console.log("GroupsPage: Cleaning up group details listener.");
            unsubscribeGroups();
          };

        } else {
          setGroups([]);
          setIsLoading(false);
          console.log("GroupsPage: User document not found for groups.");
        }
      },
      (error) => {
        console.error("GroupsPage: Error fetching real-time user's group IDs:", error);
        setError("Failed to load your groups. Please try again.");
        setIsLoading(false);
      }
    );

    // Cleanup listener for user's group IDs on component unmount or currentUser change
    return () => {
      console.log("GroupsPage: Cleaning up user's group IDs listener.");
      unsubscribeUserGroups();
    };
  }, [currentUser]); // Re-run when currentUser changes

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <svg className="animate-spin h-8 w-8 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="ml-3 text-gray-600">Loading groups...</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-gray-800">Your Groups</h3>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-gray-600 text-center">You haven't joined any groups yet. Create one or ask a friend to add you!</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex items-center justify-between bg-gray-50 p-4 rounded-lg shadow-sm hover:bg-gray-100 transition-colors cursor-pointer"
              onClick={() => onSelectGroup(group)}
            >
              <div className="flex items-center flex-1">
                <div className="h-10 w-10 rounded-full bg-purple-200 flex items-center justify-center text-purple-800 font-semibold mr-3">
                  {group.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-gray-800 flex-1 truncate">{group.name}</span>
                {unreadCounts[group.id] > 0 && (
                  <span className="ml-2 px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full animate-bounce-in">
                    {unreadCounts[group.id]}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
