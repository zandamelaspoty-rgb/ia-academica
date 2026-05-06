import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { PDFParse } = require("pdf-parse");
import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Apenas arquivos PDF são permitidos."));
    }
    cb(null, true);
  }
});

const SYSTEM_PROMPT = `
Você é a Cyber AI da LM TECH 93.

Você ensina cibersegurança de forma educativa, ética, defensiva e profissional.

Áreas que pode ensinar:
1. Fundamentos de Cibersegurança
2. Segurança de contas e senhas
3. Proteção contra phishing e golpes online
4. Segurança de Wi-Fi e redes
5. Segurança em Android, Windows e dispositivos
6. Privacidade digital
7. Carreira em Cibersegurança
8. Boas práticas para estudantes, famílias e pequenos negócios
9. Pentest Ético com Kali Linux em laboratório seguro

REGRAS OBRIGATÓRIAS:
- Ensine apenas defesa, prevenção, proteção e aprendizagem ética.
- Nunca ensine invasão, roubo de contas, clonagem, malware, spyware, keylogger, phishing real, bypass, DDoS ou acesso não autorizado.
- Se o usuário pedir algo perigoso, recuse de forma educada e ofereça uma alternativa segura.
- Explique em português simples.
- Use passo a passo quando for assunto defensivo.
- Use exemplos seguros.
- No final das aulas, sugira o próximo tópico.

PENTEST ÉTICO:
- Ensine Kali Linux apenas em ambientes controlados
- Use laboratórios locais
- Use VMs e máquinas de treino
- Ensine apenas para aprendizagem defensiva
- Nunca ensine ataques reais contra terceiros
- Nunca ensine invasão ilegal
- Explique ferramentas apenas de forma educativa

Quando o usuário pedir para aprender Cibersegurança:
- Ensine como curso.
- Divida em módulos.
- Dê explicação simples.
- Dê exercício seguro.
- Termine com:
"✅ Aula concluída. Digite CONTINUAR para próxima aula."

Exemplos permitidos:
- Instalar Kali Linux em VM
- Criar laboratório local
- Scan defensivo em ambiente próprio
- Reconhecimento básico
- Segurança de redes locais
- Hardening
- Identificação de vulnerabilidades

Ferramentas permitidas para aprendizagem:
- Kali Linux
- VirtualBox
- VMware
- OWASP Juice Shop
- DVWA
- Metasploitable
- Wireshark
- Nmap apenas para laboratório próprio

Se o usuário pedir algo ilegal, responda:
"Não posso ajudar com invasão, roubo de dados, clonagem ou acesso não autorizado. Posso te ensinar a se proteger contra esse tipo de ameaça de forma ética e segura."

Assinatura curta quando fizer sentido:
"🛡️ Cyber AI • LM TECH 93"
`;

async function getUserFromToken(accessToken) {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}

async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data;
}

async function getTodayUsage(userId) {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("usage_logs")
    .select("message_count")
    .eq("user_id", userId)
    .eq("used_on", today);

  if (error || !data) return 0;

  return data.reduce((sum, row) => sum + row.message_count, 0);
}

function isAdmin(user) {
  return user?.email === process.env.ADMIN_EMAIL;
}

async function ensureAdminFromRequest(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    res.status(401).json({ error: "Sem sessão." });
    return null;
  }

  const user = await getUserFromToken(token);

  if (!user) {
    res.status(401).json({ error: "Sessão inválida." });
    return null;
  }

  if (!isAdmin(user)) {
    res.status(403).json({ error: "Acesso negado." });
    return null;
  }

  return user;
}

async function addUsage(userId) {
  const { error } = await supabaseAdmin
    .from("usage_logs")
    .insert([{ user_id: userId, message_count: 1 }]);

  if (error) {
    console.error("Erro ao gravar uso:", error.message);
  }
}

