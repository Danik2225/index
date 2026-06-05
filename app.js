const storageKey = "nosim-chat-state-v4";
const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const userDialog = document.querySelector("#userDialog");
const groupDialog = document.querySelector("#groupDialog");
const profileDialog = document.querySelector("#profileDialog");
const userForm = document.querySelector("#userForm");
const groupForm = document.querySelector("#groupForm");
const groupUserList = document.querySelector("#groupUserList");
const profileForm = document.querySelector("#profileForm");

const palette = [
  "linear-gradient(135deg, #326f97, #4a9f8c)",
  "linear-gradient(135deg, #d86748, #b28c2f)",
  "linear-gradient(135deg, #0b7a5d, #326f97)",
  "linear-gradient(135deg, #6d63b7, #d86748)",
  "linear-gradient(135deg, #19324a, #0b7a5d)",
  "linear-gradient(135deg, #b28c2f, #326f97)"
];

let state = loadState();
let activeChatId = null;
let activeTab = "chats";
let searchTerm = "";

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.directory) && Array.isArray(parsed.chats)) {
        return parsed;
      }
    } catch (error) {
      localStorage.removeItem(storageKey);
    }
  }

  return {
    account: null,
    directory: [],
    chats: []
  };
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function normalizeHandle(value) {
  const clean = String(value || "").replace(/\D/g, "").slice(0, 16);
  return clean || String(Math.floor(100000 + Math.random() * 900000));
}

function userIdFromHandle(handle) {
  return `user-${handle}`;
}

