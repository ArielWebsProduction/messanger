/* =========================================================
   PALM MESSENGER
   Frontend JavaScript
   ========================================================= */

let socket = null;
let token = localStorage.getItem("palm_token");
let currentUser = null;

let selectedMessage = null;
let editingMessageId = null;
let deletingMessageId = null;

let typingTimer = null;
let isTyping = false;

const $ = (id) => document.getElementById(id);


/* =========================================================
   ELEMENTS
   ========================================================= */

const authScreen = $("auth-screen");
const chatScreen = $("chat-screen");

const loginForm = $("login-form");
const registerForm = $("register-form");

const loginUsername = $("login-username");
const loginPassword = $("login-password");

const registerUsername = $("register-username");
const registerDisplayName = $("register-display-name");
const registerPassword = $("register-password");
const registerPasswordConfirm = $("register-password-confirm");

const loginError = $("login-error");
const registerError = $("register-error");

const messagesContainer = $("messages");
const messageInput = $("message-input");
const sendButton = $("send-button");

const typingIndicator = $("typing-indicator");
const typingText = $("typing-text");

const messageMenu = $("message-menu");

const editModal = $("edit-modal");
const editInput = $("edit-input");

const deleteModal = $("delete-modal");

const profileModal = $("profile-modal");

const toast = $("toast");

const contextMenu = document.getElementById("contextMenu");

/* =========================================================
   INITIALIZATION
   ========================================================= */

function sendMessage() {
    const text = messageInput.value.trim();

    if (!text) return;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showToast("Нет соединения с сервером");
        return;
    }

    socket.send(JSON.stringify({
        type: "message",
        text: text,
        reply_to: messageInput.dataset.replyTo || null
    }));

    messageInput.value = "";
    delete messageInput.dataset.replyTo;

    autoResizeTextarea();
    sendTypingStatus(false);
}

function setupChatEvents() {
    if (sendButton) {
        sendButton.addEventListener("click", sendMessage);
    }

    if (emojiButton) {
        emojiButton.addEventListener("click", insertRandomEmoji);
    }

    if (messageInput) {
        messageInput.addEventListener("input", () => {
            autoResizeTextarea();
            sendTypingStatus(true);

            clearTimeout(typingTimeout);

            typingTimeout = setTimeout(() => {
                sendTypingStatus(false);
            }, 1000);
        });

        messageInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", async () => {

    setupAuthEvents();
    setupChatEvents();
    setupProfileEvents();
    setupMessageMenu();
    setupModalEvents();

    if (token) {
        await restoreSession();
    }
});


/* =========================================================
   AUTH EVENTS
   ========================================================= */

function setupAuthEvents() {

    $("show-register").addEventListener("click", () => {

        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");

        loginError.textContent = "";
        registerError.textContent = "";
    });


    $("show-login").addEventListener("click", () => {

        registerForm.classList.add("hidden");
        loginForm.classList.remove("hidden");

        loginError.textContent = "";
        registerError.textContent = "";
    });


    $("login-button").addEventListener("click", login);


    $("register-button").addEventListener(
        "click",
        register
    );


    loginPassword.addEventListener("keydown", (event) => {

        if (event.key === "Enter") {
            login();
        }
    });


    registerPasswordConfirm.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Enter") {
                register();
            }
        }
    );
}


/* =========================================================
   REGISTER
   ========================================================= */

async function register() {

    registerError.textContent = "";

    const username =
        registerUsername.value.trim();

    const displayName =
        registerDisplayName.value.trim();

    const password =
        registerPassword.value;

    const passwordConfirm =
        registerPasswordConfirm.value;


    if (!username || !displayName || !password) {

        registerError.textContent =
            "Заполните все поля.";

        return;
    }


    if (password !== passwordConfirm) {

        registerError.textContent =
            "Пароли не совпадают.";

        return;
    }


    if (password.length < 6) {

        registerError.textContent =
            "Пароль должен содержать минимум 6 символов.";

        return;
    }


    try {

        setButtonLoading(
            $("register-button"),
            true
        );


        const response = await fetch(
            "/api/register",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    username,
                    display_name: displayName,
                    password
                })
            }
        );


        const data = await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Не удалось создать аккаунт."
            );
        }


        token = data.token;

        localStorage.setItem(
            "palm_token",
            token
        );


        currentUser = data.user;


        await openMessenger();


        showToast(
            "Аккаунт создан 🌴"
        );


    } catch (error) {

        registerError.textContent =
            error.message;

    } finally {

        setButtonLoading(
            $("register-button"),
            false
        );
    }
}