app.post("/api/chat", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const { message } = req.body;

    if (!token) {
      return res.status(401).json({ error: "Precisas entrar primeiro." });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const profile = await getProfile(user.id);
    if (!profile) {
      return res.status(404).json({ error: "Perfil não encontrado." });
    }

    const cleanMessage = String(message || "").trim();

    if (!cleanMessage) {
      return res.status(400).json({ error: "Escreve uma pergunta primeiro." });
    }

    if (cleanMessage.length > 500) {
      return res.status(400).json({
        error: "Pergunta muito longa. Máximo 500 caracteres."
      });
    }

    const usageToday = await getTodayUsage(user.id);

    const isPremium =
      profile.plan === "premium" &&
      (!profile.premium_expires_at ||
        new Date(profile.premium_expires_at) > new Date());

    const dailyLimit = isPremium ? 15 : profile.daily_limit || 3;

    if (usageToday >= dailyLimit) {
      return res.status(403).json({
        error: isPremium
          ? "🔒 Atingiste o limite Cyber Premium do dia."
          : "🔒 Limite grátis atingido. Ativa o Cyber Premium para continuar."
      });
    }

const lowerMessage = cleanMessage.toLowerCase();

const blockedFreeModules =
  lowerMessage.includes("módulo 2") ||
  lowerMessage.includes("modulo 2") ||
  lowerMessage.includes("módulo 3") ||
  lowerMessage.includes("modulo 3") ||
  lowerMessage.includes("módulo 4") ||
  lowerMessage.includes("modulo 4") ||
  lowerMessage.includes("módulo 5") ||
  lowerMessage.includes("modulo 5") ||
  lowerMessage.includes("módulo 6") ||
  lowerMessage.includes("modulo 6") ||
  lowerMessage.includes("modulo 7") ||
  lowerMessage.includes("modulo 7") ||
  lowerMessage.includes("modulo 8") ||
  lowerMessage.includes("modulo 8") ||
  lowerMessage.includes("modulo 9") ||
  lowerMessage.includes("modulo 9") ||
 lowerMessage.includes("modulo 10") ||
 lowerMessage.includes("modulo 10") ||
  lowerMessage.includes("certificado");

if (!isPremium && blockedFreeModules) {
  return res.status(403).json({
    error: "🔒 Este conteúdo faz parte do Cyber Premium. Ative para desbloquear todos os módulos e certificado."
  });
}

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: cleanMessage }
      ],
      max_output_tokens: isPremium ? 900 : 500
    });

    await addUsage(user.id);

    return res.json({
      reply:
        response.output_text ||
        "🛡️ Cyber AI sem resposta no momento.",
      plan: isPremium ? "premium" : "free",
      usage_today: usageToday + 1,
      daily_limit: dailyLimit
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Erro interno da Cyber AI."
    });
  }
});

app.get("/api/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) return res.status(401).json({ error: "Sem sessão." });

    const user = await getUserFromToken(token);
    if (!user) return res.status(401).json({ error: "Sessão inválida." });

    const profile = await getProfile(user.id);
    if (!profile) {
      return res.status(404).json({ error: "Perfil não encontrado." });
    }

    const usageToday = await getTodayUsage(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: profile.full_name,
        phone: profile.phone,
        plan: profile.plan,
        premium_expires_at: profile.premium_expires_at,
        daily_limit: profile.daily_limit,
        usage_today: usageToday
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Erro interno." });
  }
});

app.get("/api/admin/users", async (req, res) => {
  try {
    const adminUser = await ensureAdminFromRequest(req, res);
    if (!adminUser) return;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, plan, daily_limit, premium_expires_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ users: data });
  } catch (error) {
    res.status(500).json({ error: "Erro interno." });
  }
});

app.post("/api/admin/set-premium", async (req, res) => {
  try {
    const adminUser = await ensureAdminFromRequest(req, res);
    if (!adminUser) return;

    const { user_id, days = 30 } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id é obrigatório." });
    }

    const expires = new Date();
    expires.setDate(expires.getDate() + Number(days));

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        plan: "premium",
        daily_limit: 15,
        premium_expires_at: expires.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", user_id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      premium_expires_at: expires.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: "Erro interno." });
  }
});

app.post("/api/admin/renew-premium", async (req, res) => {
  try {
    const adminUser = await ensureAdminFromRequest(req, res);
    if (!adminUser) return;

    const { user_id, days = 30 } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id é obrigatório." });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("premium_expires_at")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const baseDate =
      profile.premium_expires_at &&
      new Date(profile.premium_expires_at) > new Date()
        ? new Date(profile.premium_expires_at)
        : new Date();

    baseDate.setDate(baseDate.getDate() + Number(days));

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        plan: "premium",
        daily_limit: 15,
        premium_expires_at: baseDate.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", user_id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      premium_expires_at: baseDate.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: "Erro interno." });
  }
});

app.post("/api/admin/remove-premium", async (req, res) => {
  try {
    const adminUser = await ensureAdminFromRequest(req, res);
    if (!adminUser) return;

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id é obrigatório." });
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        plan: "free",
        daily_limit: 3,
        premium_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", user_id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erro interno." });
  }
});

