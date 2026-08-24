const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const messages = document.getElementById("messages");
const welcome = document.getElementById("welcome");

const typing = document.getElementById("typing");

const newChatBtn = document.getElementById("newChatBtn");
const themeBtn = document.getElementById("themeBtn");

const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");


// ============================================================
// STATE
// ============================================================

let conversationId = localStorage.getItem(
    "foodwise_conversation_id"
);

let conversationHistory = [];

let isSending = false;


// ============================================================
// CREATE CONVERSATION ID
// ============================================================

function createConversationId() {

    return (
        "foodwise-" +
        Date.now() +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 10)
    );
}


if (!conversationId) {

    conversationId = createConversationId();

    localStorage.setItem(
        "foodwise_conversation_id",
        conversationId
    );
}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHTML(text) {

    const div = document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
}


// ============================================================
// FORMAT AI RESPONSE
// ============================================================

function formatMessage(text) {

    if (!text) {
        return "";
    }


    let safe = escapeHTML(text);


    // --------------------------------------------------------
    // Bold
    // --------------------------------------------------------

    safe = safe.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );


    // --------------------------------------------------------
    // Headings
    // --------------------------------------------------------

    safe = safe.replace(
        /^### (.*?)$/gm,
        "<h4>$1</h4>"
    );

    safe = safe.replace(
        /^## (.*?)$/gm,
        "<h3>$1</h3>"
    );

    safe = safe.replace(
        /^# (.*?)$/gm,
        "<h3>$1</h3>"
    );


    // --------------------------------------------------------
    // Bullet points
    // --------------------------------------------------------

    safe = safe.replace(
        /^[•\-] (.*?)$/gm,
        "<li>$1</li>"
    );


    // --------------------------------------------------------
    // Numbered lists
    // --------------------------------------------------------

    safe = safe.replace(
        /^\d+\.\s+(.*?)$/gm,
        "<li>$1</li>"
    );


    // --------------------------------------------------------
    // Group consecutive list items
    // --------------------------------------------------------

    safe = safe.replace(
        /(<li>.*?<\/li>(?:\s*<li>.*?<\/li>)*)/gs,
        "<ul>$1</ul>"
    );


    // --------------------------------------------------------
    // Paragraphs
    // --------------------------------------------------------

    const blocks = safe
        .split(/\n\s*\n/)
        .map(block => block.trim())
        .filter(block => block.length > 0);


    let result = "";

    blocks.forEach(block => {

        if (
            block.startsWith("<ul>") ||
            block.startsWith("<h3>") ||
            block.startsWith("<h4>")
        ) {

            result += block;

        } else {

            result +=
                "<p>" +
                block.replace(/\n/g, "<br>") +
                "</p>";
        }

    });


    return result;
}


// ============================================================
// ADD MESSAGE
// ============================================================

function addMessage(role, text) {

    welcome.style.display = "none";


    const wrapper = document.createElement("div");

    wrapper.className =
        `message ${role}`;


    const avatar = document.createElement("div");

    avatar.className = "avatar";

    avatar.textContent =
        role === "assistant"
            ? "🥗"
            : "👤";


    const content = document.createElement("div");

    content.className = "message-content";


    if (role === "assistant") {

        content.innerHTML =
            formatMessage(text);

    } else {

        content.textContent = text;
    }


    if (role === "assistant") {

        wrapper.appendChild(avatar);

        wrapper.appendChild(content);

    } else {

        wrapper.appendChild(content);
    }


    messages.appendChild(wrapper);


    scrollToBottom();
}


// ============================================================
// SCROLL TO BOTTOM
// ============================================================

function scrollToBottom() {

    const chatArea =
        document.getElementById("chatArea");


    requestAnimationFrame(() => {

        chatArea.scrollTop =
            chatArea.scrollHeight;

    });
}


// ============================================================
// SHOW TYPING
// ============================================================

function showTyping() {

    typing.classList.add("show");

    scrollToBottom();
}


// ============================================================
// HIDE TYPING
// ============================================================

function hideTyping() {

    typing.classList.remove("show");
}


// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage(customMessage = null) {

    if (isSending) {
        return;
    }


    const text =
        customMessage !== null
            ? customMessage.trim()
            : messageInput.value.trim();


    if (!text) {
        return;
    }


    isSending = true;

    sendBtn.disabled = true;


    if (customMessage === null) {

        messageInput.value = "";

        autoResize();
    }


    // --------------------------------------------------------
    // SHOW USER MESSAGE
    // --------------------------------------------------------

    addMessage(
        "user",
        text
    );


    conversationHistory.push({

        role: "user",

        text: text

    });


    showTyping();


    try {

        const response = await fetch(
            "/api/chat",
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    message: text,

                    conversation_id:
                        conversationId,

                    history:
                        conversationHistory.slice(-12)

                })

            }
        );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Server error occurred."
            );
        }


        if (!data.success) {

            throw new Error(
                data.error ||
                "FoodWise AI could not respond."
            );
        }


        // ----------------------------------------------------
        // UPDATE CONVERSATION ID
        // ----------------------------------------------------

        if (data.conversation_id) {

            conversationId =
                data.conversation_id;

            localStorage.setItem(
                "foodwise_conversation_id",
                conversationId
            );
        }


        // ----------------------------------------------------
        // HIDE TYPING
        // ----------------------------------------------------

        hideTyping();


        // ----------------------------------------------------
        // DISPLAY COMPLETE RESPONSE
        // ----------------------------------------------------

        addMessage(
            "assistant",
            data.reply
        );


        // ----------------------------------------------------
        // SAVE HISTORY
        // ----------------------------------------------------

        conversationHistory.push({

            role: "assistant",

            text: data.reply

        });


        // Make sure the complete message is visible

        setTimeout(() => {

            scrollToBottom();

        }, 100);


    } catch (error) {

        hideTyping();


        console.error(
            "FoodWise error:",
            error
        );


        addMessage(
            "assistant",
            "⚠️ " + error.message
        );


    } finally {

        isSending = false;

        sendBtn.disabled = false;

        messageInput.focus();

    }
}


// ============================================================
// SEND BUTTON
// ============================================================

sendBtn.addEventListener(
    "click",
    () => {

        sendMessage();

    }
);


// ============================================================
// ENTER KEY
// ============================================================

messageInput.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();

        }

    }
);


// ============================================================
// TEXTAREA RESIZE
// ============================================================

function autoResize() {

    messageInput.style.height = "auto";


    const newHeight =
        Math.min(
            messageInput.scrollHeight,
            130
        );


    messageInput.style.height =
        newHeight + "px";
}


messageInput.addEventListener(
    "input",
    autoResize
);


// ============================================================
// QUICK SUGGESTIONS
// ============================================================

document
    .querySelectorAll(
        ".suggestion, .quick-sidebar-btn"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const prompt =
                    button.dataset.prompt;


                if (prompt) {

                    sendMessage(prompt);

                }


                if (sidebar) {

                    sidebar.classList.remove(
                        "open"
                    );

                }

            }
        );

    });


// ============================================================
// NEW CHAT
// ============================================================

newChatBtn.addEventListener(
    "click",
    () => {

        conversationId =
            createConversationId();


        localStorage.setItem(
            "foodwise_conversation_id",
            conversationId
        );


        conversationHistory = [];


        messages.innerHTML = "";


        welcome.style.display =
            "block";


        messageInput.value = "";


        autoResize();


        messageInput.focus();


        sidebar.classList.remove(
            "open"
        );

    }
);


// ============================================================
// DARK MODE
// ============================================================

const savedTheme =
    localStorage.getItem(
        "foodwise_theme"
    );


if (savedTheme === "dark") {

    document.body.classList.add(
        "dark"
    );

    themeBtn.textContent =
        "☀️";
}


themeBtn.addEventListener(
    "click",
    () => {

        document.body.classList.toggle(
            "dark"
        );


        const isDark =
            document.body.classList.contains(
                "dark"
            );


        localStorage.setItem(
            "foodwise_theme",
            isDark
                ? "dark"
                : "light"
        );


        themeBtn.textContent =
            isDark
                ? "☀️"
                : "🌙";

    }
);


// ============================================================
// MOBILE SIDEBAR
// ============================================================

menuBtn.addEventListener(
    "click",
    () => {

        sidebar.classList.toggle(
            "open"
        );

    }
);
