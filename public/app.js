const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatBox = document.getElementById("chatBox");
const submitButton = chatForm?.querySelector('button[type="submit"]');
const statusBox = document.getElementById("lmUserStatus");
const logoutBtn = document.getElementById("logoutBtn");

function addMessage(text, type) {
  const msg = document.createElement("div");
  msg.className = `lm-msg ${type === "user" ? "lm-msg-user" : "lm-msg-ai"}`;
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function setLoading() {
  const loading = document.createElement("div");
  loading.className = "lm-msg lm-msg-ai";
  loading.id = "lm-loading";
  loading.textContent = "A pensar...";
  chatBox.appendChild(loading);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function removeLoading() {
  const loading = document.getElementById("lm-loading");
  if (loading) loading.remove();
}

function lockChat(limitMessage = "Limite grátis atingido. Ativa o premium ou volta amanhã.") {
  if (userInput) {
    userInput.disabled = true;
    userInput.placeholder = "Limite diário atingido.";
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Limite atingido";
  }

  if (!document.getElementById("lm-upgrade-box")) {
    const box = document.createElement("div");
    box.id = "lm-upgrade-box";
    box.className = "lm-upgrade-box";
    box.innerHTML = `
      <div class="lm-upgrade-title">⚠️ ${limitMessage}</div>
      <a href="https://wa.me/258861532479" target="_blank" class="lm-upgrade-link">
        💬 Ativar Premium
      </a>
    `;
    chatForm.appendChild(box);
  }
}

function unlockChat() {
  if (userInput) {
    userInput.disabled = false;
    userInput.placeholder = "Escreve a tua dúvida acadêmica...";
  }

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Enviar";
  }

  const upgradeBox = document.getElementById("lm-upgrade-box");
  if (upgradeBox) upgradeBox.remove();
}

function getToken() {
  return localStorage.getItem("lm_access_token");
}

function clearSession() {
  localStorage.removeItem("lm_access_token");
}

async function loadUserStatus() {
  const token = getToken();

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  if (!statusBox) return;

  try {
    const response = await fetch("/api/me", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      clearSession();
      statusBox.textContent = "Sessão inválida. Entra novamente.";
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 800);
      return;
    }

    const u = data.user;
    const limit = u.plan === "premium" ? 100 : u.daily_limit;

    statusBox.textContent = `Plano: ${u.plan.toUpperCase()} | Uso hoje: ${u.usage_today}/${limit}`;

    if (u.usage_today >= limit) {
      lockChat("Limite diário atingido. Ativa o premium ou volta amanhã.");
    } else {
      unlockChat();
    }
  } catch {
    statusBox.textContent = "Não foi possível carregar tua conta.";
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearSession();
    window.location.href = "/login.html";
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const token = getToken();
    if (!token) {
      window.location.href = "/login.html";
      return;
    }

    const message = userInput.value.trim();
    if (!message || userInput.disabled) return;

    addMessage(message, "user");
    userInput.value = "";
    setLoading();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ message })
      });

      const data = await response.json();
      removeLoading();

      if (!response.ok) {
        const errorText = data.error || "Erro ao comunicar com a IA.";
        addMessage(errorText, "ai");

        if (response.status === 401) {
          clearSession();
          setTimeout(() => {
            window.location.href = "/login.html";
          }, 800);
          return;
        }

        if (response.status === 403 || /limite/i.test(errorText)) {
          lockChat(errorText);
        }

        await loadUserStatus();
        return;
      }

      addMessage(data.reply || "Sem resposta no momento.", "ai");
      await loadUserStatus();
    } catch (error) {
      removeLoading();
      addMessage("Erro de ligação com o servidor.", "ai");
    }
  });
}

loadUserStatus();