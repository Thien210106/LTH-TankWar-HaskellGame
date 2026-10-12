# 🎮 TankWar - Bản Cài Đặt Sẵn (Release Build)

> 🚀 **Đây là nhánh `test` chứa bộ cài đặt game hoàn chỉnh đã biên dịch sẵn thành file `.exe`.**  
> Bạn không cần cài đặt Haskell, Cabal hay bất kỳ môi trường lập trình nào. Chỉ cần tải về và chơi ngay!

---

## 📦 Danh sách các file trong bản Release

| Tên File | Chức năng | Hướng dẫn sử dụng |
| :--- | :--- | :--- |
| **`tankwar-client.exe`** | 🎮 Ứng dụng Game Client | Chạy giao diện đồ họa 2D Gloss và điều khiển xe tăng |
| **`tankwar-server.exe`** | 🖥️ Máy chủ Game Server | Điều khiển Game Loop 60Hz, STM, Bot AI và MongoDB |
| **`freeglut.dll`** | 🧩 Thư viện đồ họa OpenGL | Thư viện bắt buộc đi kèm cho Windows (không được xóa) |
| **`CHAY_SERVER.bat`** | ⚡ Khởi động Server nhanh | Nhấp đúp chuột để bật máy chủ (tích hợp sẵn Gemini AI Key) |
| **`CHAY_CLIENT.bat`** | ⚡ Mở Game nhanh | Nhấp đúp chuột để mở cửa sổ trò chơi kết nối Localhost |
| **`KET_NOI_ONLINE.bat`** | 🌐 Chơi qua Mạng / Internet | Nhấp đúp chuột để nhập IP/Domain và Port của bạn bè từ xa |

---

## 🕹️ Hướng dẫn cách chơi

### 1. Chơi 1 mình hoặc cùng bạn bè trên cùng máy tính (Local)
1. Nhấp đúp chuột vào file **`CHAY_SERVER.bat`** để khởi động máy chủ.
2. Nhấp đúp chuột vào file **`CHAY_CLIENT.bat`** để mở cửa sổ game.
3. Đăng nhập tên người chơi:
   - Nhấn phím `1` để tạo phòng.
   - Nhấn phím `B` để thêm Bot AI vào bắn cùng.
   - Nhấn phím `Enter` để bắt đầu trận đấu!
4. *(Tùy chọn)* Muốn chơi 2 người trên cùng máy: nhấp đúp file **`CHAY_CLIENT.bat`** lần thứ 2 để mở thêm người chơi thứ 2 vào chung phòng.

### 2. Chơi với bạn bè khác mạng WiFi / qua Internet
1. Người làm máy chủ bật **`CHAY_SERVER.bat`** và tạo đường truyền qua **ngrok** (`ngrok tcp 8080`) hoặc **Radmin VPN**.
2. Bạn bè ở xa nhấp đúp file **`KET_NOI_ONLINE.bat`**, nhập Host và Port được cấp để kết nối trực tiếp vào phòng!

---

## 🎮 Phím điều khiển trong trận chiến
- **`W` / `A` / `S` / `D`**: Di chuyển xe tăng tiến, lùi, xoay thân.
- **Chuột**: Xoay tháp pháo ngắm bắn 360 độ.
- **Chuột trái (LMB)** hoặc **`Space`**: Khai hỏa (Nạp đạn 0.5s cho đạn thường, 1.0s cho đạn đặc biệt).
- **`Enter`**: Mở khung chat trong trận (hỗ trợ gõ tiếng Việt có dấu, nhấn Enter để gửi, Esc để hủy).
- ⚠️ **Lưu ý:** Đạn nảy qua tường có thể gây sát thương lên chính xe tăng của bạn nếu sơ ý!