/* =========================================================
   LOGIN
   ========================================================= */

async function login() {

    loginError.textContent = "";

    const username =
        loginUsername.value.trim();

    const password =
        loginPassword.value;


    if (!username || !password) {

        loginError.textContent =
            "Введите имя пользователя и пароль.";

        return;
    }


    try {

        setButtonLoading(
            $("login-button"),
            true
        );


        const response = await fetch(
            "/api/login",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    username,
                    password
                })
            }
        );


        const data = await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Не удалось войти."
            );
        }


        token = data.token;

        localStorage.setItem(
            "palm_token",
            token
        );


        currentUser = data.user;


        await openMessenger();


    } catch (error) {

        loginError.textContent =
            error.message;

    } finally {

        setButtonLoading(
            $("login-button"),
            false
        );
    }
}


/* =========================================================
   RESTORE SESSION
   ========================================================= */

async function restoreSession() {

    try {

        const response = await fetch(
            `/api/me?token=${encodeURIComponent(token)}`
        );


        if (!response.ok) {

            throw new Error(
                "Session expired."
            );
        }


        currentUser =
            await response.json();


        await openMessenger();


    } catch (error) {

        logout(false);
    }
}


/* =========================================================
   OPEN MESSENGER
   ========================================================= */

async function openMessenger() {

    authScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");


    updateHeaderAvatar();


    await loadMessageHistory();


    connectWebSocket();
}


/* =========================================================
   WEBSOCKET
   ========================================================= */

function connectWebSocket() {

    if (!token) {
        return;
    }


    if (
        socket &&
        (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        )
    ) {
        return;
    }


    const protocol =
        location.protocol === "https:"
            ? "wss:"
            : "ws:";


    const wsUrl =
        `${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`;


    socket = new WebSocket(wsUrl);


    socket.addEventListener(
        "open",
        () => {

            console.log(
                "Palm Messenger WebSocket connected."
            );

            updateConnectionStatus(true);
        }
    );


    socket.addEventListener(
        "message",
        (event) => {

            try {

                const data =
                    JSON.parse(event.data);

                handleSocketEvent(data);

            } catch (error) {

                console.error(
                    "WebSocket message error:",
                    error
                );
            }
        }
    );


    socket.addEventListener(
        "close",
        () => {

            updateConnectionStatus(false);


            if (token) {

                setTimeout(
                    connectWebSocket,
                    3000
                );
            }
        }
    );


    socket.addEventListener(
        "error",
        (error) => {

            console.error(
                "WebSocket error:",
                error
            );
        }
    );
}


/* =========================================================
   SOCKET EVENTS
   ========================================================= */

function handleSocketEvent(data) {

    switch (data.type) {

        case "message":

            addMessage(data);

            break;


        case "edit":

            updateMessage(
                data.id,
                data.text
            );

            break;


        case "delete":

            removeMessage(
                data.id
            );

            break;


        case "typing":

            handleTypingEvent(data);

            break;


        case "online":

            updateOnlineStatus();

            break;


        case "offline":

            updateOnlineStatus();

            break;
    }
}


/* =========================================================
   MESSAGE HISTORY
   ========================================================= */

