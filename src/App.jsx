import { useState, useRef, useEffect } from "react";
import "./App.css";

// Typing Animation
function Typewriter({ text }) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    setDisplayedText("");
    let index = 0;

    const timer = setInterval(() => {
      index++;
      setDisplayedText(text.slice(0, index));

      if (index >= text.length) clearInterval(timer);
    }, 15);

    return () => clearInterval(timer);
  }, [text]);

  return <p>{displayedText}</p>;
}

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [chats, setChats] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [ratings, setRatings] = useState({});
  const [moreIndex, setMoreIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState("");
  const [darkMode, setDarkMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const bottomRef = useRef(null);
  const abortControllerRef = useRef(null);

  const toggleTheme = () => setDarkMode((prev) => !prev);

  const closeSidebar = () => setSidebarOpen(false);

  // Stop AI generation
  const stopGeneration = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadChats = async () => {
    try {
      const response = await fetch("http://localhost:5000/chats");
      const data = await response.json();
      if (response.ok) setChats(data);
    } catch (error) {
      console.log("History error:", error);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  // Send message
  const handleSend = async () => {
    if (!message.trim() || loading) return;

    const userMessage = message.trim();

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
    ]);

    setMessage("");
    setLoading(true);
    setMoreIndex(null);
    setEditingIndex(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, chatId }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setChatId(data.chatId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);

      await loadChats();
    } catch (error) {
      if (error.name === "AbortError") return;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: " + error.message },
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  const startEdit = (index, content) => {
    setEditingIndex(index);
    setEditText(content);
    setMoreIndex(null);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditText("");
  };

  const saveEdit = async (index) => {
    if (!editText.trim() || loading || !chatId) return;

    setLoading(true);
    setMoreIndex(null);

    try {
      const response = await fetch("http://localhost:5000/chat/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          messageIndex: index,
          message: editText.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not edit message");
      }

      setMessages(data.messages);
      setEditingIndex(null);
      setEditText("");
      setCopiedIndex(null);
      setRatings({});
      await loadChats();
    } catch (error) {
      alert("Edit error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const newChat = () => {
    if (abortControllerRef.current) stopGeneration();

    setMessages([]);
    setMessage("");
    setChatId(null);
    setCopiedIndex(null);
    setRatings({});
    setMoreIndex(null);
    setEditingIndex(null);
    setEditText("");
    closeSidebar();
  };

  const openChat = async (id) => {
    try {
      const response = await fetch(`http://localhost:5000/chats/${id}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Could not open chat");

      if (abortControllerRef.current) stopGeneration();

      setChatId(data._id);
      setMessages(data.messages || []);
      setMessage("");
      setCopiedIndex(null);
      setRatings({});
      setMoreIndex(null);
      setEditingIndex(null);
      setEditText("");
      closeSidebar();
    } catch (error) {
      console.log("Open chat error:", error);
    }
  };

  const deleteChat = async (id) => {
    if (!window.confirm("Are you sure you want to delete this chat?")) return;

    try {
      const response = await fetch(`http://localhost:5000/chats/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Could not delete chat");

      if (chatId === id) newChat();

      await loadChats();
    } catch (error) {
      console.log("Delete error:", error);
      alert("Chat delete nahi hui. Dobara try karein.");
    }
  };

  const copyResponse = async (content, index) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
    } catch (error) {
      alert("Copy nahi hua. Dobara try karein.");
    }
  };

  const readAloud = (content) => {
    if (!("speechSynthesis" in window)) {
      alert("Browser sound support nahi karta.");
      return;
    }

    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(content);
    speech.lang = "en-US";
    window.speechSynthesis.speak(speech);
  };

  const shareResponse = async (content) => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "NovaAI Response",
          text: content,
        });
      } else {
        await navigator.clipboard.writeText(content);
        alert("Response copy ho gaya.");
      }
    } catch (error) {
      console.log("Share cancelled:", error);
    }
  };

  const regenerateResponse = async (index) => {
    if (loading) return;

    const previousUserMessage = messages
      .slice(0, index)
      .reverse()
      .find((msg) => msg.role === "user");

    if (!previousUserMessage) return;

    const userMessage = previousUserMessage.content;

    setMessages((prev) => prev.slice(0, index));
    setMoreIndex(null);
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, chatId }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Regeneration failed");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);

      await loadChats();
    } catch (error) {
      if (error.name === "AbortError") return;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: " + error.message },
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  return (
    <div className={`app ${darkMode ? "dark-mode" : "light-mode"}`}>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          onClick={closeSidebar}
          aria-label="Close sidebar"
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-heading">
          <h2 className="logo">✦ NovaAI</h2>
          <button
            className="sidebar-close"
            onClick={closeSidebar}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <button className="new-chat" onClick={newChat}>
          + New Chat
        </button>

        <div className="history">
          <p>YOUR CHATS</p>
          <div className="history-list">
            {chats.map((chat) => (
              <div className="history-item" key={chat._id}>
                <button
                  className={`history-title ${chatId === chat._id ? "active" : ""}`}
                  onClick={() => openChat(chat._id)}
                >
                  {chat.title}
                </button>

                <button
                  className="delete-chat"
                  onClick={() => deleteChat(chat._id)}
                  title="Delete chat"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="profile">
          <div className="avatar">N</div>
          <div>
            <h4>NovaAI User</h4>
            <small>Free Plan</small>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-toggle"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <span>✦ NovaAI Assistant</span>
          </div>

          <div className="topbar-right">
            <span className="online">● Online</span>
            <button className="theme-toggle" onClick={toggleTheme}>
              {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
            </button>
          </div>
        </header>

        <section className="chat-area">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="sparkle">✦</div>
              <h1>Welcome to <span>NovaAI</span></h1>
              <p>
                Your intelligent AI assistant.
                What can I help you with today?
              </p>

              <div className="suggested-prompts">
                <button onClick={() => setMessage("Explain artificial intelligence in simple words")}>
                  🤖 Explain AI
                </button>
                <button onClick={() => setMessage("Write a professional email for me")}>
                  ✉️ Write an Email
                </button>
                <button onClick={() => setMessage("Give me creative project ideas")}>
                  💡 Project Ideas
                </button>
                <button onClick={() => setMessage("Help me learn JavaScript")}>
                  💻 Learn JavaScript
                </button>
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((msg, index) => (
                <div className={`message-row ${msg.role}`} key={index}>
                  <div className="message-avatar">
                    {msg.role === "user" ? "U" : "✦"}
                  </div>

                  <div className="message-content">
                    <div className="message-bubble">
                      <strong>
                        {msg.role === "user" ? "You" : "NovaAI"}
                      </strong>

                      {editingIndex === index ? (
                        <div className="edit-message-box">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            autoFocus
                          />

                          <div className="edit-buttons">
                            <button onClick={cancelEdit} disabled={loading}>
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(index)}
                              disabled={loading || !editText.trim()}
                            >
                              {loading ? "Saving..." : "Save & Submit"}
                            </button>
                          </div>
                        </div>
                      ) : msg.role === "assistant" ? (
                        <Typewriter text={msg.content} />
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>

                    {msg.role === "user" && chatId && editingIndex !== index && (
                      <div className="response-actions">
                        <button
                          onClick={() => startEdit(index, msg.content)}
                          title="Edit message"
                        >
                          ✏️
                        </button>
                      </div>
                    )}

                    {msg.role === "assistant" && (
                      <div className="response-actions">
                        <button
                          onClick={() => copyResponse(msg.content, index)}
                          title="Copy"
                        >
                          {copiedIndex === index ? "✓" : "📋"}
                        </button>

                        <button
                          className={ratings[index] === "like" ? "selected" : ""}
                          onClick={() =>
                            setRatings((prev) => ({
                              ...prev,
                              [index]: prev[index] === "like" ? null : "like",
                            }))
                          }
                          title="Like"
                        >
                          👍
                        </button>

                        <button
                          className={ratings[index] === "dislike" ? "selected" : ""}
                          onClick={() =>
                            setRatings((prev) => ({
                              ...prev,
                              [index]: prev[index] === "dislike" ? null : "dislike",
                            }))
                          }
                          title="Dislike"
                        >
                          👎
                        </button>

                        <button onClick={() => readAloud(msg.content)} title="Read aloud">
                          🔊
                        </button>

                        <button onClick={() => shareResponse(msg.content)} title="Share">
                          ↗
                        </button>

                        <div className="more-wrapper">
                          <button
                            onClick={() =>
                              setMoreIndex(moreIndex === index ? null : index)
                            }
                            title="More options"
                          >
                            ⋯
                          </button>

                          {moreIndex === index && (
                            <div className="more-menu">
                              <button onClick={() => regenerateResponse(index)}>
                                ↻ Regenerate
                              </button>

                              <button
                                onClick={() => {
                                  const bubble = document.querySelectorAll(
                                    ".message-bubble"
                                  )[index];

                                  if (bubble) {
                                    const range = document.createRange();
                                    range.selectNodeContents(bubble);
                                    const selection = window.getSelection();
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                  }

                                  setMoreIndex(null);
                                }}
                              >
                                Select text
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="message-row assistant">
                  <div className="message-avatar">✦</div>
                  <div className="message-bubble">
                    <strong>NovaAI</strong>
                    <p className="thinking">Thinking...</p>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="input-area">
          <div className="chat-input">
            <textarea
              placeholder="Message NovaAI..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />

            {loading ? (
              <button
                className="send stop-button"
                onClick={stopGeneration}
                title="Stop generating"
              >
                ■
              </button>
            ) : (
              <button
                className="send"
                onClick={handleSend}
                disabled={!message.trim()}
                title="Send message"
              >
                ↑
              </button>
            )}
          </div>

          <footer>
            NovaAI can make mistakes. Check important information.
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;