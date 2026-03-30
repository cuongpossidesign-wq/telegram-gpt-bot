const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const MODEL_NAME     = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const SYSTEM_PROMPT  = process.env.SYSTEM_PROMPT ||
  'Bạn là một trợ lý AI thông minh, thân thiện và hữu ích. Hãy trả lời bằng ngôn ngữ mà người dùng sử dụng.';

const bot   = new TelegramBot(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

// In-memory conversation history (persists while function is warm)
// Gemini format: { role: "user" | "model", parts: [{ text: "..." }] }
const conversationHistory = new Map();
const MAX_HISTORY = 20;

function getUserHistory(userId) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  return conversationHistory.get(userId);
}

async function getGeminiResponse(userId, userMessage) {
  const history = getUserHistory(userId);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME, 
    systemInstruction: SYSTEM_PROMPT 
  });

  const chat = model.startChat({
    history: history,
  });

  const result = await chat.sendMessage(userMessage);
  const response = await result.response;
  const assistantMessage = response.text();

  // Update history from chat session
  const newHistory = await chat.getHistory();
  if (newHistory.length > MAX_HISTORY) {
    conversationHistory.set(userId, newHistory.slice(newHistory.length - MAX_HISTORY));
  } else {
    conversationHistory.set(userId, newHistory);
  }

  return assistantMessage;
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id?.toString() || chatId.toString();
  const text   = msg.text;

  if (!text) return;

  if (text === '/start') {
    const name = msg.from?.first_name || 'bạn';
    await bot.sendMessage(chatId,
      `👋 Xin chào ${name}!\n\nTôi là ChatBot AI tích hợp Gemini Pro.\nHãy nhắn tin bất cứ điều gì!\n\n📌 Lệnh:\n/start - Bắt đầu\n/clear - Xóa lịch sử\n/help  - Trợ giúp`
    );
    return;
  }

  if (text === '/clear') {
    conversationHistory.delete(userId);
    await bot.sendMessage(chatId, '🗑️ Đã xóa lịch sử hội thoại!');
    return;
  }

  if (text === '/help') {
    await bot.sendMessage(chatId,
      `🤖 *Gemini Bot*\n\nNhắn tin trực tiếp để nói chuyện với AI của Google.\n\n*Lệnh:*\n/start - Khởi động\n/clear - Xóa lịch sử\n/help  - Trợ giúp\n\n*Model:* ${MODEL_NAME}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await bot.sendChatAction(chatId, 'typing');

  try {
    const response = await getGeminiResponse(userId, text);
    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Gemini Error:', error.message);
    let errorMsg = '❌ Lỗi xử lý yêu cầu. Vui lòng thử lại!';
    if (error.message.includes('429')) errorMsg = '⚠️ Hết hạn mức API Gemini. Thử lại sau ít phút.';
    if (error.message.includes('API_KEY_INVALID')) errorMsg = '⚠️ API key Google không hợp lệ.';
    await bot.sendMessage(chatId, errorMsg);
  }
}

// Vercel serverless handler
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Telegram Gemini Bot is running!' });
  }

  try {
    const update = req.body;
    if (update.message) {
      await handleMessage(update.message);
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }

  res.status(200).json({ ok: true });
};