function groupHandleFromName(name) {
  const slug = String(name || "group")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_а-яё-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `#${slug || "group"}`;
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function nowTime() {
  return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function inviteCode(handle) {
  return handle;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function iconRefresh() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function render() {
  if (!state.account) {
    renderOnboarding();
  } else {
    renderMessenger();
  }
  iconRefresh();
}

function renderOnboarding() {
  app.className = "app-shell";
  app.innerHTML = `
    <section class="onboarding">
      <div class="onboarding-panel">
        <div class="brand-mark" aria-hidden="true"><i data-lucide="message-circle"></i></div>
        <div>
          <h1>NoSIM Chat</h1>
          <p>Аккаунт создаётся по имени и придуманному номеру. SIM-карта не нужна.</p>
        </div>
        <form class="setup-form" id="setupForm">
          <label>
            Имя
            <input name="name" autocomplete="name" maxlength="32" placeholder="Как тебя показать в чате" required />
          </label>
          <label>
            NoSIM номер
            <input name="handle" autocomplete="off" inputmode="numeric" maxlength="16" placeholder="1001" required />
          </label>
          <button class="primary-button">Зарегистрироваться</button>
        </form>
      </div>
      <div class="onboarding-visual" aria-hidden="true">
        <div class="phone-preview">
          <div class="preview-top">
            <i data-lucide="message-circle"></i>
            <span>NoSIM</span>
          </div>
          <div class="preview-list">
            ${[0, 1, 2, 3]
              .map(
                (index) => `
                <div class="preview-row">
                  <div class="avatar" style="--avatar-bg:${palette[index]}">${index + 1}</div>
                  <div class="preview-line">
                    <span class="skeleton"></span>
                    <span class="skeleton short"></span>
                  </div>
                </div>`
              )
              .join("")}
          </div>
          <div class="preview-composer">
            <span class="skeleton"></span>
            <div class="send-button"><i data-lucide="send"></i></div>
          </div>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#setupForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createAccount(data.get("name"), data.get("handle"));
  });
}

function createAccount(name, handle) {
  const account = createUserRecord(name, handle, 4);
  state.account = account;
  upsertDirectoryUser(account);
  activeChatId = null;
  saveState();
  render();
}

function createUserRecord(name, handle, colorIndex = state.directory.length) {
  const normalizedHandle = normalizeHandle(handle);
  return {
    id: userIdFromHandle(normalizedHandle),
    name: String(name || "User").trim().slice(0, 32) || "User",
    handle: normalizedHandle,
    status: "зарегистрирован",
    color: palette[colorIndex % palette.length]
  };
}

function upsertDirectoryUser(user) {
  const index = state.directory.findIndex((item) => item.handle === user.handle);
  if (index >= 0) {
    state.directory[index] = { ...state.directory[index], ...user };
  } else {
    state.directory.push(user);
  }
}

function renderMessenger() {
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  const mobileClass = isMobile && activeChatId ? " mobile-chat" : "";
  app.className = `app-shell messenger${mobileClass}`;
  app.innerHTML = `
    ${renderSidebar()}
    ${activeChatId ? renderChatPane(getActiveChat()) : isMobile ? "" : renderEmptyState("Выбери чат", "Сообщения появятся здесь.")}
    ${activeChatId ? renderDetails(getActiveChat()) : ""}
  `;
  bindMessengerEvents();
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <header class="side-head">
        <button class="account-chip" id="profileButton" aria-label="Профиль">
          ${avatarHtml(state.account, "small")}
          <span class="account-text">
            <span class="account-name">${escapeHtml(state.account.name)}</span>
            <span class="account-handle">${escapeHtml(state.account.handle)}</span>
          </span>
        </button>
        <div class="side-actions">
          <button class="side-action" id="newUserButton" aria-label="Зарегистрировать пользователя"><i data-lucide="user-plus"></i></button>
          <button class="side-action" id="newGroupButton" aria-label="Создать группу"><i data-lucide="users-round"></i></button>
          <button class="side-action" id="copyInviteButton" aria-label="Скопировать номер"><i data-lucide="copy"></i></button>
        </div>
      </header>
      <div class="search-box">
        <label aria-label="Поиск">
          <i data-lucide="search"></i>
          <input id="searchInput" value="${escapeAttribute(searchTerm)}" placeholder="Поиск" />
        </label>
      </div>
      <nav class="tabs" aria-label="Разделы">
        <button class="tab-button ${activeTab === "chats" ? "active" : ""}" data-tab="chats" aria-label="Чаты"><i data-lucide="message-circle"></i></button>
        <button class="tab-button ${activeTab === "users" ? "active" : ""}" data-tab="users" aria-label="Пользователи"><i data-lucide="users"></i></button>
        <button class="tab-button ${activeTab === "profile" ? "active" : ""}" data-tab="profile" aria-label="Аккаунт"><i data-lucide="badge"></i></button>
      </nav>
      ${activeTab === "users" ? renderUsersList() : activeTab === "profile" ? renderAccountTab() : renderChatList()}
      <footer class="side-foot">
        <div class="invite-code">
          <span>${escapeHtml(inviteCode(state.account.handle))}</span>
          <button class="mini-action" id="copyCodeButton" aria-label="Скопировать код"><i data-lucide="clipboard"></i></button>
        </div>
        <span>Связь по NoSIM номеру</span>
      </footer>
    </aside>
  `;
}

function renderChatList() {
  const chats = state.chats.filter((chat) => {
    const q = searchTerm.trim().toLowerCase();
    return !q || `${chat.name} ${chat.handle}`.toLowerCase().includes(q);
  });

  if (!chats.length) {
    return renderPanelEmpty("Чатов нет", "Создай группу или открой пользователя из каталога.");
  }

  return `
    <section class="chat-list">
      ${chats
        .map((chat) => {
          const last = chat.messages.at(-1);
          return `
            <button class="chat-row ${chat.id === activeChatId ? "active" : ""}" data-chat-id="${chat.id}">
              ${avatarHtml(chat)}
              <span class="chat-copy">
                <span class="chat-top">
                  <span class="chat-name">${escapeHtml(chat.name)}</span>
                  <span class="chat-last">${escapeHtml(last?.at || "")}</span>
                </span>
                <span class="chat-last">${escapeHtml(last?.text || chat.status)}</span>
              </span>
              <span class="meta">${chat.type === "group" ? `<i data-lucide="users-round"></i>` : ""}</span>
            </button>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderUsersList() {
  const users = state.directory
    .filter((user) => user.id !== state.account.id)
    .filter((user) => {
      const q = searchTerm.trim().toLowerCase();
      return !q || `${user.name} ${user.handle}`.toLowerCase().includes(q);
    });

  if (!users.length) {
    return renderPanelEmpty("Пользователей нет", "Зарегистрированные пользователи появятся здесь.");
  }

  return `
    <section class="chat-list">
      ${users
        .map(
          (user) => `
          <button class="chat-row user-row" data-user-id="${user.id}">
            ${avatarHtml(user)}
            <span class="chat-copy">
              <span class="chat-top">
                <span class="chat-name">${escapeHtml(user.name)}</span>
              </span>
              <span class="chat-last">${escapeHtml(user.handle)}</span>
            </span>
            <span class="meta"><i data-lucide="message-circle"></i></span>
          </button>
        `
        )
        .join("")}
    </section>
  `;
}

function renderAccountTab() {
  return `
    <section class="details-body">
      <div class="profile-summary">
        ${avatarHtml(state.account, "large")}
        <div class="detail-title">${escapeHtml(state.account.name)}</div>
        <div class="detail-subtitle">${escapeHtml(state.account.handle)}</div>
      </div>
      <div class="info-list">
        <div class="info-item">
          <span class="info-label">Номер</span>
          <span class="info-value">${escapeHtml(inviteCode(state.account.handle))}</span>
        </div>
        <div class="info-item">
          <span class="info-label">SIM</span>
          <span class="info-value">не используется</span>
        </div>
        <div class="info-item">
          <span class="info-label">Пользователей</span>
          <span class="info-value">${state.directory.length}</span>
        </div>
      </div>
      <button class="primary-button" id="editProfileInline">Изменить</button>
    </section>
  `;
}

function renderChatPane(chat) {
  const messages = chat.messages.length
    ? chat.messages.map((message) => renderMessage(message)).join("")
    : `<div class="day-divider">Сообщений пока нет</div>`;

  return `
    <section class="chat-pane">
      <header class="chat-head">
        <button class="back-button" id="backButton" aria-label="Назад"><i data-lucide="arrow-left"></i></button>
        <button class="chat-identity" id="chatInfoButton" aria-label="Открыть чат">
          ${avatarHtml(chat)}
          <span class="chat-title-text">
            <span class="chat-name">${escapeHtml(chat.name)}</span>
            <span class="chat-status">${escapeHtml(chat.status)} · ${escapeHtml(chat.handle)}</span>
          </span>
        </button>
        <div class="chat-actions">
          <button class="chat-tool" data-action="audio" aria-label="Аудиозвонок"><i data-lucide="phone"></i></button>
          <button class="chat-tool" data-action="video" aria-label="Видеозвонок"><i data-lucide="video"></i></button>
          <button class="chat-tool" data-action="more" aria-label="Ещё"><i data-lucide="ellipsis-vertical"></i></button>
        </div>
      </header>
      <div class="messages" id="messages">
        <div class="day-divider">Сегодня</div>
        ${messages}
      </div>
      <form class="composer" id="composer">
        <button class="chat-tool" type="button" data-action="emoji" aria-label="Эмодзи"><i data-lucide="smile"></i></button>
        <button class="chat-tool" type="button" data-action="voice" aria-label="Голосовое сообщение"><i data-lucide="mic"></i></button>
        <button class="chat-tool attach" type="button" data-action="attach" aria-label="Вложение"><i data-lucide="paperclip"></i></button>
        <textarea id="messageInput" rows="1" maxlength="1000" placeholder="Сообщение"></textarea>
        <button class="send-button" aria-label="Отправить"><i data-lucide="send"></i></button>
      </form>
    </section>
  `;
}

function renderMessage(message) {
  return `
    <article class="message ${message.from === "me" ? "mine" : "theirs"}">
      ${message.author ? `<span class="message-author">${escapeHtml(message.author)}</span>` : ""}
      <p>${escapeHtml(message.text)}</p>
      <span class="message-meta">${escapeHtml(message.at)} ${message.from === "me" ? "✓✓" : ""}</span>
    </article>
  `;
}

function renderDetails(chat) {
  const memberCount = chat.memberIds?.length || 2;
  return `
    <aside class="details-panel">
      <header class="details-head">
        <strong>${chat.type === "group" ? "Группа" : "Контакт"}</strong>
        <button class="icon-button" id="closeDetails" aria-label="Закрыть"><i data-lucide="panel-right-close"></i></button>
      </header>
      <section class="details-body">
        <div class="profile-summary">
          ${avatarHtml(chat, "large")}
          <div class="detail-title">${escapeHtml(chat.name)}</div>
          <div class="detail-subtitle">${escapeHtml(chat.handle)}</div>
        </div>
        <div class="detail-actions">
          <button class="detail-action" data-action="audio"><i data-lucide="phone"></i><span>Аудио</span></button>
          <button class="detail-action" data-action="video"><i data-lucide="video"></i><span>Видео</span></button>
          <button class="detail-action" data-action="mute"><i data-lucide="bell-off"></i><span>Тихо</span></button>
        </div>
        <div class="info-list">
          <div class="info-item">
            <span class="info-label">Статус</span>
            <span class="info-value">${escapeHtml(chat.status)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Номер</span>
            <span class="info-value">${escapeHtml(chat.handle)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Участников</span>
            <span class="info-value">${memberCount}</span>
          </div>
        </div>
      </section>
    </aside>
  `;
}

function renderEmptyState(title, text) {
  return `
    <section class="empty-state">
      <div>
        <i data-lucide="messages-square"></i>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(text)}</p>
      </div>
    </section>
  `;
}

function renderPanelEmpty(title, text) {
  return `
    <section class="panel-empty">
      <i data-lucide="inbox"></i>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
    </section>
  `;
}

function bindMessengerEvents() {
  document.querySelector("#newUserButton")?.addEventListener("click", openUserDialog);
  document.querySelector("#newGroupButton")?.addEventListener("click", openGroupDialog);
  document.querySelector("#profileButton")?.addEventListener("click", openProfileDialog);
  document.querySelector("#copyInviteButton")?.addEventListener("click", copyMyId);
  document.querySelector("#copyCodeButton")?.addEventListener("click", copyInvite);
  document.querySelector("#editProfileInline")?.addEventListener("click", openProfileDialog);
  document.querySelector("#backButton")?.addEventListener("click", () => {
    activeChatId = null;
    render();
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      render();
    });
  });

  document.querySelectorAll(".chat-row[data-chat-id]").forEach((row) => {
    row.addEventListener("click", () => {
      activeChatId = row.dataset.chatId;
      render();
      scrollMessages();
    });
  });

  document.querySelectorAll(".user-row[data-user-id]").forEach((row) => {
    row.addEventListener("click", () => openDirectChat(row.dataset.userId));
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });

  const searchInput = document.querySelector("#searchInput");
  searchInput?.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    render();
    document.querySelector("#searchInput")?.focus();
  });

  const composer = document.querySelector("#composer");
  const messageInput = document.querySelector("#messageInput");
  composer?.addEventListener("submit", sendMessage);
  messageInput?.addEventListener("input", autosizeTextarea);
  messageInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });

  scrollMessages();
}

