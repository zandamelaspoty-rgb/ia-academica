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

const SYSTEM_PROMPT = `
Você é o Assistente Acadêmico do LM TECH 93.
Ajude com temas, estrutura, resumos, revisão e apoio ético.
Não escreva trabalhos completos prontos para submissão.
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
      return res.status(400).json({ error: "Pergunta muito longa. Máximo 500 caracteres." });
    }

    const usageToday = await getTodayUsage(user.id);

    const isPremium =
      profile.plan === "premium" &&
      (!profile.premium_expires_at || new Date(profile.premium_expires_at) > new Date());

    const dailyLimit = isPremium ? 15 : profile.daily_limit || 3;

    if (usageToday >= dailyLimit) {
      return res.status(403).json({
        error: isPremium
          ? "Atingiste o limite premium do dia."
          : "Limite grátis atingido. Ativa o premium."
      });
    }

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: cleanMessage }
      ],
      max_output_tokens: 500
    });

    await addUsage(user.id);

    return res.json({
      reply: response.output_text || "Sem resposta no momento.",
      plan: isPremium ? "premium" : "free",
      usage_today: usageToday + 1,
      daily_limit: dailyLimit
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro interno." });
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
    if (!profile) return res.status(404).json({ error: "Perfil não encontrado." });

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
      profile.premium_expires_at && new Date(profile.premium_expires_at) > new Date()
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor em http://localhost:${port}`));