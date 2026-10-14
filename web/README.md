# TankWar Browser Edition

Đây là frontend web Canvas bổ sung cho dự án Haskell hiện có. Các file Haskell gốc không bị thay đổi. Giao diện Gloss không chạy trực tiếp trong trình duyệt, vì vậy `web/` cung cấp renderer Canvas mới dùng tài nguyên xe tăng/đạn của dự án và có thể gửi input đến Haskell WebSocket server.

## 1. Chạy nhanh ở chế độ offline

Cần Python 3 hoặc một static web server. Từ thư mục gốc `LTH-TankWar-HaskellGame-frontend`, mở PowerShell/CMD và chạy:

```powershell
py -m http.server 5173
```

Mở trình duyệt tại:

```text
http://localhost:5173/web/
```

Nhập tên chiến binh rồi nhấn **CHƠI THỬ NGAY**. Chế độ này chạy mô phỏng cục bộ trong trình duyệt, không cần MongoDB hay server Haskell. Điều khiển: `W/A/S/D` để di chuyển, chuột để ngắm, click trái hoặc `Space` để bắn, `Esc` để mở lựa chọn rời trận.

> Nếu lệnh `py` không tồn tại trên máy, cài Python 3 hoặc dùng một static server khác. Nên chạy qua `http://localhost` thay vì mở trực tiếp file HTML.

## 2. Kết nối online với Haskell server hiện có

Online mode cần chạy server và MongoDB. Ở thư mục gốc dự án:

1. Khởi động MongoDB. Nếu bạn đã cài Docker:

   ```powershell
   docker run -d -p 27017:27017 --name tankwar-mongo mongo:latest
   ```

   Nếu container đã được tạo trước đó, dùng `docker start tankwar-mongo` thay vì tạo lại.

2. Mở **một cửa sổ terminal khác** tại thư mục gốc dự án và khởi động Haskell server:

   ```powershell
   stack exec tankwar-server -- --port 8080 --mongo-uri "mongodb://localhost:27017/tankwar_db"
   ```

   Hoặc dùng Cabal:

   ```powershell
   cabal run tankwar-server -- --port 8080 --mongo-uri "mongodb://localhost:27017/tankwar_db"
   ```

3. Mở `http://localhost:5173/web/`, nhập tên người chơi. Để server mặc định là `ws://localhost:8080`, rồi nhấn **KẾT NỐI ONLINE**.
4. Một người tạo phòng; người còn lại kết nối vào cùng server và nhập Room ID 6 ký tự. Chủ phòng bắt đầu khi có ít nhất 2 người.

Frontend gửi/nhận thông điệp theo dạng JSON tagged của `Aeson` trong `src/Common/Protocol.hs`; game state và vật lý online vẫn do Haskell server xử lý. Địa chỉ mặc định `ws://localhost:8080` chỉ dùng được khi server ở cùng máy. Nếu server ở máy khác, nhập `ws://IP-MAY-CHU:8080` và mở cổng phù hợp.

### Khi triển khai website công khai

Frontend tĩnh có thể triển khai từ riêng thư mục `web/` lên hosting HTTPS. Tuy nhiên, website HTTPS cần kết nối WebSocket bảo mật (`wss://`). Server Haskell trong repo đang mở WebSocket thường (`ws://`) trên cổng 8080; hãy đặt reverse proxy TLS hỗ trợ WebSocket trước server và nhập URL `wss://...` vào giao diện. Không nên mở trực tiếp cổng game ra Internet nếu chưa cấu hình mạng và firewall an toàn.

## 3. Giới hạn hiện tại cần biết

- Offline Practice là chế độ huấn luyện cục bộ để test giao diện và thao tác; bot/va chạm ở chế độ này là mô phỏng JavaScript, không phải game state authoritative của server.
- Online mode dùng Haskell backend hiện tại. Nếu backend hoặc MongoDB chưa chạy, đăng nhập online sẽ thất bại; bạn vẫn có thể chơi offline.
- Mã nguồn server chỉ gửi tên người chơi khi họ tham gia sau khi bạn đã vào phòng. Với người chơi đã ở trong phòng trước đó, giao diện phòng chờ tạm hiển thị slot chờ đồng bộ đến khi snapshot trận đấu bắt đầu. Muốn có danh sách roster đầy đủ ngay trong lobby, cần bổ sung thông điệp roster ở backend.
- Phần server yêu cầu tối thiểu 2 người cho `CStartGame`; client hiện tuân thủ giới hạn này.

## 4. Ghi chú phát triển

- `index.html`: các màn hình menu, lobby, phòng chờ và trận đấu.
- `style.css`: giao diện responsive.
- `app.js`: Canvas renderer, chế độ offline và WebSocket protocol client.
- `assets/img/`: các sprite nhỏ được sao chép từ thư mục assets của dự án để frontend dễ triển khai độc lập.