app.post("/api/pdf-summary", upload.single("pdf"), async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return res.status(401).json({ error: "Precisas entrar primeiro." });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const profile = await getProfile(user.id);
    if (!profile) {
      return res.status(404).json({ error: "Perfil não encontrado." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum PDF enviado." });
    }

    const isPremium =
      profile.plan === "premium" &&
      (!profile.premium_expires_at ||
        new Date(profile.premium_expires_at) > new Date());

    if (!isPremium) {
      return res.status(403).json({
        error: "📄 Análise de PDF disponível apenas para Cyber Premium."
      });
    }

    const usageToday = await getTodayUsage(user.id);
    const dailyLimit = isPremium ? 15 : profile.daily_limit || 3;

    if (usageToday >= dailyLimit) {
      return res.status(403).json({
        error: "🔒 Limite diário atingido. Ativa ou renova o Cyber Premium."
      });
    }

    const parser = new PDFParse({ data: req.file.buffer });
    const pdfData = await parser.getText();
    await parser.destroy();

    const extractedText = String(pdfData.text || "").trim();

    if (!extractedText) {
      return res.status(400).json({
        error: "Não foi possível extrair texto deste PDF."
      });
    }

    const trimmedText = extractedText.slice(0, 12000);

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: `
Você é a Cyber AI da LM TECH 93.

Analise materiais PDF ligados a tecnologia, estudo, redes, segurança digital ou cibersegurança.

Entregue sempre:
1. Resumo geral
2. Pontos principais
3. Conceitos importantes
4. Possíveis riscos ou boas práticas, se o conteúdo tiver relação com segurança digital
5. Perguntas para estudo
6. Conclusão simples

Use linguagem clara, profissional e educativa.
Não ensine ataques ilegais, invasão, roubo, malware ou clonagem.
          `
        },
        {
          role: "user",
          content: `Analise este material PDF:\n\n${trimmedText}`
        }
      ],
      max_output_tokens: 900
    });

    await addUsage(user.id);

    return res.json({
      reply:
        response.output_text ||
        "Não consegui analisar o material PDF agora."
    });
  } catch (error) {
    console.error("Erro na análise de PDF:", error);
    return res.status(500).json({
      error: error.message || "Erro ao processar PDF."
    });
  }
});

app.post("/api/save-lead", async (req, res) => {
  try {
    const { phone, nome, tipo_negocio, objetivo } = req.body;

    const { error } = await supabaseAdmin
      .from("bot_clients")
      .upsert(
        {
          phone,
          name: nome,
          tipo_negocio,
          objetivo,
          status: "lead",
          last_message: objetivo,
          source: "manychat",
          updated_at: new Date().toISOString()
        },
        { onConflict: "phone" }
      );

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao salvar lead:", err);
    res.status(500).json({ error: "Erro ao salvar lead" });
  }
});

app.post("/api/ia-vendedora", async (req, res) => {
  try {
    res.json({
      success: true,
      reply: "🛡️ Cyber AI funcionando 🔥"
    });
  } catch (err) {
    console.error("Erro IA:", err);
    res.json({
      success: false,
      reply: "Erro na Cyber AI."
    });
  }
});

app.post("/api/generate-certificate", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return res.status(401).json({ error: "Precisas entrar primeiro." });
    }

    const user = await getUserFromToken(token);

    if (!user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const profile = await getProfile(user.id);

    if (!profile) {
      return res.status(404).json({ error: "Perfil não encontrado." });
    }

    const isPremium =
      profile.plan === "premium" &&
      (!profile.premium_expires_at ||
        new Date(profile.premium_expires_at) > new Date());

    if (!isPremium) {
      return res.status(403).json({
        error: "🔒 Certificado disponível apenas para Cyber Premium."
      });
    }

    const { progress, student_name } = req.body;

    if (Number(progress) < 100) {
      return res.status(403).json({
        error: "Conclua 100% do curso para gerar o certificado."
      });
    }

    return res.json({
      success: true,
      student_name,
      course: "Curso de Cibersegurança com IA",
      issued_at: new Date().toISOString()
    });

  } catch (error) {
    console.error("Erro certificado:", error);
    return res.status(500).json({ error: "Erro ao gerar certificado." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`🛡️ Cyber AI LM TECH 93 online em http://localhost:${port}`)
);