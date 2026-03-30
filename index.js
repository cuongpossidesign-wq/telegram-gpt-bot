const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURATION (loaded from environment variables)
// ──────────────────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN;
const GOOGLE_API_KEY  = process.env.GOOGLE_API_KEY; // Dùng cho Gemini
const WEBHOOK_URL     = process.env.WEBHOOK_URL;  
const PORT            = process.env.PORT || 8080;
const MODEL_NAME      = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const SYSTEM_PROMPT   = process.env.SYSTEM_PROMPT ||
  'Bạn là một trợ lý AI thông minh, thân thiện và hữu ích. Hãy trả lời bằng ngôn ngữ mà người dùng sử dụng.';

// ──────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ──────────────────────────────────────────────────────────────────────────────
if (!TELEGRAM_TOKEN || !GOOGLE_API_KEY) {
  console.error('❌ Missing required environment variables: TELEGRAM_TOKEN, GOOGLE_API_KEY');
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────────
// CLIENTS
// ──────────────────────────────────────────────────────────────────────────────
const bot   = new TelegramBot(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

// In-memory conversation history per user (max 20 messages to keep context)
const conversationHistory = new Map();
const MAX_HISTORY = 20;

// ──────────────────────────────────────────────────────────────────────────────
// HELPER: get or create user conversation history
// Gemini format: { role: "user" | "model", parts: [{ text: "..." }] }
// ──────────────────────────────────────────────────────────────────────────────
function getUserHistory(userId) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  return conversationHistory.get(userId);
}

// ──────────────────────────────────────────────────────────────────────────────
// HELPER: call Google Gemini
// ──────────────────────────────────────────────────────────────────────────────
async function getGeminiResponse(userId, userMessage) {
  const history = getUserHistory(userId);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT 
  });

  // Start chat with history
  const chat = model.startChat({
    history: history,
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.7,
    },
  });

  const result = await chat.sendMessage(userMessage);
  const response = await result.response;
  const assistantMessage = response.text();

  // Gemini SDK manages the history object automatically when using startChat
  // but since we want to persist it in Map (serverless context might lose it, but in memory for now),
  // we update it from the chat session.
  const newHistory = await chat.getHistory();
  
  // Limit history size
  if (newHistory.length > MAX_HISTORY) {
    conversationHistory.set(userId, newHistory.slice(newHistory.length - MAX_HISTORY));
  } else {
    conversationHistory.set(userId, newHistory);
  }

  return assistantMessage;
}

// ──────────────────────────────────────────────────────────────────────────────
// TELEGRAM MESSAGE HANDLER
// ──────────────────────────────────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id?.toString() || chatId.toString();
  const text   = msg.text;

  if (!text) return;

  // Commands
  if (text === '/start') {
    const name = msg.from?.first_name || 'bạn';
    await bot.sendMessage(chatId,
      `👋 Xin chào ${name}!\n\n` +
      `Tôi là ChatBot AI được tích hợp với Google Gemini (AI Pro).\n` +
      `Hãy nhắn tin bất cứ điều gì bạn muốn hỏi!\n\n` +
      `📌 Lệnh:\n` +
      `/start - Bắt đầu\n` +
      `/clear - Xóa lịch sử hội thoại\n` +
      `/help  - Trợ giúp`
    );
    return;
  }

  if (text === '/clear') {
    conversationHistory.delete(userId);
    await bot.sendMessage(chatId, '🗑️ Đã xóa lịch sử hội thoại. Chúng ta có thể bắt đầu lại!');
    return;
  }

  if (text === '/help') {
    await bot.sendMessage(chatId,
      `🤖 *Gemini Pro Bot - Trợ giúp*\n\n` +
      `Nhắn tin trực tiếp để nói chuyện với AI của Google.\n\n` +
      `*Lệnh:*\n` +
      `/start - Khởi động bot\n` +
      `/clear - Xóa lịch sử trò chuyện\n` +
      `/help  - Hiển thị trợ giúp này\n\n` +
      `*Model đang dùng:* ${MODEL_NAME}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Show typing indicator
  await bot.sendChatAction(chatId, 'typing');

  try {
    const response = await getGeminiResponse(userId, text);
    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Gemini error:', error.message);

    let errorMsg = '❌ Đã xảy ra lỗi khi xử lý yêu cầu của bạn.';
    if (error.message.includes('429')) {
      errorMsg = '⚠️ Đã vượt quá giới hạn API Gemini. Vui lòng thử lại sau ít phút.';
    } else if (error.message.includes('API_KEY_INVALID')) {
      errorMsg = '⚠️ API key Google không hợp lệ hoặc hết hạn.';
    } else if (error.message.includes('SAFETY')) {
      errorMsg = '⚠️ Nội dung này bị chặn bởi bộ lọc an toàn của Google.';
    }

    await bot.sendMessage(chatId, errorMsg);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// WEBHOOK ENDPOINT
// ──────────────────────────────────────────────────────────────────────────────
app.post(`/webhook/${TELEGRAM_TOKEN}`, (req, res) => {
  res.sendStatus(200); // Respond immediately to Telegram
  const update = req.body;
  if (update.message) {
    handleMessage(update.message).catch(console.error);
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', model: MODEL_NAME, uptime: process.uptime() });
});

// ──────────────────────────────────────────────────────────────────────────────
// START SERVER & SET WEBHOOK
// ──────────────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  if (WEBHOOK_URL) {
    try {
      const webhookEndpoint = `${WEBHOOK_URL}/webhook/${TELEGRAM_TOKEN}`;
      await bot.setWebHook(webhookEndpoint);
      console.log(`✅ Webhook set to: ${webhookEndpoint}`);
    } catch (err) {
      console.error('❌ Failed to set webhook:', err.message);
    }
  } else {
    console.warn('⚠️  WEBHOOK_URL not set. Webhook will be configured after deployment.');
  }
});
