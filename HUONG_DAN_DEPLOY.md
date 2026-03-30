# 🤖 Hướng Dẫn Deploy Telegram ChatGPT Bot

Bot chạy 24/7 trên **Google Cloud Run** — không cần máy tính luôn bật.

---

## 📋 Bước 1: Chuẩn Bị

### 1.1 Tạo Telegram Bot
1. Mở Telegram, tìm `@BotFather`
2. Gửi lệnh `/newbot`
3. Đặt tên cho bot (ví dụ: `My GPT Assistant`)
4. Đặt username (phải kết thúc bằng `bot`, ví dụ: `mygpt_assistant_bot`)
5. **Lưu lại Bot Token** — trông như: `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 1.2 Lấy OpenAI API Key
1. Vào [platform.openai.com](https://platform.openai.com)
2. Vào **API Keys** → **Create new secret key**
3. **Lưu lại key** — trông như: `sk-xxxxxxxxxxxxxxxxxxxxxxxx`

### 1.3 Cài Google Cloud SDK (gcloud)
Tải tại: https://cloud.google.com/sdk/docs/install

---

## 🚀 Bước 2: Deploy Lên Cloud Run

### 2.1 Đăng nhập Google Cloud

```powershell
gcloud auth login
gcloud projects list
```

### 2.2 Tạo Project Mới (hoặc dùng project có sẵn)

```powershell
# Tạo project mới
gcloud projects create telegram-gpt-bot-<random>

# Hoặc dùng project cũ
gcloud config set project YOUR_PROJECT_ID
```

### 2.3 Enable Billing
Vào: https://console.cloud.google.com/billing

### 2.4 Deploy Bot

```powershell
# Di chuyển vào thư mục project
cd e:\Antigravity\GPT_Chatbot

# Deploy lên Cloud Run (thay thế giá trị trong <...>)
gcloud run deploy telegram-gpt-bot `
  --source . `
  --region asia-southeast1 `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars "TELEGRAM_TOKEN=<YOUR_TELEGRAM_TOKEN>" `
  --set-env-vars "OPENAI_API_KEY=<YOUR_OPENAI_KEY>" `
  --set-env-vars "OPENAI_MODEL=gpt-4o-mini" `
  --memory 256Mi `
  --min-instances 1
```

> ⚠️ `--min-instances 1` quan trọng! Giúp bot luôn sẵn sàng nhận tin nhắn.

### 2.5 Lấy URL và Cập Nhật Webhook

Sau khi deploy xong, terminal sẽ hiện URL dạng:
```
Service URL: https://telegram-gpt-bot-xxxxxxx-as.a.run.app
```

Cập nhật biến `WEBHOOK_URL`:

```powershell
gcloud run services update telegram-gpt-bot `
  --region asia-southeast1 `
  --update-env-vars "WEBHOOK_URL=https://telegram-gpt-bot-xxxxxxx-as.a.run.app"
```

---

## ✅ Bước 3: Test Bot

1. Mở Telegram, tìm bot của bạn theo username
2. Nhấn `/start`
3. Nhắn tin bất kỳ — bot sẽ trả lời bằng ChatGPT!

---

## 💰 Chi Phí Ước Tính

| Dịch vụ | Chi phí |
|---------|---------|
| Google Cloud Run | ~$0–5/tháng (có free tier) |
| OpenAI GPT-4o-mini | ~$0.15/1M token input |
| OpenAI GPT-4o | ~$2.50/1M token input |

> 💡 Dùng `gpt-4o-mini` để tiết kiệm chi phí nhất.

---

## 🔧 Các Lệnh Hữu Ích

```powershell
# Xem logs
gcloud run services logs read telegram-gpt-bot --region asia-southeast1

# Xem trạng thái
gcloud run services describe telegram-gpt-bot --region asia-southeast1

# Cập nhật bot (sau khi sửa code)
gcloud run deploy telegram-gpt-bot --source . --region asia-southeast1
```

---

## 🤖 Lệnh Trong Telegram

| Lệnh | Mô tả |
|------|-------|
| `/start` | Khởi động bot |
| `/clear` | Xóa lịch sử hội thoại |
| `/help` | Hiển thị trợ giúp |