async function loadMessageHistory() {

    try {

        const response =
            await fetch("/api/messages");


        if (!response.ok) {
            throw new Error(
                "Could not load messages."
            );
        }


        const messages =
            await response.json();


        messagesContainer.innerHTML = "";


        if (!messages.length) {

            showWelcomeMessage();

            return;
        }


        messages.forEach(
            (message) => addMessage(
                message,
                false
            )
        );


        scrollToBottom(false);


    } catch (error) {

        console.error(
            "Message history error:",
            error
        );

        showToast(
            "Не удалось загрузить сообщения."
        );
    }
}


/* =========================================================
   ADD MESSAGE
   ========================================================= */

function addMessage(
    message,
    scroll = true
) {

    removeWelcomeMessage();


    const existing =
        document.querySelector(
            `[data-message-id="${message.id}"]`
        );


    if (existing) {
        return;
    }


    const own =
        currentUser &&
        message.username === currentUser.username;


    const row =
        document.createElement("div");


    row.className =
        `message-row ${own ? "own" : ""}`;


    row.dataset.messageId =
        message.id;


    const avatar =
        document.createElement("div");


    avatar.className =
        "avatar message-avatar";


    avatar.dataset.username =
        message.username;


    avatar.innerHTML =
        getAvatarHTML(
            message.username
        );


    avatar.addEventListener(
        "click",
        () => openProfile(
            message.username
        )
    );


    const content =
        document.createElement("div");


    content.className =
        "message-content";


    if (!own) {

        const author =
            document.createElement("div");


        author.className =
            "message-author";


        author.textContent =
            message.display_name ||
            message.username;


        author.addEventListener(
            "click",
            () => openProfile(
                message.username
            )
        );


        content.appendChild(author);
    }


    const bubble =
        document.createElement("div");


    bubble.className =
        "message-bubble";


    bubble.dataset.messageId =
        message.id;


    const text =
        document.createElement("div");


    text.className =
        "message-text";


    text.textContent =
        message.text;


    bubble.appendChild(text);


    const meta =
        document.createElement("div");


    meta.className =
        "message-meta";


    const time =
        document.createElement("span");


    time.textContent =
        formatTime(
            message.created_at
        );


    meta.appendChild(time);


    if (message.edited) {

        const edited =
            document.createElement("span");


        edited.className =
            "edited-label";


        edited.textContent =
            "изменено";


        meta.appendChild(edited);
    }


    bubble.appendChild(meta);


    content.appendChild(bubble);


    if (own) {

        row.appendChild(content);
        row.appendChild(avatar);

    } else {

        row.appendChild(avatar);
        row.appendChild(content);
    }


    messagesContainer.appendChild(row);


    setupMessageInteractions(
        row,
        message
    );


    if (scroll) {
        scrollToBottom();
    }
}


/* =========================================================
   MESSAGE INTERACTIONS
   ========================================================= */

function setupMessageInteractions(
    row,
    message
) {

    let longPressTimer = null;
    let longPressTriggered = false;


    // Desktop right click

    row.addEventListener(
        "contextmenu",
        (event) => {

            event.preventDefault();

            openMessageMenu(
                event.clientX,
                event.clientY,
                message
            );
        }
    );


    // Mobile long press

    row.addEventListener(
        "touchstart",
        (event) => {

            longPressTriggered = false;


            const touch =
                event.touches[0];


            longPressTimer =
                setTimeout(() => {

                    longPressTriggered = true;


                    openMessageMenu(
                        touch.clientX,
                        touch.clientY,
                        message
                    );

                }, 550);
        },
        { passive: true }
    );


    row.addEventListener(
        "touchend",
        () => {

            clearTimeout(
                longPressTimer
            );
        }
    );


    row.addEventListener(
        "touchmove",
        () => {

            clearTimeout(
                longPressTimer
            );
        }
    );


    row.addEventListener(
        "touchcancel",
        () => {

            clearTimeout(
                longPressTimer
            );
        }
    );
}


/* =========================================================
   MESSAGE MENU
   ========================================================= */

