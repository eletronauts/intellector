// ═══════════════════════════════════════════════════════════════
//
//   INTELLECTOR — COMPLETE APPLICATION (UPGRADED)
//
//   ⚠️ EDIT LINES 10-21 WITH YOUR OWN KEYS ⚠️
//
// ═══════════════════════════════════════════════════════════════

var CONFIG = {
    FIREBASE_API_KEY: "AIzaSyDUOZvp58xhnXW2CXy8NVxU5x8QPPok3j4",
    FIREBASE_AUTH_DOMAIN: "intellector-8cf2d.firebaseapp.com",
    FIREBASE_PROJECT_ID: "intellector-8cf2d",
    FIREBASE_STORAGE_BUCKET: "intellector-8cf2d.firebasestorage.app",
    FIREBASE_MESSAGING_SENDER_ID: "381231220205",
    FIREBASE_APP_ID: "1:381231220205:web:397c5bb41c20b7b503d3e4",

    // ═══ REMOVED: No more Gemini API key in frontend! ═══
    // GEMINI_API_KEY: "..." ← DELETE THIS LINE

    // ═══ NEW: Your backend URL ═══
    BACKEND_URL: "https://intellector-backend.onrender.com",

    SYSTEM_PROMPT: `You are Intellector, an advanced AI academic assistant built as a college innovation project.

RULES YOU MUST FOLLOW:
1. Always provide accurate, well-structured answers.
2. Use markdown formatting: headings, bold, bullet points, code blocks.
3. If a question is about coding, always include a working code example.
4. If you are not confident about factual data (dates, statistics, recent events), say "I'm not fully certain about this — please verify from a trusted source."
5. Never generate harmful, misleading, or unethical content.
6. For math/science questions, show step-by-step solutions.
7. Keep responses concise but thorough — aim for clarity over length.
8. If the user asks "who are you" or "what can you do", introduce yourself as Intellector.
9. Format lists and comparisons as tables when appropriate.
10. Always end complex explanations with a brief summary.`,

    BLOCKED_KEYWORDS: ["I cannot help with that", "as an AI language model"],
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
    REQUEST_TIMEOUT: 30000
};

console.log("🚀 Starting Intellector...");

try {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase initialized");
} catch (error) {
    console.error("❌ Firebase error:", error);
    alert("Firebase configuration error. Check your config in app.js");
}

var auth = firebase.auth();
var db = firebase.firestore();

// ═══════════════════════════════════════
// USER STATE
// ═══════════════════════════════════════
var currentUser = null;
var currentChatId = null;
var isBusy = false;
var conversationHistory = []; // Store conversation context

// ═══════════════════════════════════════
// AUTH STATE LISTENER
// ═══════════════════════════════════════
auth.onAuthStateChanged(function (user) {
    var page = document.body.getAttribute("data-page");
    console.log("👤 Auth state:", user ? user.email : "Not logged in");
    console.log("📄 Page:", page);

    hideElement("loadingScreen");

    if (user) {
        currentUser = {
            id: user.uid,
            name: user.displayName || "User",
            email: user.email || "",
            picture: user.photoURL || ""
        };

        saveUserToDatabase();

        if (page === "login") {
            window.location.href = "chat.html";
            return;
        }

        if (page === "chat") {
            showElement("chatApp");
            initializeChatPage();
        }
    } else {
        currentUser = null;

        if (page === "chat") {
            window.location.href = "index.html";
            return;
        }

        if (page === "login") {
            showElement("loginContent");
        }
    }
});

// ═══════════════════════════════════════
// GOOGLE LOGIN
// ═══════════════════════════════════════
function googleLogin() {
    console.log("🔐 Starting Google login...");
    var provider = new firebase.auth.GoogleAuthProvider();

    auth.signInWithPopup(provider)
        .then(function (result) {
            console.log("✅ Login successful:", result.user.email);
        })
        .catch(function (error) {
            console.error("❌ Login error:", error);
            alert("Login failed: " + error.message);
        });
}

// ═══════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════
function logout() {
    console.log("🚪 Logging out...");
    auth.signOut().then(function () {
        window.location.href = "index.html";
    });
}