function getActiveChat() {
  return state.chats.find((chat) => chat.id === activeChatId);
}

function openDirectChat(userId) {
  const user = state.directory.find((item) => item.id === userId);
  if (!user) return;
  let chat = state.chats.find((item) => item.type === "direct" && item.memberIds?.includes(userId));

  if (!chat) {
    chat = {
      id: `chat-${user.id}-${Date.now()}`,
      type: "direct",
      name: user.name,
      handle: user.handle,
      status: user.status,
      color: user.color,
      memberIds: [state.account.id, user.id],
      messages: []
    };
    state.chats.unshift(chat);
    saveState();
  }

  activeTab = "chats";
  activeChatId = chat.id;
  render();
}

function sendMessage(event) {
  event.preventDefault();
  const input = document.querySelector("#messageInput");
  const text = input.value.trim();
  const chat = getActiveChat();
  if (!text || !chat) return;

  chat.messages.push({ from: "me", text, at: nowTime() });
  input.value = "";
  autosizeTextarea({ target: input });
  saveState();
  render();
}

function autosizeTextarea(event) {
  const input = event.target;
  input.style.height = "44px";
  input.style.height = `${Math.min(input.scrollHeight, 124)}px`;
}

function handleAction(action) {
  const chat = getActiveChat();
  const name = chat?.name || "чат";
  const messages = {
    audio: `Аудиозвонок: ${name}`,
    video: `Видеозвонок: ${name}`,
    attach: "Вложение добавлено",
    voice: "Голосовое сообщение добавлено",
    emoji: "Эмодзи доступны в клавиатуре телефона",
    more: "Меню чата",
    mute: "Уведомления приглушены"
  };

  if ((action === "attach" || action === "voice") && chat) {
    chat.messages.push({ from: "me", text: action === "voice" ? "Голосовое сообщение" : "Вложение", at: nowTime() });
    saveState();
    render();
    return;
  }

  showToast(messages[action] || "Готово");
}