function setupMessageMenu() {

    document.addEventListener(
        "click",
        (event) => {

            if (
                !messageMenu.contains(
                    event.target
                )
            ) {
                closeMessageMenu();
            }
        }
    );


    messageMenu
        .querySelectorAll("button")
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    const action =
                        button.dataset.action;


                    if (!selectedMessage) {
                        return;
                    }


                    switch (action) {

                        case "copy":
                            copyMessage(
                                selectedMessage
                            );
                            break;

                        case "reply":
                            replyToMessage(
                                selectedMessage
                            );
                            break;

                        case "edit":
                            openEditMessage(
                                selectedMessage
                            );
                            break;

                        case "delete":
                            openDeleteConfirmation(
                                selectedMessage
                            );
                            break;
                    }


                    closeMessageMenu();
                }
            );
        });
}


/* =========================================================
   OPEN MESSAGE MENU
   ========================================================= */

function openMessageMenu(
    x,
    y,
    message
) {

    selectedMessage =
        message;


    const own =
        currentUser &&
        message.username ===
            currentUser.username;


    $("edit-message-action")
        .classList.toggle(
            "hidden",
            !own
        );


    $("delete-message-action")
        .classList.toggle(
            "hidden",
            !own
        );


    messageMenu.classList.remove(
        "hidden"
    );


    const menuWidth =
        messageMenu.offsetWidth;


    const menuHeight =
        messageMenu.offsetHeight;


    let left = x;
    let top = y;


    if (
        left + menuWidth >
        window.innerWidth - 10
    ) {
        left =
            window.innerWidth -
            menuWidth -
            10;
    }


    if (
        top + menuHeight >
        window.innerHeight - 10
    ) {
        top =
            window.innerHeight -
            menuHeight -
            10;
    }


    messageMenu.style.left =
        `${Math.max(10, left)}px`;


    messageMenu.style.top =
        `${Math.max(10, top)}px`;
}


function closeMessageMenu() {

    messageMenu.classList.add(
        "hidden"
    );

    selectedMessage = null;
}


/* =========================================================
   COPY MESSAGE
   ========================================================= */

async function copyMessage(message) {

    try {

        await navigator.clipboard.writeText(
            message.text
        );


        showToast(
            "Сообщение скопировано 📋"
        );


    } catch (error) {

        // Fallback for older browsers

        const textarea =
            document.createElement("textarea");


        textarea.value =
            message.text;


        document.body.appendChild(
            textarea
        );


        textarea.select();


        document.execCommand(
            "copy"
        );


        textarea.remove();


        showToast(
            "Сообщение скопировано 📋"
        );
    }
}


/* =========================================================
   REPLY
   ========================================================= */

function replyToMessage(message) {

    messageInput.focus();


    messageInput.value =
        `@${message.username}: `;


    messageInput.dataset.replyTo =
        message.id;


    resizeTextarea();


    showToast(
        `Ответ пользователю ${message.display_name}`
    );
}


/* =========================================================
   EDIT MESSAGE
   ========================================================= */
function openEditMessage(message) {
    editingMessageId = message.id;
    editText.value = message.text;
    editModal.classList.remove("hidden");
    editText.focus();
}

function closeEditModal() {
    editingMessageId = null;
    editModal.classList.add("hidden");
}

function confirmEdit() {
    if (!editingMessageId) return;

    const text = editText.value.trim();

    if (!text) {
        showToast("Сообщение не может быть пустым");
        return;
    }

    if (text.length > 5000) {
        showToast("Сообщение слишком длинное");
        return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showToast("Нет соединения с сервером");
        return;
    }

    socket.send(JSON.stringify({
        type: "edit",
        id: editingMessageId,
        text: text
    }));

    closeEditModal();
}

function openDeleteMessage(message) {
    deletingMessageId = message.id;
    deleteModal.classList.remove("hidden");
}

function closeDeleteModal() {
    deletingMessageId = null;
    deleteModal.classList.add("hidden");
}

function confirmDelete() {
    if (!deletingMessageId) return;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showToast("Нет соединения с сервером");
        return;
    }

    socket.send(JSON.stringify({
        type: "delete",
        id: deletingMessageId
    }));

    closeDeleteModal();
}

