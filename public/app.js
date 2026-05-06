document.addEventListener("DOMContentLoaded", () => {
  const chatForm = document.getElementById("chatForm");
  const userInput = document.getElementById("userInput");
  const chatBox = document.getElementById("chatBox");
  const submitButton = chatForm?.querySelector('button[type="submit"]');
  const statusBox = document.getElementById("lmUserStatus");
  const logoutBtn = document.getElementById("logoutBtn");
  const pdfInput = document.getElementById("pdfInput");
  const pdfSummaryBtn = document.getElementById("pdfSummaryBtn");

  function addMessage(text, type) {
    if (!chatBox) return;

    const msg = document.createElement("div");
    msg.className = `lm-msg ${type === "user" ? "lm-msg-user" : "lm-msg-ai"}`;

    if (type === "ai") {
      msg.innerHTML = "🛡️ <strong>Cyber AI:</strong><br><br>" + text;
    } else {
      msg.textContent = text;
    }

    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function setLoading() {
    if (!chatBox) return;

    const loading = document.createElement("div");
    loading.className = "lm-msg lm-msg-ai";
    loading.id = "lm-loading";
    loading.textContent = "🛡️ Cyber AI a analisar...";
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

  function lockChat(limitMessage = "🔒 Limite gratuito atingido. Ativa o Cyber Premium para continuar a aprender Cibersegurança.") {
    if (userInput) {
      userInput.disabled = true;
      userInput.placeholder = "🔒 Limite diário atingido. Ativa o Cyber Premium.";
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "🔒 Limite atingido";
    }

    if (chatForm && !document.getElementById("lm-upgrade-box")) {
      const box = document.createElement("div");
      box.id = "lm-upgrade-box";
      box.className = "lm-upgrade-box";
      box.innerHTML = `
        <div class="lm-upgrade-title">⚠️ ${limitMessage}</div>
        <a href="https://wa.me/258861532479?text=Ol%C3%A1%2C%20quero%20ativar%20o%20Cyber%20Premium%20da%20Cyber%20AI%20LM%20TECH%2093." target="_blank" class="lm-upgrade-link">
          🛡️ Ativar Cyber Premium
        </a>
      `;
      chatForm.appendChild(box);
    }
  }

  function unlockChat() {
    if (userInput) {
      userInput.disabled = false;
      userInput.placeholder = "Pergunte sobre redes, phishing, segurança digital ou Cibersegurança...";
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
    const premiumTopBtn = document.getElementById("premiumTopBtn");
    const premiumBanner = document.querySelector(".lm-premium-banner");

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

      if (premiumTopBtn) {
        premiumTopBtn.style.display = isPremium ? "none" : "inline-flex";
      }

      if (premiumBanner) {
        premiumBanner.style.display = isPremium ? "none" : "flex";
      }

      const limit = isPremium ? 15 : u.daily_limit;
      const used = u.usage_today || 0;
      const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

      statusBox.textContent = isPremium
        ? "🟢 Cyber Premium ativo."
        : "🛡️ Modo básico ativo.";

      if (planBadge) {
        planBadge.textContent = isPremium ? "CYBER PREMIUM" : "FREE";
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
          usageAlert.textContent = "🔒 Limite atingido";
          usageAlert.classList.add("danger");
        } else if (percent >= 80) {
          usageAlert.textContent = "⚠️ Perto do limite";
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
        lockChat("🔒 Limite diário atingido. Ativa o Cyber Premium para continuar a aprender Cibersegurança.");
      } else {
        unlockChat();
      }
    } catch (error) {
      console.error("Erro ao carregar status:", error);
      statusBox.textContent = "❌ Erro ao carregar conta Cyber AI.";
    }
  }

  async function handlePdfSummary() {
    const token = getToken();

    if (!token) {
      window.location.href = "/login.html";
      return;
    }

    if (!pdfInput || !pdfInput.files || !pdfInput.files[0]) {
      addMessage("📄 Selecione um material PDF primeiro.", "ai");
      return;
    }

    const file = pdfInput.files[0];
    const formData = new FormData();
    formData.append("pdf", file);

    if (pdfSummaryBtn) {
      pdfSummaryBtn.disabled = true;
      pdfSummaryBtn.textContent = "🛡️ A analisar material...";
    }

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
        addMessage(data.error || "❌ Erro ao analisar o material PDF.", "ai");

        if (pdfSummaryBtn) {
          pdfSummaryBtn.disabled = false;
          pdfSummaryBtn.textContent = "Analisar Material";
        }

        return;
      }

      addMessage("🛡️ Análise do material:", "ai");
      addMessage(data.reply || "Sem análise disponível.", "ai");

      pdfInput.value = "";

      if (pdfSummaryBtn) {
        pdfSummaryBtn.disabled = false;
        pdfSummaryBtn.textContent = "Analisar Material";
      }

      await loadUserStatus();
    } catch (error) {
      console.error("Erro ao enviar PDF:", error);
      removeLoading();
      addMessage("❌ Erro ao enviar material PDF.", "ai");

      if (pdfSummaryBtn) {
        pdfSummaryBtn.disabled = false;
        pdfSummaryBtn.textContent = "Analisar Material";
      }
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
          const errorText = data.error || "❌ Erro ao comunicar com a Cyber AI.";
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

        addMessage(data.reply || "🛡️ Cyber AI sem resposta no momento.", "ai");
        await loadUserStatus();

      } catch (error) {
        console.error("Erro no envio:", error);
        removeLoading();
        addMessage("❌ Erro de ligação com o servidor da Cyber AI.", "ai");
      }
    });
  }

  if (pdfSummaryBtn) {
    pdfSummaryBtn.addEventListener("click", handlePdfSummary);
  }

 async function gerarCertificadoCyber() {
  const token = localStorage.getItem("lm_access_token");

  if (!token) {
    alert("Precisas entrar primeiro.");
    window.location.href = "/login.html";
    return;
  }

  const nome = prompt("Digite teu nome completo:");

  if (!nome) {
    alert("Digite o nome para o certificado.");
    return;
  }

  const progress = Number(localStorage.getItem("cyber_progress") || 0);

  const response = await fetch("/api/generate-certificate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      student_name: nome,
      progress
    })
  });

  const data = await response.json();

  if (!response.ok) {
    alert(data.error || "Não foi possível gerar certificado.");
    return;
  }

  alert("🎓 Certificado liberado com sucesso!");
}

window.gerarCertificadoCyber = gerarCertificadoCyber;

function atualizarCertificado() {
  const progress = Number(localStorage.getItem("cyber_progress") || 0);
  const area = document.getElementById("certificateArea");

  if (!area) return;

  area.style.display = progress >= 100 ? "block" : "none";
}

atualizarCertificado();
loadUserStatus();
});