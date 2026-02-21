import { useState, useEffect } from "react";
import { db } from "../firebase"; // Import db
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot, // Use onSnapshot for real-time updates
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";

export default function CreateGroup({ currentUser }) {
  const [groupName, setGroupName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([currentUser]); // Current user is always a member
  const [error, setError] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // --- Real-time All Users Listener ---
  useEffect(() => {
    console.log("CreateGroup: Setting up real-time listener for all users.");
    const usersRef = collection(db, "users");
    const q = query(usersRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const usersList = snapshot.docs.map((doc) => doc.data().email);
        setAllUsers(usersList);
        setIsLoadingUsers(false);
        console.log("CreateGroup: All users list updated in real-time.");
      },
      (error) => {
        console.error("CreateGroup: Error fetching real-time users:", error);
        setError("Failed to load users. Please try again.");
        setIsLoadingUsers(false);
      }
    );

    // Cleanup listener on component unmount
    return () => {
      console.log("CreateGroup: Cleaning up all users listener.");
      unsubscribe();
    };
  }, []); // Empty dependency array means this runs once on mount

  const handleCreateGroup = async () => {
    setError("");
    setSuccessMessage("");
    setIsCreatingGroup(true);

    if (!groupName.trim()) {
      setError("Group name cannot be empty.");
      setIsCreatingGroup(false);
      return;
    }
    if (selectedMembers.length < 2) {
      setError("A group must have at least two members (including yourself).");
      setIsCreatingGroup(false);
      return;
    }

    console.log("CreateGroup: Attempting to create group:", groupName);
    try {
      // 1. Create the group document in the 'groups' collection
      const newGroupRef = await addDoc(collection(db, "groups"), {
        name: groupName.trim(),
        members: selectedMembers,
        creatorId: currentUser,
        createdAt: new Date(), // Use client-side date for group creation
      });
      console.log("CreateGroup: Group document created with ID:", newGroupRef.id);

      // 2. Update each selected member's user document to add the group ID
      const updatePromises = selectedMembers.map((memberEmail) => {
        const memberDocRef = doc(db, "users", memberEmail);
        return updateDoc(memberDocRef, {
          groups: arrayUnion(newGroupRef.id),
        });
      });

      await Promise.all(updatePromises);
      console.log("CreateGroup: Members' user documents updated with group ID.");

      setGroupName("");
      setSelectedMembers([currentUser]); // Reset to only current user
      setSearchTerm("");
      setSuccessMessage("Group created successfully!");
    } catch (err) {
      console.error("CreateGroup: Error creating group:", err);
      setError("Failed to create group: " + err.message);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const toggleMember = (email) => {
    if (email === currentUser) return; // Cannot deselect self
    setSelectedMembers((prev) =>
      prev.includes(email) ? prev.filter((m) => m !== email) : [...prev, email]
    );
  };

  const filteredUsers = allUsers.filter(
    (user) =>
      user !== currentUser &&
      user.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <div className="p-6 bg-white rounded-xl shadow-lg w-full max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Create New Group</h2>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
          {successMessage}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="groupName" className="block text-gray-700 text-sm font-bold mb-2">
          Group Name
        </label>
        <input
          type="text"
          id="groupName"
          className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="Enter group name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          disabled={isCreatingGroup}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="searchMembers" className="block text-gray-700 text-sm font-bold mb-2">
          Add Members
        </label>
        <input
          type="text"
          id="searchMembers"
          className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="Search and add members by email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={isCreatingGroup}
        />
      </div>

      <div className="mb-6 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50">
        <h4 className="font-semibold text-gray-700 mb-2">Selected Members:</h4>
        <ul className="space-y-1">
          {selectedMembers.map((member) => (
            <li key={member} className="flex items-center justify-between text-gray-800 bg-white p-2 rounded-md shadow-sm">
              <span>{member} {member === currentUser && "(You)"}</span>
              {member !== currentUser && (
                <button
                  onClick={() => toggleMember(member)}
                  className="text-red-500 hover:text-red-700 transition-colors"
                  title="Remove member"
                  disabled={isCreatingGroup}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
        <h4 className="font-semibold text-gray-700 mt-4 mb-2">Available Users:</h4>
        <ul className="space-y-1">
          {filteredUsers.length === 0 ? (
            <p className="text-gray-600 text-sm italic">No users found or all users added.</p>
          ) : (
            filteredUsers.map((user) => (
              <li key={user} className="flex items-center justify-between text-gray-800 bg-white p-2 rounded-md shadow-sm">
                <span>{user}</span>
                <button
                  onClick={() => toggleMember(user)}
                  className="text-indigo-500 hover:text-indigo-700 transition-colors"
                  title="Add member"
                  disabled={isCreatingGroup}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <button
        onClick={handleCreateGroup}
        className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 text-white py-3 rounded-lg font-bold text-lg shadow-md hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
        disabled={isCreatingGroup}
      >
        {isCreatingGroup ? (
          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        Create Group
      </button>
    </div>
  );
}
