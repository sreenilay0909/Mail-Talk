import { useEffect, useState, useRef, useCallback } from "react";
import { db, storage } from "../firebase"; // No .js needed here, as it's a module import

import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot, // Crucial for real-time
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  arrayUnion,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

export default function ChatPage({ currentUser, selectedFriend, selectedGroup, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageToDeleteId, setMessageToDeleteId] = useState(null);
  const [messageToDeleteImageUrl, setMessageToDeleteImageUrl] = useState(null);
  const [showActionsForMessageId, setShowActionsForMessageId] = useState(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const chatEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const actionMenuRef = useRef(null);

  // Determine the chat ID based on whether it's a group or private chat
  // This value is stable across renders unless selectedFriend/selectedGroup changes
  const chatId = selectedGroup
    ? `group_${selectedGroup.id}`
    : [currentUser, selectedFriend].sort().join("_");

  // --- Core Real-time Message Listener ---
  useEffect(() => {
    console.log("ChatPage: useEffect for onSnapshot mounted/re-ran. Chat ID:", chatId);

    // Derive messagesCollectionRef INSIDE useEffect to ensure stability of dependency
    const messagesCollectionRef = collection(db, "chats", chatId, "messages");

    // Create a query to get messages ordered by timestamp
    const q = query(messagesCollectionRef, orderBy("timestamp", "asc"));

    // Set up the real-time listener
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      console.log("ChatPage: onSnapshot triggered at", new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }));
      console.log("ChatPage: Number of documents in snapshot:", snapshot.docs.length);

      // Check if the user is currently at the bottom of the chat
      const isAtBottom =
        messagesContainerRef.current &&
        messagesContainerRef.current.scrollHeight -
          messagesContainerRef.current.scrollTop <=
          messagesContainerRef.current.clientHeight + 100;

      // Map snapshot documents to message objects
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs); // Update the messages state, triggering a re-render
      console.log("ChatPage: Messages state updated. Current message count:", msgs.length);

      // --- Read Receipts Logic ---
      // Only apply read receipts for private chats (not groups)
      if (!selectedGroup) {
        const unreadMessages = snapshot.docs.filter(msgDoc => {
          const msgData = msgDoc.data();
          // Message is unread if it's from the other person AND current user is not in readBy array
          return msgData.sender !== currentUser && !msgData.readBy?.includes(currentUser);
        });

        if (unreadMessages.length > 0) {
          console.log(`ChatPage: Found ${unreadMessages.length} unread messages from other user. Marking as read.`);
          // Use Promise.all to update all unread messages concurrently for efficiency
          const updates = unreadMessages.map(msgDoc => {
            return updateDoc(doc(db, "chats", chatId, "messages", msgDoc.id), {
              readBy: arrayUnion(currentUser),
            });
          });

          try {
            await Promise.all(updates);
            console.log("ChatPage: All unread messages marked as read successfully.");
          } catch (error) {
            console.error("ChatPage: Error updating read receipts:", error);
          }
        }
      }
      // --- End Read Receipts Logic ---

      // Scroll to bottom if user was already near the bottom
      if (isAtBottom) {
        console.log("ChatPage: User was at bottom, attempting to scroll.");
        setTimeout(() => {
          chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 0);
      }
    }, (error) => {
      // This callback is for errors in the listener itself (e.g., permission denied)
      console.error("ChatPage: Error fetching messages with onSnapshot (listener error):", error);
    });

    // Cleanup function: unsubscribe from the listener when the component unmounts
    return () => {
      console.log("ChatPage: Cleaning up onSnapshot listener for chat:", chatId);
      unsubscribe();
    };
  }, [chatId, currentUser, selectedGroup]); // Only chatId, currentUser, selectedGroup are dependencies

  // useEffect to create an image preview URL when an image is selected
  useEffect(() => {
    if (image) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviewUrl(reader.result);
      };
      reader.readAsDataURL(image);
    } else {
      setImagePreviewUrl(null);
    }
  }, [image]);

  // Handle click outside action menu to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
        setShowActionsForMessageId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [actionMenuRef]);

  // Handler for sending new messages (Optimized for images)
  const handleSendMessage = async () => {
    if (!text.trim() && !image) {
      console.log("ChatPage: Send message aborted - no text or image.");
      return;
    }

    setIsSendingMessage(true); // Indicate that sending is in progress
    console.log("ChatPage: Attempting to send message at", new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }));

    try {
      // Derive messagesCollectionRef here as well for consistency
      const currentMessagesCollectionRef = collection(db, "chats", chatId, "messages");

      // 1. Add the message document to Firestore immediately
      // If there's an image, set imageUrl to a temporary placeholder or null initially
      const newMessage = {
        sender: currentUser,
        text: text.trim(),
        imageUrl: image ? "uploading..." : null, // Placeholder for image while uploading
        timestamp: serverTimestamp(), // Use serverTimestamp for accurate time
        readBy: [currentUser], // Sender implicitly reads their own message
      };

      const docRef = await addDoc(currentMessagesCollectionRef, newMessage);
      console.log("ChatPage: Message added to Firestore (ID:", docRef.id, ") at", new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }));

      // 2. If an image is present, upload it asynchronously
      if (image) {
        console.log("ChatPage: Starting image upload for message ID:", docRef.id, "at", new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }));
        const storageRef = ref(storage, `chat_images/${docRef.id}-${image.name}`);
        await uploadBytes(storageRef, image);
        const imageUrl = await getDownloadURL(storageRef);
        console.log("ChatPage: Image uploaded, URL:", imageUrl, "at", new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }));

        // 3. Update the message document with the actual image URL
        await updateDoc(docRef, { imageUrl: imageUrl });
        console.log("ChatPage: Message document updated with image URL for ID:", docRef.id, "at", new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }));
      }

      // Clear input fields after sending
      setText("");
      setImage(null);
      setImagePreviewUrl(null);

      // Scroll to bottom after sending (or after image upload completes)
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    } catch (error) {
      console.error("ChatPage: Error sending message:", error);
      // You might want to add a user-facing error message here
    } finally {
      setIsSendingMessage(false); // Always reset sending state
      console.log("ChatPage: Message sending process finished.");
    }
  };

  // Handler for updating an existing message
  const handleUpdateMessage = async () => {
    if (!editingMessageText.trim() || !editingMessageId) return;

    console.log("ChatPage: Attempting to update message:", editingMessageId);
    try {
      const messageDocRef = doc(db, "chats", chatId, "messages", editingMessageId);
      await updateDoc(messageDocRef, {
        text: editingMessageText.trim(),
        editedAt: serverTimestamp(),
      });
      console.log("ChatPage: Message updated:", editingMessageId);

      setEditingMessageId(null);
      setEditingMessageText("");
      setText("");
    } catch (error) {
      console.error("ChatPage: Error updating message:", error);
    }
  };

  // Function to initiate editing a message
  const handleEditClick = (messageId, currentText) => {
    setEditingMessageId(messageId);
    setEditingMessageText(currentText);
    setText(currentText);
    setImage(null);
    setImagePreviewUrl(null);
    setShowActionsForMessageId(null);
  };

  // Function to cancel editing
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
    setText("");
    setImage(null);
    setImagePreviewUrl(null);
  };

  // Function to prepare for message deletion (show confirmation modal)
  const handleDeleteClick = (messageId, imageUrl) => {
    setMessageToDeleteId(messageId);
    setMessageToDeleteImageUrl(imageUrl);
    setShowDeleteConfirm(true);
    setShowActionsForMessageId(null);
  };

  // Function to confirm and execute message deletion
  const confirmDeleteMessage = async () => {
    if (!messageToDeleteId) return;

    console.log("ChatPage: Confirming delete for message ID:", messageToDeleteId);
    try {
      const messageDocRef = doc(db, "chats", chatId, "messages", messageToDeleteId);
      await deleteDoc(messageDocRef);
      console.log("ChatPage: Message deleted:", messageToDeleteId);

      if (messageToDeleteImageUrl && messageToDeleteImageUrl !== "uploading...") { // Avoid trying to delete placeholder
        const imageRef = ref(storage, messageToDeleteImageUrl);
        await deleteObject(imageRef).catch((error) => {
          console.warn("ChatPage: Could not delete image from storage:", error);
        });
      }
    } catch (error) {
      console.error("ChatPage: Error deleting message:", error);
    } finally {
      setShowDeleteConfirm(false);
      setMessageToDeleteId(null);
      setMessageToDeleteImageUrl(null);
    }
  };

  // Function to format timestamp for display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Function to toggle message action menu visibility
  const toggleMessageActions = useCallback((messageId) => {
    setShowActionsForMessageId(prevId => (prevId === messageId ? null : messageId));
  }, []);

  // Determine if the message sent by currentUser has been read by selectedFriend
  const isReadByRecipient = useCallback((msg) => {
    if (selectedFriend && msg.sender === currentUser) {
      return msg.readBy?.includes(selectedFriend);
    }
    return false;
  }, [currentUser, selectedFriend]);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl flex flex-col flex-1 overflow-hidden">
        {/* Chat Header */}
        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-700 text-white rounded-t-2xl shadow-lg">
          <h2 className="text-2xl sm:text-3xl font-extrabold flex items-center gap-3">
            {selectedGroup ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-indigo-200" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-indigo-200" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
              </svg>
            )}
            {selectedGroup ? selectedGroup.name : `Chat with ${selectedFriend}`}
          </h2>
          <button
            className="px-4 py-2 bg-indigo-700 text-white font-semibold rounded-full shadow-md hover:bg-indigo-800 transform hover:scale-105 transition-all duration-300 ease-in-out flex items-center gap-2"
            onClick={onBack}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Back
          </button>
        </div>

        {/* Messages Display Area */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-gray-50 scrollbar-thin scrollbar-thumb-rounded scrollbar-track-rounded scrollbar-thumb-indigo-300 scrollbar-track-gray-100"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end gap-3 ${
                msg.sender === currentUser ? "justify-end" : "justify-start"
              } animate-message-pop-in`}
            >
              {/* Avatar for received messages in group chats */}
              {selectedGroup && msg.sender !== currentUser && (
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-400 flex items-center justify-center text-lg font-semibold text-white shadow-sm">
                  {msg.sender.charAt(0).toUpperCase()}
                </div>
              )}
              <div
                className={`p-4 rounded-xl max-w-[80%] sm:max-w-[70%] lg:max-w-[60%] shadow-md break-words relative group ${
                  msg.sender === currentUser
                    ? "bg-indigo-500 text-white rounded-br-none"
                    : "bg-white text-gray-800 rounded-bl-none border border-gray-200"
                }`}
                // Only show action menu on hover for current user's messages
                onMouseEnter={() => msg.sender === currentUser && setShowActionsForMessageId(msg.id)}
                onMouseLeave={() => msg.sender === currentUser && setShowActionsForMessageId(null)}
              >
                {/* Display sender name for group messages if not the current user */}
                {selectedGroup && msg.sender !== currentUser && (
                  <p className="text-sm font-semibold mb-1 opacity-80">
                    {msg.sender.split('@')[0]}
                  </p>
                )}
                {/* Conditional rendering for message text or edit input */}
                {editingMessageId === msg.id ? (
                  <textarea
                    className="w-full bg-white text-gray-800 p-3 text-lg rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={editingMessageText}
                    onChange={(e) => setEditingMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleUpdateMessage();
                      }
                    }}
                    rows={editingMessageText.split('\n').length > 1 ? editingMessageText.split('\n').length : 1}
                    autoFocus
                  />
                ) : (
                  <>
                    {msg.text && <p className="text-base sm:text-lg">{msg.text}</p>}
                    {msg.imageUrl && (
                      // Show a loading indicator if image is still uploading
                      msg.imageUrl === "uploading..." ? (
                        <div className="mt-2 flex items-center justify-center bg-gray-200 rounded-lg p-4 text-gray-600">
                          <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Uploading image...
                        </div>
                      ) : (
                        <img
                          src={msg.imageUrl}
                          alt="chat-img"
                          className="mt-2 max-w-full rounded-lg shadow-sm cursor-pointer transition-transform duration-200 hover:scale-[1.02]"
                          onClick={() => window.open(msg.imageUrl, '_blank')}
                        />
                      )
                    )}
                  </>
                )}

                {/* Timestamp and Edited/Read indicator */}
                <div className="flex justify-end items-center mt-1 gap-1">
                  {msg.editedAt && (
                    <span className="text-xs text-gray-400 italic">Edited</span>
                  )}
                  <p className={`text-right ${msg.sender === currentUser ? "text-indigo-100" : "text-gray-500"} text-xs opacity-80`}>
                    {formatTimestamp(msg.timestamp)}
                  </p>
                  {/* Read Receipt Indicator */}
                  {msg.sender === currentUser && isReadByRecipient(msg) && (
                    <span className="text-xs text-green-300 font-bold ml-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block -ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>

                {/* WhatsApp-like Action Menu */}
                {msg.sender === currentUser && (
                  <div className={`absolute top-1 right-1 flex space-x-1 transition-opacity duration-200 ${
                      showActionsForMessageId === msg.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMessageActions(msg.id);
                      }}
                      className="p-1 rounded-full bg-gray-700 text-white hover:bg-gray-800 transition-colors text-xs"
                      title="Message options"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>

                    {showActionsForMessageId === msg.id && editingMessageId !== msg.id && (
                      <div ref={actionMenuRef} className="absolute top-0 right-7 bg-white rounded-lg shadow-lg py-1 z-10 animate-fade-in-scale">
                        <button
                          onClick={() => handleEditClick(msg.id, msg.text)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteClick(msg.id, msg.imageUrl)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Avatar for sent messages in group chats */}
              {selectedGroup && msg.sender === currentUser && (
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-400 flex items-center justify-center text-lg font-semibold text-white shadow-sm">
                  {currentUser.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef}></div>
        </div>

        {/* Message Input Area */}
        <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-100 flex flex-col sm:flex-row gap-3 items-center rounded-b-2xl">
          {/* Image Preview and Clear Button */}
          {imagePreviewUrl && (
            <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden shadow-md border border-gray-200">
              <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
              <button
                onClick={() => { setImage(null); setImagePreviewUrl(null); }}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs leading-none opacity-80 hover:opacity-100 transition-opacity"
                title="Remove image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* File input for images, styled as a button */}
          <label className="flex items-center justify-center px-4 py-2 bg-blue-500 text-white font-semibold rounded-full shadow-md hover:bg-blue-600 cursor-pointer transition-all duration-300 ease-in-out flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-4 4 4 4-4V5h-2v5L9 7l-5 5v2z" clipRule="evenodd" />
            </svg>
            {image ? "Change Image" : "Add Image"}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files[0])}
              className="hidden"
              disabled={!!editingMessageId || isSendingMessage} // Disable if editing or sending
            />
          </label>
          {/* Text input field */}
          <input
            className="flex-1 border border-gray-300 rounded-full p-3 text-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all duration-200 shadow-sm"
            placeholder={editingMessageId ? "Edit your message..." : "Type a message..."}
            value={editingMessageId ? editingMessageText : text}
            onChange={(e) => {
              if (editingMessageId) {
                setEditingMessageText(e.target.value);
              } else {
                setText(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (editingMessageId) {
                  handleUpdateMessage();
                } else {
                  handleSendMessage();
                }
              }
            }}
            disabled={isSendingMessage} // Disable input while sending
          />
          {/* Send/Update button */}
          {editingMessageId && (
            <button
              className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-full shadow-md hover:bg-gray-600 transform hover:scale-105 transition-all duration-300 ease-in-out flex items-center justify-center gap-2 flex-shrink-0"
              onClick={handleCancelEdit}
              disabled={isSendingMessage} // Disable while sending
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </button>
          )}
          <button
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 ease-in-out flex items-center justify-center gap-2 flex-shrink-0"
            onClick={editingMessageId ? handleUpdateMessage : handleSendMessage}
            disabled={isSendingMessage || (!text.trim() && !image && !editingMessageId)} // Disable if sending or empty
          >
            {isSendingMessage ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                {editingMessageId ? (
                  <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2H5zm0 2h10v10H5V4zm5 2a1 1 0 00-1 1v4a1 1 0 102 0V7a1 1 0 00-1-1z" clipRule="evenodd" />
                ) : (
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                )}
              </svg>
            )}
            {editingMessageId ? "Update" : "Send"}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white p-8 rounded-xl shadow-2xl max-w-sm w-full text-center transform scale-95 animate-zoom-in">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Confirm Deletion</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to delete this message? This action cannot be undone.</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-6 py-2 bg-gray-300 text-gray-800 font-semibold rounded-full hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteMessage}
                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
