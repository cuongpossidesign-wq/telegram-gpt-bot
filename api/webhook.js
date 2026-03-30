const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  'Bạn là một trợ lý AI thông minh, thân thiện và hữu ích. Hãy trả lời bằng ngôn ngữ mà người dùng sử dụng.';

const bot    = new TelegramBot(TELEGRAM_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// In-memory conversation history (persists while function is warm)
const conversationHistory = new Map();
const MAX_HISTORY = 20;

function getUserHistory(userId) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  return conversationHistory.get(userId);
}

async function getChatGPTResponse(userId, userMessage) {
  const history = getUserHistory(userId);
  history.push({ role: 'user', content: userMessage });
  while (history.length > MAX_HISTORY) history.shift();

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
    max_tokens: 1000,
    temperature: 0.7,
  });

  const assistantMessage = response.choices[0].message.content;
  history.push({ role: 'assistant', content: assistantMessage });
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
      `👋 Xin chào ${name}!\n\nTôi là ChatBot AI tích hợp ChatGPT.\nHãy nhắn tin bất cứ điều gì!\n\n📌 Lệnh:\n/start - Bắt đầu\n/clear - Xóa lịch sử\n/help  - Trợ giúp`
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
      `🤖 *ChatGPT Bot*\n\nNhắn tin trực tiếp để nói chuyện với AI.\n\n*Lệnh:*\n/start - Khởi động\n/clear - Xóa lịch sử\n/help  - Trợ giúp\n\n*Model:* ${MODEL}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await bot.sendChatAction(chatId, 'typing');

  try {
    const response = await getChatGPTResponse(userId, text);
    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error:', error.message);
    let errorMsg = '❌ Lỗi xử lý yêu cầu. Vui lòng thử lại!';
    if (error.status === 429) errorMsg = '⚠️ Đã vượt giới hạn API. Thử lại sau ít phút.';
    if (error.status === 401) errorMsg = '⚠️ API key không hợp lệ.';
    await bot.sendMessage(chatId, errorMsg);
  }
}

// Vercel serverless handler
module.exports = async (req, res) => {
  // Only accept POST requests from Telegram
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Telegram GPT Bot is running!' });
  }

  try {
    const update = req.body;
    if (update.message) {
      await handleMessage(update.message);
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }

  // Always respond 200 to Telegram immediately
  res.status(200).json({ ok: true });
};