function copyMessage(message) {
    const text = message.text;

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showToast("Сообщение скопировано");
            })
            .catch(() => {
                fallbackCopy(text);
            });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand("copy");
        showToast("Сообщение скопировано");
    } catch (error) {
        showToast("Не удалось скопировать сообщение");
    }

    document.body.removeChild(textarea);
}

function replyToMessage(message) {
    messageInput.value = `@${message.username}: `;
    messageInput.focus();

    messageInput.dataset.replyTo = message.id;

    autoResizeTextarea();
    showToast(`Ответ пользователю ${message.display_name}`);
}

async function openProfile(username) {
    try {
        const response = await fetch(`/api/profile/${encodeURIComponent(username)}`);

        if (!response.ok) {
            throw new Error("Profile not found");
        }

        const profile = await response.json();

        profileName.textContent = profile.display_name;
        profileUsername.textContent = `@${profile.username}`;

        if (profile.avatar) {
            profileAvatar.innerHTML = `
                <img
                    src="${profile.avatar}"
                    alt="${escapeHTML(profile.display_name)}"
                    onerror="this.parentElement.innerHTML='<span>👤</span>'"
                >
            `;
        } else {
            profileAvatar.innerHTML = "<span>👤</span>";
        }

        profileBio.textContent = profile.bio || "Пользователь пока не добавил описание.";

        if (profile.created_at) {
            const date = new Date(profile.created_at);

            if (!isNaN(date.getTime())) {
                profileJoined.textContent =
                    `На Palm Messenger с ${date.toLocaleDateString("ru-RU")}`;
            } else {
                profileJoined.textContent = "";
            }
        } else {
            profileJoined.textContent = "";
        }

        profileModal.classList.remove("hidden");

    } catch (error) {
        console.error(error);
        showToast("Не удалось открыть профиль");
    }
}

function closeProfileModal() {
    profileModal.classList.add("hidden");
}

function openMyProfile() {
    if (!currentUser) return;

    openProfile(currentUser.username);
}

function editMyProfile() {
    showToast("Редактирование профиля скоро будет добавлено");
}

function logout() {
    if (socket) {
        socket.close();
        socket = null;
    }

    localStorage.removeItem(TOKEN_KEY);

    currentUser = null;

    authScreen.classList.remove("hidden");
    messengerScreen.classList.add("hidden");

    loginForm.reset();
    registerForm.reset();

    messagesContainer.innerHTML = "";

    showLoginForm();
    showToast("Вы вышли из аккаунта");
}

function updateConnectionStatus(connected) {
    if (!connectionStatus) return;

    if (connected) {
        connectionStatus.textContent = "● Онлайн";
        connectionStatus.classList.add("online");
        connectionStatus.classList.remove("offline");
    } else {
        connectionStatus.textContent = "● Нет соединения";
        connectionStatus.classList.add("offline");
        connectionStatus.classList.remove("online");
    }
}

function showWelcomeMessage() {
    if (!messagesContainer) return;

    if (messagesContainer.children.length > 0) return;

    const welcome = document.createElement("div");

    welcome.className = "welcome-message";

    welcome.innerHTML = `
        <div class="welcome-icon">🌴</div>
        <h2>Добро пожаловать в Palm Messenger!</h2>
        <p>Напишите первое сообщение в глобальный чат.</p>
    `;

    messagesContainer.appendChild(welcome);
}

function scrollToBottom(smooth = true) {
    if (!messagesContainer) return;

    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: smooth ? "smooth" : "auto"
    });
}

function showTyping(username) {
    if (!typingIndicator) return;

    if (!username || username === currentUser?.username) {
        return;
    }

    typingIndicator.textContent = `${username} печатает...`;
    typingIndicator.classList.remove("hidden");

    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
        typingIndicator.classList.add("hidden");
    }, 2000);
}

function hideTyping() {
    if (!typingIndicator) return;

    typingIndicator.classList.add("hidden");

    clearTimeout(typingTimeout);
}

