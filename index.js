const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURATION (loaded from environment variables)
// ──────────────────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY;
const WEBHOOK_URL     = process.env.WEBHOOK_URL;  // e.g. https://your-service-url.run.app
const PORT            = process.env.PORT || 8080;
const MODEL           = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SYSTEM_PROMPT   = process.env.SYSTEM_PROMPT ||
  'Bạn là một trợ lý AI thông minh, thân thiện và hữu ích. Hãy trả lời bằng ngôn ngữ mà người dùng sử dụng.';

// ──────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ──────────────────────────────────────────────────────────────────────────────
if (!TELEGRAM_TOKEN || !OPENAI_API_KEY) {
  console.error('❌ Missing required environment variables: TELEGRAM_TOKEN, OPENAI_API_KEY');
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────────
// CLIENTS
// ──────────────────────────────────────────────────────────────────────────────
const bot    = new TelegramBot(TELEGRAM_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// In-memory conversation history per user (max 20 messages to keep context)
const conversationHistory = new Map();
const MAX_HISTORY = 20;

// ──────────────────────────────────────────────────────────────────────────────
// HELPER: get or create user conversation history
// ──────────────────────────────────────────────────────────────────────────────
function getUserHistory(userId) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  return conversationHistory.get(userId);
}

// ──────────────────────────────────────────────────────────────────────────────
// HELPER: call OpenAI ChatGPT
// ──────────────────────────────────────────────────────────────────────────────
async function getChatGPTResponse(userId, userMessage) {
  const history = getUserHistory(userId);

  // Add user message to history
  history.push({ role: 'user', content: userMessage });

  // Limit history size
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
  ];

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 1000,
    temperature: 0.7,
  });

  const assistantMessage = response.choices[0].message.content;

  // Add assistant response to history
  history.push({ role: 'assistant', content: assistantMessage });

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
      `Tôi là ChatBot AI được tích hợp với ChatGPT.\n` +
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
      `🤖 *ChatGPT Bot - Trợ giúp*\n\n` +
      `Nhắn tin trực tiếp để nói chuyện với AI.\n\n` +
      `*Lệnh:*\n` +
      `/start - Khởi động bot\n` +
      `/clear - Xóa lịch sử trò chuyện\n` +
      `/help  - Hiển thị trợ giúp này\n\n` +
      `*Model đang dùng:* ${MODEL}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Show typing indicator
  await bot.sendChatAction(chatId, 'typing');

  try {
    const response = await getChatGPTResponse(userId, text);
    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('OpenAI error:', error.message);

    let errorMsg = '❌ Đã xảy ra lỗi khi xử lý yêu cầu của bạn.';
    if (error.status === 429) {
      errorMsg = '⚠️ Đã vượt quá giới hạn API. Vui lòng thử lại sau ít phút.';
    } else if (error.status === 401) {
      errorMsg = '⚠️ API key không hợp lệ. Vui lòng kiểm tra cấu hình.';
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

// Health check endpoint (Cloud Run requires this)
app.get('/', (req, res) => {
  res.json({ status: 'ok', model: MODEL, uptime: process.uptime() });
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
