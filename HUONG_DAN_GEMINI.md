# HƯỚNG DẪN CONFIG BOT TELEGRAM (GOOGLE GEMINI PRO)

## 1. Lấy Google API Key (AI Pro)
- Truy cập: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Tạo API Key mới (Link với tài khoản Google AI Pro của bạn).

## 2. Cấu hình trên Vercel
Bạn cần vào **Settings > Environment Variables** và chỉnh sửa các biến sau:

| Biến môi trường | Giá trị |
| :--- | :--- |
| `TELEGRAM_TOKEN` | (Giữ nguyên Token cũ của BotFather) |
| `GOOGLE_API_KEY` | (Dán API Key vừa lấy ở Bước 1) |
| `GEMINI_MODEL` | `gemini-1.5-flash` (hoặc `gemini-1.5-pro`) |
| `WEBHOOK_URL` | (Giữ nguyên Link Vercel cũ) |
| `SYSTEM_PROMPT` | (Tính cách của Bot, mặc định đã thiết lập) |

## 3. Hoàn tất
Sau khi cập nhật xong, hãy vào tab **Deployments**, nhấn vào dấu 3 chấm ở bản deploy mới nhất và chọn **Redeploy** để áp dụng thay đổi. 

Bot của bạn bây giờ sẽ trả lời hoàn toàn bằng Google Gemini với quyền hạn từ gói AI Pro mà bạn đang sở hữu!