function openUserDialog() {
  userForm.reset();
  userDialog.showModal();
  iconRefresh();
}

function openGroupDialog() {
  const users = state.directory.filter((user) => user.id !== state.account.id);
  groupForm.reset();
  groupUserList.innerHTML = users.length
    ? users
        .map(
          (user) => `
          <label class="check-row">
            <input type="checkbox" name="members" value="${escapeAttribute(user.id)}" />
            ${avatarHtml(user, "small")}
            <span>
              <strong>${escapeHtml(user.name)}</strong>
              <small>${escapeHtml(user.handle)}</small>
            </span>
          </label>
        `
        )
        .join("")
    : `<p class="dialog-note">Пока нет зарегистрированных пользователей.</p>`;
  groupDialog.showModal();
  iconRefresh();
}

function openProfileDialog() {
  profileForm.elements.name.value = state.account.name;
  profileForm.elements.handle.value = state.account.handle;
  profileDialog.showModal();
  iconRefresh();
}

userForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(userForm);
  const user = createUserRecord(data.get("name"), data.get("handle"));

  if (state.directory.some((item) => item.handle === user.handle)) {
    showToast("Такой номер уже зарегистрирован");
    return;
  }

  state.directory.push(user);
  activeTab = "users";
  saveState();
  userDialog.close();
  render();
});

groupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(groupForm);
  const memberIds = data.getAll("members");
  const name = String(data.get("name") || "").trim();

  if (!name) {
    showToast("Нужно имя группы");
    return;
  }

  if (!memberIds.length) {
    showToast("Выбери участников");
    return;
  }

  const chat = {
    id: `group-${Date.now()}`,
    type: "group",
    name,
    handle: groupHandleFromName(name),
    status: `${memberIds.length + 1} участников`,
    color: palette[state.chats.length % palette.length],
    memberIds: [state.account.id, ...memberIds],
    messages: []
  };

  state.chats.unshift(chat);
  activeTab = "chats";
  activeChatId = chat.id;
  saveState();
  groupDialog.close();
  render();
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(profileForm);
  const updated = createUserRecord(data.get("name"), data.get("handle"), 4);
  const previousId = state.account.id;
  const previousHandle = state.account.handle;

  if (state.directory.some((user) => user.handle === updated.handle && user.id !== previousId)) {
    showToast("Такой номер уже зарегистрирован");
    return;
  }

  state.account = { ...state.account, ...updated };

  state.chats.forEach((chat) => {
    chat.memberIds = chat.memberIds?.map((id) => (id === previousId ? state.account.id : id));
  });
  state.directory = state.directory.filter((user) => user.id !== previousId && user.handle !== previousHandle);
  upsertDirectoryUser(state.account);
  saveState();
  profileDialog.close();
  render();
});

function copyMyId() {
  copyText(state.account.handle, "Номер скопирован");
}

function copyInvite() {
  copyText(inviteCode(state.account.handle), "Код скопирован");
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch (error) {
    showToast(text);
  }
}

function avatarHtml(person, size = "") {
  const style = `--avatar-bg:${escapeAttribute(person.color || palette[0])}`;
  return `<span class="avatar ${size}" style="${style}">${escapeHtml(initials(person.name || person.handle))}</span>`;
}

function scrollMessages() {
  const messages = document.querySelector("#messages");
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

window.addEventListener("resize", render);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

render();