// ═══════════════════════════════════════
// SAVE USER TO DATABASE
// ═══════════════════════════════════════
function saveUserToDatabase() {
    if (!currentUser) return;

    db.collection("users").doc(currentUser.id).set({
        name: currentUser.name,
        email: currentUser.email,
        picture: currentUser.picture,
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
        .then(function () {
            console.log("✅ User saved to database");
        })
        .catch(function (error) {
            console.error("❌ Error saving user:", error);
        });
}

// ═══════════════════════════════════════
// INITIALIZE CHAT PAGE
// ═══════════════════════════════════════
function initializeChatPage() {
    console.log("💬 Initializing chat page...");

    setText("userName", currentUser.name);
    setText("userEmail", currentUser.email);

    var avatarEl = document.getElementById("userAvatar");
    if (avatarEl) {
        if (currentUser.picture) {
            avatarEl.innerHTML = '<img src="' + currentUser.picture + '" alt="avatar">';
        } else {
            avatarEl.innerHTML = '<span>' + currentUser.name.charAt(0).toUpperCase() + '</span>';
        }
    }

    loadChatList();

    var input = document.getElementById("messageInput");
    if (input) input.focus();
}

// ═══════════════════════════════════════
// LOAD CHAT LIST (Sidebar)
// ═══════════════════════════════════════
function loadChatList() {
    var listEl = document.getElementById("chatList");
    if (!listEl) return;

    listEl.innerHTML = '<div class="sidebar-message"><div class="sidebar-loading"><div class="dot-flashing"></div></div></div>';

    db.collection("chats")
        .where("userId", "==", currentUser.id)
        .get()
        .then(function (snapshot) {
            var chats = [];

            snapshot.forEach(function (doc) {
                var data = doc.data();
                var timestamp = data.updatedAt ? data.updatedAt.toMillis() : 0;
                chats.push({
                    id: doc.id,
                    title: data.title || "New Chat",
                    timestamp: timestamp
                });
            });

            chats.sort(function (a, b) {
                return b.timestamp - a.timestamp;
            });

            listEl.innerHTML = "";

            if (chats.length === 0) {
                listEl.innerHTML = '<div class="sidebar-message"><span class="empty-icon">💬</span><br>No chats yet.<br><span class="empty-sub">Start a conversation!</span></div>';
                return;
            }

            chats.forEach(function (chat) {
                var div = document.createElement("div");
                div.className = "chat-list-item" + (chat.id === currentChatId ? " active" : "");
                div.innerHTML =
                    '<svg class="chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' +
                    '<span class="chat-list-title">' + escapeHtml(chat.title) + '</span>' +
                    '<button class="chat-list-delete" onclick="event.stopPropagation(); deleteChat(\'' + chat.id + '\')" title="Delete">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>' +
                    '</button>';
                div.onclick = function () {
                    loadChat(chat.id);
                };
                listEl.appendChild(div);
            });

            console.log("✅ Loaded " + chats.length + " chats");
        })
        .catch(function (error) {
            console.error("❌ Error loading chats:", error);
            listEl.innerHTML = '<div class="sidebar-message">Error loading chats</div>';
        });
}

// ═══════════════════════════════════════
// LOAD A SPECIFIC CHAT
// ═══════════════════════════════════════
function loadChat(chatId) {
    console.log("📂 Loading chat:", chatId);

    currentChatId = chatId;
    conversationHistory = []; // Reset history

    hideElement("welcomeScreen");
    showElement("messagesContainer");

    var messagesEl = document.getElementById("messagesContainer");
    messagesEl.innerHTML = '<div class="loading-messages"><div class="spinner"></div><p>Loading messages...</p></div>';

    closeSidebar();

    db.collection("chats").doc(chatId).collection("messages")
        .orderBy("createdAt", "asc")
        .get()
        .then(function (snapshot) {
            messagesEl.innerHTML = "";

            snapshot.forEach(function (doc) {
                var msg = doc.data();
                appendMessage(msg.role, msg.contentHtml || msg.content, true);

                // Rebuild conversation history for context
                conversationHistory.push({
                    role: msg.role === "user" ? "user" : "model",
                    parts: [{ text: msg.content }]
                });
            });

            scrollToBottom();
            loadChatList();
        })
        .catch(function (error) {
            console.error("❌ Error loading messages:", error);

            db.collection("chats").doc(chatId).collection("messages")
                .get()
                .then(function (snapshot) {
                    messagesEl.innerHTML = "";
                    snapshot.forEach(function (doc) {
                        var msg = doc.data();
                        appendMessage(msg.role, msg.contentHtml || msg.content, true);
                        conversationHistory.push({
                            role: msg.role === "user" ? "user" : "model",
                            parts: [{ text: msg.content }]
                        });
                    });
                    scrollToBottom();
                });
        });
}

// ═══════════════════════════════════════
// NEW CHAT
// ═══════════════════════════════════════
function newChat() {
    console.log("🆕 Starting new chat");

    currentChatId = null;
    conversationHistory = [];

    showElement("welcomeScreen");
    hideElement("messagesContainer");

    var messagesEl = document.getElementById("messagesContainer");
    if (messagesEl) messagesEl.innerHTML = "";

    loadChatList();
    closeSidebar();

    var input = document.getElementById("messageInput");
    if (input) {
        input.value = "";
        input.focus();
    }
}

// ═══════════════════════════════════════
// DELETE CHAT
// ═══════════════════════════════════════
function deleteChat(chatId) {
    if (!confirm("Delete this chat?")) return;

    console.log("🗑️ Deleting chat:", chatId);

    db.collection("chats").doc(chatId).collection("messages")
        .get()
        .then(function (snapshot) {
            var batch = db.batch();
            snapshot.forEach(function (doc) {
                batch.delete(doc.ref);
            });
            return batch.commit();
        })
        .then(function () {
            return db.collection("chats").doc(chatId).delete();
        })
        .then(function () {
            console.log("✅ Chat deleted");
            if (currentChatId === chatId) {
                newChat();
            }
            loadChatList();
        })
        .catch(function (error) {
            console.error("❌ Error deleting chat:", error);
        });
}

// ═══════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════
function sendMessage() {
    if (isBusy) return;

    var input = document.getElementById("messageInput");
    var text = input.value.trim();

    if (!text) return;

    console.log("📤 Sending message:", text.substring(0, 50) + "...");

    input.value = "";
    autoResizeInput(input);

    hideElement("welcomeScreen");
    showElement("messagesContainer");

    appendMessage("user", escapeHtml(text), false);
    showTyping();

    isBusy = true;
    updateSendButton(true);

    // Add to conversation history
    conversationHistory.push({
        role: "user",
        parts: [{ text: text }]
    });

    var chatPromise;

    if (!currentChatId) {
        var title = text.substring(0, 50) + (text.length > 50 ? "..." : "");

        chatPromise = db.collection("chats").add({
            userId: currentUser.id,
            title: title,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function (docRef) {
            currentChatId = docRef.id;
            console.log("✅ Created chat:", currentChatId);
            return currentChatId;
        });
    } else {
        chatPromise = Promise.resolve(currentChatId);
    }

    chatPromise
        .then(function (chatId) {
            return db.collection("chats").doc(chatId).collection("messages").add({
                role: "user",
                content: text,
                contentHtml: "<p>" + escapeHtml(text) + "</p>",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(function () {
            return callGeminiWithRetry(text, 0);
        })
        .then(function (aiResponse) {
            hideTyping();

            // Verify response against rules
            aiResponse = verifyResponse(aiResponse, text);

            var aiHtml = convertMarkdown(aiResponse);
            appendMessage("ai", aiHtml, true);

            // Add AI response to conversation history
            conversationHistory.push({
                role: "model",
                parts: [{ text: aiResponse }]
            });

            return db.collection("chats").doc(currentChatId).collection("messages").add({
                role: "ai",
                content: aiResponse,
                contentHtml: aiHtml,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(function () {
            return db.collection("chats").doc(currentChatId).update({
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(function () {
            isBusy = false;
            updateSendButton(false);
            scrollToBottom();
            loadChatList();
        })
        .catch(function (error) {
            hideTyping();
            isBusy = false;
            updateSendButton(false);
            console.error("❌ Error:", error);
            appendMessage("ai", '<div class="error-message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><span>Error: ' + escapeHtml(error.message) + '</span><button class="retry-btn" onclick="retryLastMessage()">Retry</button></div>', true);
        });
}

// ═══════════════════════════════════════
// RETRY LAST MESSAGE
// ═══════════════════════════════════════
function retryLastMessage() {
    if (conversationHistory.length === 0) return;

    // Remove last AI error message from DOM
    var messages = document.getElementById("messagesContainer");
    var lastMsg = messages.lastElementChild;
    if (lastMsg && lastMsg.querySelector('.error-message')) {
        lastMsg.remove();
    }

    var lastUserMsg = null;
    for (var i = conversationHistory.length - 1; i >= 0; i--) {
        if (conversationHistory[i].role === "user") {
            lastUserMsg = conversationHistory[i].parts[0].text;
            break;
        }
    }

    if (lastUserMsg) {
        showTyping();
        isBusy = true;
        updateSendButton(true);

        callGeminiWithRetry(lastUserMsg, 0)
            .then(function (aiResponse) {
                hideTyping();
                aiResponse = verifyResponse(aiResponse, lastUserMsg);
                var aiHtml = convertMarkdown(aiResponse);
                appendMessage("ai", aiHtml, true);

                conversationHistory.push({
                    role: "model",
                    parts: [{ text: aiResponse }]
                });

                return db.collection("chats").doc(currentChatId).collection("messages").add({
                    role: "ai",
                    content: aiResponse,
                    contentHtml: aiHtml,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            })
            .then(function () {
                isBusy = false;
                updateSendButton(false);
                scrollToBottom();
            })
            .catch(function (error) {
                hideTyping();
                isBusy = false;
                updateSendButton(false);
                appendMessage("ai", '<div class="error-message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><span>Still failing. Check your internet connection.</span></div>', true);
            });
    }
}

// ═══════════════════════════════════════
// VERIFY RESPONSE (Custom Rules Check)
// ═══════════════════════════════════════
function verifyResponse(response, originalPrompt) {
    // Check for blocked/lazy responses
    var isBlocked = false;
    CONFIG.BLOCKED_KEYWORDS.forEach(function (keyword) {
        if (response.toLowerCase().includes(keyword.toLowerCase())) {
            isBlocked = true;
        }
    });

    // If response is too short for a meaningful question
    if (response.trim().length < 20 && originalPrompt.length > 20) {
        response = response + "\n\n*Note: This response seems brief. Feel free to ask for more detail.*";
    }

    // If response is empty
    if (!response || response.trim().length === 0) {
        response = "I apologize, but I wasn't able to generate a proper response. Please try rephrasing your question.";
    }

    return response;
}

// ═══════════════════════════════════════
// CALL GEMINI API WITH RETRY
// ═══════════════════════════════════════
function callGeminiWithRetry(prompt, attempt) {
    return new Promise(function (resolve, reject) {
        callGemini(prompt)
            .then(resolve)
            .catch(function (error) {
                if (attempt < CONFIG.MAX_RETRIES) {
                    console.log("⏳ Retry attempt " + (attempt + 1) + " of " + CONFIG.MAX_RETRIES + "...");
                    updateTypingText("Retrying... (attempt " + (attempt + 1) + ")");

                    setTimeout(function () {
                        callGeminiWithRetry(prompt, attempt + 1)
                            .then(resolve)
                            .catch(reject);
                    }, CONFIG.RETRY_DELAY * (attempt + 1));
                } else {
                    reject(new Error("Failed after " + CONFIG.MAX_RETRIES + " retries. " + error.message));
                }
            });
    });
}

// ═══════════════════════════════════════
// CALL GEMINI API (with conversation context)
// ═══════════════════════════════════════
// ═══════════════════════════════════════
// CALL GEMINI API VIA BACKEND (SECURE)
// ═══════════════════════════════════════
function callGemini(prompt) {
    console.log("🤖 Calling Gemini via backend...");

    // ═══ CHANGED: Call YOUR backend, not Gemini directly ═══
    var url = CONFIG.BACKEND_URL + "/api/chat";

    // Build contents with full conversation history
    var contents = [];

    // Add conversation history (last 20 messages for context window)
    var historyStart = Math.max(0, conversationHistory.length - 20);
    for (var i = historyStart; i < conversationHistory.length; i++) {
        contents.push(conversationHistory[i]);
    }

    // If no history, add the current message
    if (contents.length === 0) {
        contents.push({
            role: "user",
            parts: [{ text: prompt }]
        });
    }

    var body = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: CONFIG.SYSTEM_PROMPT }]
        },
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
    };

    // Create abort controller for timeout
    var controller = new AbortController();
    var timeoutId = setTimeout(function () {
        controller.abort();
    }, CONFIG.REQUEST_TIMEOUT);

    return fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
    })
    .then(function (response) {
        clearTimeout(timeoutId);

        if (!response.ok) {
            return response.json().then(function (errData) {
                throw new Error(errData.error ? errData.error.message : "HTTP " + response.status);
            });
        }

        return response.json();
    })
    .then(function (data) {
        if (data.error) {
            throw new Error(data.error.message || "API error");
        }

        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("No response generated. The content may have been blocked by safety filters.");
        }

        var text = data.candidates[0].content.parts[0].text;
        console.log("✅ Response received (" + text.length + " chars)");
        return text;
    })
    .catch(function (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            throw new Error("Request timed out. The network may be slow.");
        }

        throw error;
    });
}
// ═══════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════

function appendMessage(role, content, isHtml) {
    var container = document.getElementById("messagesContainer");
    if (!container) return;

    var div = document.createElement("div");
    div.className = "message " + role;

    var avatarContent = role === "user"
        ? (currentUser && currentUser.picture
            ? '<img src="' + currentUser.picture + '" alt="U">'
            : '<span>' + (currentUser ? currentUser.name.charAt(0).toUpperCase() : 'U') + '</span>')
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>';

    var nameText = role === "user" ? (currentUser ? currentUser.name : "You") : "Intellector";
    var bodyContent = isHtml ? content : "<p>" + content + "</p>";

    var timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML =
        '<div class="message-inner">' +
        '<div class="message-avatar">' + avatarContent + '</div>' +
        '<div class="message-body">' +
        '<div class="message-header">' +
        '<div class="message-name">' + nameText + '</div>' +
        '<div class="message-time">' + timestamp + '</div>' +
        '</div>' +
        '<div class="message-text">' + bodyContent + '</div>' +
        (role === "ai" ? '<div class="message-actions"><button class="action-btn" onclick="copyMessage(this)" title="Copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg><span>Copy</span></button></div>' : '') +
        '</div>' +
        '</div>';

    container.appendChild(div);

    // Animate in
    requestAnimationFrame(function () {
        div.classList.add("visible");
    });

    scrollToBottom();
}

function copyMessage(btn) {
    var messageText = btn.closest('.message-body').querySelector('.message-text');
    var text = messageText.innerText || messageText.textContent;

    navigator.clipboard.writeText(text).then(function () {
        var span = btn.querySelector('span');
        span.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function () {
            span.textContent = 'Copy';
            btn.classList.remove('copied');
        }, 2000);
    }).catch(function () {
        // Fallback
        var textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        var span = btn.querySelector('span');
        span.textContent = 'Copied!';
        setTimeout(function () {
            span.textContent = 'Copy';
        }, 2000);
    });
}

function showTyping() {
    var container = document.getElementById("messagesContainer");
    if (!container) return;

    var div = document.createElement("div");
    div.className = "message ai";
    div.id = "typingIndicator";
    div.innerHTML =
        '<div class="message-inner">' +
        '<div class="message-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg></div>' +
        '<div class="message-body">' +
        '<div class="message-name">Intellector</div>' +
        '<div class="typing-container">' +
        '<div class="typing-dots"><span></span><span></span><span></span></div>' +
        '<span class="typing-text" id="typingText">Thinking...</span>' +
        '</div>' +
        '</div>' +
        '</div>';

    container.appendChild(div);
    requestAnimationFrame(function () {
        div.classList.add("visible");
    });
    scrollToBottom();
}

function updateTypingText(text) {
    var el = document.getElementById("typingText");
    if (el) el.textContent = text;
}

function hideTyping() {
    var el = document.getElementById("typingIndicator");
    if (el) {
        el.classList.add("fade-out");
        setTimeout(function () {
            if (el.parentNode) el.remove();
        }, 300);
    }
}

function updateSendButton(busy) {
    var btn = document.getElementById("sendBtn");
    if (!btn) return;

    if (busy) {
        btn.disabled = true;
        btn.innerHTML = '<div class="btn-spinner"></div>';
    } else {
        btn.disabled = false;
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    }
}

function scrollToBottom() {
    var container = document.getElementById("messagesContainer");
    if (container) {
        setTimeout(function () {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }
}

function showElement(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = "flex";
}

function hideElement(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = "none";
}

function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ═══════════════════════════════════════
// ADVANCED MARKDOWN CONVERTER
// ═══════════════════════════════════════
function convertMarkdown(text) {
    if (!text) return '<p></p>';

    var html = text;

    // Code blocks with language detection
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function (match, lang, code) {
        var langLabel = lang ? '<div class="code-lang">' + escapeHtml(lang) + '</div>' : '';
        return '<div class="code-block">' + langLabel + '<button class="code-copy-btn" onclick="copyCode(this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg></button><pre><code>' + escapeHtml(code.trim()) + '</code></pre></div>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Unordered lists
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>');
    html = html.replace(/(<oli>.*<\/oli>\n?)+/g, function (match) {
        return '<ol>' + match.replace(/<\/?oli>/g, function (tag) {
            return tag.replace('oli', 'li');
        }) + '</ol>';
    });

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Tables
    html = html.replace(/^\|(.+)\|$/gm, function (match, content) {
        var cells = content.split('|').map(function (cell) { return cell.trim(); });
        var row = cells.map(function (cell) {
            if (cell.match(/^[\-:]+$/)) return null; // separator row
            return '<td>' + cell + '</td>';
        });
        if (row.includes(null)) return ''; // skip separator
        return '<tr>' + row.join('') + '</tr>';
    });
    html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<div class="table-wrapper"><table>$&</table></div>');

    // Line breaks — convert double newlines to paragraph breaks, single to <br>
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) {
        html = '<p>' + html + '</p>';
    }

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<h[1-4]>)/g, '$1');
    html = html.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ol>)/g, '$1');
    html = html.replace(/(<\/ol>)<\/p>/g, '$1');
    html = html.replace(/<p>(<div class="code-block">)/g, '$1');
    html = html.replace(/(<\/div>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    html = html.replace(/<p>(<div class="table-wrapper">)/g, '$1');
    html = html.replace(/<p><hr><\/p>/g, '<hr>');

    return html;
}

function copyCode(btn) {
    var codeBlock = btn.closest('.code-block').querySelector('code');
    var text = codeBlock.innerText || codeBlock.textContent;

    navigator.clipboard.writeText(text).then(function () {
        btn.classList.add('copied');
        setTimeout(function () {
            btn.classList.remove('copied');
        }, 2000);
    }).catch(function () {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btn.classList.add('copied');
        setTimeout(function () {
            btn.classList.remove('copied');
        }, 2000);
    });
}

// ═══════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════
function toggleSidebar() {
    var sidebar = document.getElementById("sidebar");
    var overlay = document.getElementById("sidebarOverlay");
    if (sidebar) {
        sidebar.classList.toggle("open");
        if (overlay) overlay.classList.toggle("visible");
    }
}

function closeSidebar() {
    var sidebar = document.getElementById("sidebar");
    var overlay = document.getElementById("sidebarOverlay");
    if (sidebar) {
        sidebar.classList.remove("open");
        if (overlay) overlay.classList.remove("visible");
    }
}

// ═══════════════════════════════════════
// KEYBOARD HANDLING & AUTO RESIZE
// ═══════════════════════════════════════
function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function autoResizeInput(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
}

// ═══════════════════════════════════════
// QUICK START
// ═══════════════════════════════════════
function quickStart(text) {
    var input = document.getElementById("messageInput");
    if (input) {
        input.value = text;
        sendMessage();
    }
}

// ═══════════════════════════════════════
// THEME TOGGLE (bonus)
// ═══════════════════════════════════════
function toggleTheme() {
    document.body.classList.toggle('light-theme');
    var isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('intellector-theme', isLight ? 'light' : 'dark');
}

// Load saved theme
(function () {
    var savedTheme = localStorage.getItem('intellector-theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }
})();

console.log("✅ Intellector app.js loaded (v2.0 — Enhanced)");