function sendTypingStatus(isTyping) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }

    if (!currentUser) {
        return;
    }

    socket.send(JSON.stringify({
        type: "typing",
        is_typing: isTyping
    }));
}

function autoResizeTextarea() {
    if (!messageInput) return;

    messageInput.style.height = "auto";

    const maxHeight = 150;

    messageInput.style.height =
        Math.min(messageInput.scrollHeight, maxHeight) + "px";
}

function insertRandomEmoji() {
    const emojis = [
        "🌴",
        "🌺",
        "🌊",
        "☀️",
        "🥥",
        "🍍",
        "🏝️",
        "😎",
        "😂",
        "👍",
        "❤️",
        "🔥",
        "✨",
        "😊"
    ];

    const emoji = emojis[Math.floor(Math.random() * emojis.length)];

    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;

    const text = messageInput.value;

    messageInput.value =
        text.substring(0, start) +
        emoji +
        text.substring(end);

    messageInput.selectionStart = start + emoji.length;
    messageInput.selectionEnd = start + emoji.length;

    messageInput.focus();

    autoResizeTextarea();
}

function showToast(message) {
    if (!toast) return;

    toast.textContent = message;
    toast.classList.remove("hidden");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.add("hidden");
    }, 2500);
}

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function setButtonLoading(button, loading) {
    if (!button) return;

    if (loading) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = "Загрузка...";
    } else {
        button.disabled = false;

        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
        }
    }
}

function closeAllMenus() {
    if (contextMenu) {
        contextMenu.classList.add("hidden");
    }
}

function closeAllModals() {
    if (profileModal) {
        profileModal.classList.add("hidden");
    }

    if (editModal) {
        editModal.classList.add("hidden");
    }

    if (deleteModal) {
        deleteModal.classList.add("hidden");
    }

    closeAllMenus();
}

document.addEventListener("click", (event) => {
    if (
        contextMenu &&
        !contextMenu.contains(event.target)
    ) {
        closeAllMenus();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeAllModals();
    }
});

if (sendButton) {
    sendButton.addEventListener("click", sendMessage);
}

if (emojiButton) {
    emojiButton.addEventListener("click", insertRandomEmoji);
}

if (messageInput) {
    messageInput.addEventListener("input", () => {
        autoResizeTextarea();

        sendTypingStatus(true);

        clearTimeout(typingTimeout);

        typingTimeout = setTimeout(() => {
            sendTypingStatus(false);
        }, 1000);
    });

    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });
}

if (editConfirmButton) {
    editConfirmButton.addEventListener("click", confirmEdit);
}

if (editCancelButton) {
    editCancelButton.addEventListener("click", closeEditModal);
}

if (deleteConfirmButton) {
    deleteConfirmButton.addEventListener("click", confirmDelete);
}

if (deleteCancelButton) {
    deleteCancelButton.addEventListener("click", closeDeleteModal);
}

if (profileCloseButton) {
    profileCloseButton.addEventListener("click", closeProfileModal);
}

if (profileButton) {
    profileButton.addEventListener("click", openMyProfile);
}

if (logoutButton) {
    logoutButton.addEventListener("click", logout);
}

if (editProfileButton) {
    editProfileButton.addEventListener("click", editMyProfile);
}

if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
}

if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
}

if (showRegisterButton) {
    showRegisterButton.addEventListener("click", showRegisterForm);
}

if (showLoginButton) {
    showLoginButton.addEventListener("click", showLoginForm);
}

if (profileModal) {
    profileModal.addEventListener("click", (event) => {
        if (event.target === profileModal) {
            closeProfileModal();
        }
    });
}

if (editModal) {
    editModal.addEventListener("click", (event) => {
        if (event.target === editModal) {
            closeEditModal();
        }
    });
}

if (deleteModal) {
    deleteModal.addEventListener("click", (event) => {
        if (event.target === deleteModal) {
            closeDeleteModal();
        }
    });
}

updateConnectionStatus(false);

restoreSession();
