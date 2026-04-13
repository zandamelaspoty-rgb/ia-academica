document.addEventListener("DOMContentLoaded", () => {

const pdfInput = document.getElementById("pdfInput");
const pdfSummaryBtn = document.getElementById("pdfSummaryBtn");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatBox = document.getElementById("chatBox");
const submitButton = chatForm?.querySelector('button[type="submit"]');
const statusBox = document.getElementById("lmUserStatus");
const logoutBtn = document.getElementById("logoutBtn");

function addMessage(text, type) {
  if (!chatBox) return;
  const msg = document.createElement("div");
  msg.className = `lm-msg ${type === "user" ? "lm-msg-user" : "lm-msg-ai"}`;
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function setLoading() {
  if (!chatBox) return;
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

function getToken() {
  return localStorage.getItem("lm_access_token");
}

function clearSession() {
  localStorage.removeItem("lm_access_token");
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

  if (chatForm && !document.getElementById("lm-upgrade-box")) {
    const box = document.createElement("div");
    box.id = "lm-upgrade-box";
    box.className = "lm-upgrade-box";
    box.innerHTML = `
      <div class="lm-upgrade-title">
        ⚠️ ${limitMessage}<br>
        Desbloqueia o Premium para continuar a usar a IA com mais liberdade.
      </div>
      <a
        href="https://wa.me/258861532479?text=Ol%C3%A1%2C%20quero%20ativar%20o%20plano%20Premium%20da%20IA%20Acad%C3%AAmica%20LM%20TECH%2093.%20Quero%20mais%20perguntas%20por%20dia%20e%20acesso%20avan%C3%A7ado."
        target="_blank"
        class="lm-upgrade-link"
      >
        💬 Ativar Premium no WhatsApp
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

async function loadUserStatus() {
  const token = getToken();

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  if (!statusBox) return;

  const planBadge = document.getElementById("lmPlanBadge");
  const usageText = document.getElementById("lmUsageText");
  const usageAlert = document.getElementById("lmUsageAlert");
  const usageBarFill = document.getElementById("lmUsageBarFill");

  try {
    const response = await fetch("/api/me", {
      headers: {
        Authorization: `Bearer ${token}`
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
    const isPremium = u.plan === "premium";

const offerBox = document.querySelector(".lm-offer-box");
if (offerBox) {
  offerBox.style.display = isPremium ? "none" : "flex";
}

const plansCompare = document.querySelector(".lm-plans-compare");
if (plansCompare) {
  plansCompare.style.display = isPremium ? "none" : "grid";
}

const socialProof = document.querySelector(".lm-social-proof");
if (socialProof) {
  socialProof.style.display = isPremium ? "none" : "grid";
}

const premiumTopBtn = document.getElementById("premiumTopBtn");
if (premiumTopBtn) {
  premiumTopBtn.style.display = isPremium ? "none" : "inline-flex";
}

const premiumBanner = document.querySelector(".lm-premium-banner");
if (premiumBanner) {
  premiumBanner.style.display = isPremium ? "none" : "flex";
}
    const limit = isPremium ? 100 : u.daily_limit;
    const used = u.usage_today || 0;
    const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

    statusBox.textContent = isPremium
      ? "Conta premium ativa."
      : "Conta grátis ativa.";

    if (planBadge) {
      planBadge.textContent = isPremium ? "PREMIUM" : "FREE";
      planBadge.classList.remove("lm-plan-free", "lm-plan-premium");
      planBadge.classList.add(isPremium ? "lm-plan-premium" : "lm-plan-free");
    }

    if (usageText) {
      usageText.textContent = `Uso hoje: ${used}/${limit}`;
    }

    if (usageAlert) {
      usageAlert.textContent = "";
      usageAlert.classList.remove("warn", "danger");

      if (percent >= 100) {
        usageAlert.textContent = "Limite atingido";
        usageAlert.classList.add("danger");
      } else if (percent >= 80) {
        usageAlert.textContent = "Perto do limite";
        usageAlert.classList.add("warn");
      }
    }

    if (usageBarFill) {
      usageBarFill.style.width = `${percent}%`;
      usageBarFill.classList.remove("warn", "danger");

      if (percent >= 100) {
        usageBarFill.classList.add("danger");
      } else if (percent >= 80) {
        usageBarFill.classList.add("warn");
      }
    }

    if (used >= limit) {
      lockChat("Limite diário atingido. Ativa o premium ou volta amanhã.");
    } else {
      unlockChat();
    }
  } catch (error) {
    console.error("Erro ao carregar status:", error);
    statusBox.textContent = "Erro ao carregar conta.";
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

    const message = userInput?.value.trim();
    if (!message || userInput?.disabled) return;

    addMessage(message, "user");
    userInput.value = "";
    setLoading();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
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
      console.error("Erro no envio:", error);
      removeLoading();
      addMessage("Erro de ligação com o servidor.", "ai");
    }
  });
}

loadUserStatus();

function startOfferCountdown() {
  const daysEl = document.getElementById("lmDays");
  const hoursEl = document.getElementById("lmHours");
  const minutesEl = document.getElementById("lmMinutes");
  const secondsEl = document.getElementById("lmSeconds");

  if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

  const target = new Date();
  target.setHours(23, 59, 59, 999);

  function updateCountdown() {
    const now = new Date();
    let diff = target - now;

    if (diff < 0) {
      target.setDate(target.getDate() + 1);
      diff = target - now;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    daysEl.textContent = String(days).padStart(2, "0");
    hoursEl.textContent = String(hours).padStart(2, "0");
    minutesEl.textContent = String(minutes).padStart(2, "0");
    secondsEl.textContent = String(seconds).padStart(2, "0");
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

startOfferCountdown();

});

async function handlePdfSummary() {
  const token = getToken();

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  if (!pdfInput || !pdfInput.files || !pdfInput.files[0]) {
    addMessage("Seleciona um PDF primeiro.", "ai");
    return;
  }

  const file = pdfInput.files[0];

  const formData = new FormData();
  formData.append("pdf", file);

  pdfSummaryBtn.disabled = true;
  pdfSummaryBtn.textContent = "A resumir PDF...";
  setLoading();

  try {
    const response = await fetch("/api/pdf-summary", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const data = await response.json();
    removeLoading();

    if (!response.ok) {
      addMessage(data.error || "Erro ao resumir PDF.", "ai");
      pdfSummaryBtn.disabled = false;
      pdfSummaryBtn.textContent = "Resumir PDF";
      return;
    }

    addMessage("Resumo do PDF:", "ai");
    addMessage(data.reply || "Sem resumo disponível.", "ai");

    pdfInput.value = "";
    pdfSummaryBtn.disabled = false;
    pdfSummaryBtn.textContent = "Resumir PDF";

    await loadUserStatus();
  } catch (error) {
    removeLoading();
    addMessage("Erro ao enviar PDF.", "ai");
    pdfSummaryBtn.disabled = false;
    pdfSummaryBtn.textContent = "Resumir PDF";
  }
}

if (pdfSummaryBtn) {
  pdfSummaryBtn.addEventListener("click", handlePdfSummary);
}