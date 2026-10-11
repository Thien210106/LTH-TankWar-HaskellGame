# 🎮 TankWar (Haskell Online Multiplayer Edition)

[![Haskell](https://img.shields.io/badge/Language-Haskell-purple.svg?style=flat&logo=haskell)](https://www.haskell.org/)
[![GHC](https://img.shields.io/badge/GHC-9.4%2B-5e5086.svg?style=flat)](https://www.haskell.org/ghc/)
[![Frontend](https://img.shields.io/badge/Frontend-Gloss-informational.svg?style=flat)](https://hackage.haskell.org/package/gloss)
[![Networking](https://img.shields.io/badge/Network-WebSockets%20%2F%20STM-green.svg?style=flat)](https://hackage.haskell.org/package/websockets)
[![Database](https://img.shields.io/badge/Database-MongoDB-47A248.svg?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](LICENSE)

> Tựa game chiến thuật đối kháng xe tăng 2D góc nhìn từ trên xuống (top-down), được phát triển bằng ngôn ngữ lập trình thuần hàm **Haskell**. Lấy cảm hứng từ tựa game huyền thoại **Tank Trouble**, kết hợp cơ chế **Mystery Box (Hộp quà bí ẩn)** với hiệu lực **15 giây**, hệ thống **Multiplayer Client-Server qua Internet/LAN** với tính năng tạo phòng có mật khẩu, và cơ sở dữ liệu **MongoDB** quản lý toàn bộ dữ liệu trận đấu và người chơi.

---

## 📖 Mục lục

- [Giới thiệu](#-giới-thiệu)
- [Điểm nổi bật & Tính năng](#-điểm-nổi-bật--tính-năng)
- [Cơ chế Hộp quà Bí ẩn (?) & Hệ thống Vũ khí](#-cơ-chế-hộp-quà-bí-ẩn--hệ-thống-vũ-khí)
- [Quản lý Game Logic & Vòng lặp trò chơi](#-quản-lý-game-logic--vòng-lặp-trò-chơi)
- [Hệ thống Máy chủ & Quản lý Phòng (Lobby & Rooms)](#-hệ-thống-máy-chủ--quản-lý-phòng-lobby--rooms)
- [Quản lý Dữ liệu với MongoDB](#-quản-lý-dữ-liệu-với-mongodb)
- [Hướng dẫn điều khiển](#-hướng-dẫn-điều-khiển)
- [Kiến trúc Công nghệ Haskell](#-kiến-trúc-công-nghệ-haskell)
- [Cấu trúc thư mục dự án](#-cấu-trúc-thư-mục-dự-án)
- [Yêu cầu hệ thống & Hướng dẫn khởi chạy](#-yêu-cầu-hệ-thống--hướng-dẫn-khởi-chạy)
- [Lộ trình phát triển (Roadmap)](#-lộ-trình-phát-triển-roadmap)
- [Đóng góp & Giấy phép](#-đóng-góp--giấy-phép)

---

## 🎯 Giới thiệu

Trong **TankWar**, mỗi người chơi điều khiển một chiếc xe tăng độc lập trên máy tính của riêng mình, cùng tham gia vào một trận chiến nảy lửa trong mê cung khép kín. Các phát bắn thông thường có khả năng nảy dội vật lý qua tường gạch, biến mỗi góc ngách thành một cái bẫy chết người nếu không tính toán góc bắn chuẩn xác.

Trò chơi nâng tầm trải nghiệm nhờ:

1. **Chơi mạng đa nền tảng:** Kết nối các người chơi từ các máy tính khác nhau, bất kể ở trong cùng mạng LAN hay qua Internet thông qua Dedicated Server.
2. **Hệ thống phòng tùy biến:** Tự do tạo phòng, tìm kiếm theo Room ID và thiết lập mật khẩu bảo vệ để đấu riêng với bạn bè.
3. **Điều khiển linh hoạt:** Thân xe di chuyển bằng phím `WASD`, tháp pháo xoay 360° độc lập theo **con trỏ chuột**.
4. **Cơ chế nạp đạn cân bằng:** Mỗi phát bắn có thời gian hồi (reset) là **1 giây**.
5. **Hộp bí ẩn (`?`) kéo dài 15 giây:** Nhặt hộp quà để sở hữu đạn đặc biệt trong **15 giây** (bao gồm cả đạn Gatling xả loạt liên thanh 3 viên).
6. **Lưu trữ dữ liệu với MongoDB:** Quản lý tài khoản, lịch sử trận đấu, bảng xếp hạng và số liệu thống kê.

---

## ✨ Điểm nổi bật & Tính năng

- 🌐 **Online Multiplayer (Cross-Network / Internet & LAN):** Server Authoritative đồng bộ hóa trạng thái vật lý theo thời gian thực (60 Tick/s), loại bỏ tình trạng sai lệch trạng thái (desync).
- 🏷️ **Quản lý phòng thông minh:**
  - Tạo phòng mới hoặc tham gia phòng sẵn có.
  - Tìm phòng nhanh chóng qua **Mã phòng (Room ID)** 6 ký tự.
  - Hỗ trợ **Mật khẩu phòng (Password/Passcode)** cho phòng riêng tư.
- ⏱️ **Cơ chế hồi đạn chuẩn xác:** Sau mỗi lần bắn, súng sẽ cần **1 giây reset cooldown** để sẵn sàng cho phát tiếp theo.
- 🎯 **Điều khiển tách biệt (WASD + Chuột):** Thân xe di chuyển tự do bằng `WASD`, nòng pháo xoay tự do theo chuột để ngắm bắn chuẩn xác.
- ❓ **Hộp bí ẩn (Mystery Box) 15 giây:** Phá hộp để nhận buff vũ khí cực mạnh tồn tại trong đúng **15 giây**, sau đó tự động trở về đạn thường.
- 🎨 **Frontend thuần hàm với Gloss:** Giao diện vector mượt mà, sử dụng thư viện `gloss` của Haskell trên nền OpenGL.
- 🍃 **Cơ sở dữ liệu MongoDB:** Tích hợp MongoDB để ghi nhận lịch sử trận đấu, số mạng hạ gục và bảng xếp hạng người chơi.
- 🛡️ **An toàn đa luồng với STM:** Server Haskell xử lý hàng chục phòng chơi đồng thời bằng Software Transactional Memory mà không lo lỗi Race Condition.

---

## 🎁 Cơ chế Hộp quà Bí ẩn (?) & Hệ thống Vũ khí

### 1. Thời gian hồi đạn tiêu chuẩn (Cooldown Reset)

- **Thời gian hồi đạn:** **1.0 giây** cho mỗi lần bắn tiêu chuẩn.
- Người chơi cần canh thời gian chính xác để không bị rơi vào thế bị động khi đối phương áp sát.

### 2. Sự kiện Hộp bí ẩn (Mystery Box)

Hộp bí ẩn dấu hỏi vàng (`?`) xuất hiện ngẫu nhiên trong mê cung theo chu kỳ thời gian. Khi một người chơi bắn nổ hộp, xe tăng của người đó sẽ nhận được một loại đạn cường hóa có hiệu lực trong **15 giây**:

| Biểu tượng | Loại đạn | Cơ chế hoạt động & Hồi đạn |
| :---: | :--- | :--- |
| 💥 | **Đạn chùm (Shotgun / Triple Shot)** | Bắn ra **3 viên đạn cùng lúc** theo hình rẻ quạt. Góc dội rộng bao phủ không gian hẹp. Thời gian hồi sau phát bắn: **2 giây**. |
| ⚡ | **Tia Laze (Laser Beam)** | Tia năng lượng phát xạ tức thì, tốc độ ánh sáng, phản xạ tức thời qua các vách tường gạch. Thời gian hồi: **2 giây**. |
| 👻 | **Đạn xuyên tường (Wall-piercing Bullet)** | Bỏ qua các vách tường của mê cung, **bay xuyên thẳng qua vật cản** để tiêu diệt đối thủ đang ẩn nấp. Thời gian hồi: **2 giây**. |
| 🚀 | **Đạn liên thanh (Gatling / Burst Fire)** | Bắn ra **liên thanh 3 viên liên tiếp** trong tích tắc (Burst of 3 rounds), sau đó mới **reset thời gian hồi (cooldown)** để nạp lại lượt bắn kế tiếp. |

> ⏳ **Hết thời hạn 15 giây:** Xe tăng tự động quay trở về loại đạn tiêu chuẩn với thời gian nạp đạn 1 giây.

---

## ⚙️ Quản lý Game Logic & Vòng lặp trò chơi

Mọi logic trận đấu được tính toán tập trung trên **Máy chủ (Authoritative Server)** để đảm bảo tính công bằng và đồng bộ tuyệt đối giữa các máy khách:

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │                     SERVER GAME LOOP (Tick Rate 60Hz)                  │
 └──────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 1. INPUT PROCESSING: Nhận gói PlayerInput (W/A/S/D, Góc chuột, Click)  │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 2. WEAPON & COOLDOWN LOGIC:                                            │
 │    - Kiểm tra cooldown còn lại (reset 2.0s).                           │
 │    - Nếu dùng Gatling: Kích hoạt Burst Queue (bắn 3 viên rồi cooldown).│
 │    - Cập nhật đếm ngược buff Mystery Box (15.0s -> 0.0s).              │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 3. MOVEMENT & PHYSICS:                                                 │
 │    - Cập nhật vận tốc, góc xoay thân và góc tháp pháo.                 │
 │    - Kiểm tra va chạm Tank - Tường (Sliding collision).                │
 │    - Cập nhật quỹ đạo đạn bay và góc phản xạ khi đụng tường gạch.      │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 4. COLLISION & COMBAT RESOLUTION:                                      │
 │    - Đạn trúng Xe tăng -> Người bị trúng nổ, cộng điểm người bắn.      │
 │    - Đạn trúng Mystery Box -> Phá hộp, trao buff 15s cho người bắn.    │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 5. BROADCAST: Gửi WorldSnapshot về toàn bộ Client để vẽ qua Gloss      │
 └────────────────────────────────────────────────────────────────────────┘
```

### Chi tiết các tầng logic quan trọng

1. **State Machine của Trận đấu:**
   - `LobbyState`: Người chơi tham gia phòng, chọn màu xe, chờ chủ phòng nhấn Bắt đầu.
   - `CountdownState`: Đếm ngược 3 giây trước khi mở khóa điều khiển.
   - `InGameState`: Giai đoạn giao tranh chính.
   - `RoundEndState`: Xe tăng cuối cùng sống sót giành chiến thắng hiệp đấu. Sau 3 giây dọn mê cung mới.
   - `MatchOverState`: Khi có người chơi đạt đủ số trận thắng quy định (ví dụ chạm mốc 5 điểm), ghi kết quả vào **MongoDB**.

2. **Logic Nạp đạn & Cơ chế Gatling:**

   ```haskell
   -- Trích đoạn logic bắn súng và hồi đạn
   data CooldownState
     = Ready
     | Reloading Float            -- Đếm ngược 1.0s
     | GatlingBurst Int Float     -- Còn lại số viên trong loạt 3 viên và delay giữa các viên
     deriving (Eq, Show)

   data WeaponState = WeaponState
     { currentWeapon :: BulletType
     , buffTimeLeft  :: Float     -- Hiệu lực 15.0s của Mystery Box
     , cooldownState :: CooldownState
     }
   ```

3. **Logic Hộp quà Bí ẩn (15 giây):**
   - Hộp quà xuất hiện tại ô ngã tư ngẫu nhiên sau mỗi 20–30 giây.
   - Khi nhận sát thương từ đạn, hộp biến mất và kích hoạt bộ đếm `buffTimeLeft = 15.0`.
   - Mỗi tick: `buffTimeLeft = max 0.0 (buffTimeLeft - dt)`. Khi chạm mốc `0.0`, chuyển `currentWeapon` về `NormalBullet`.

---

## 🍃 Quản lý Dữ liệu với MongoDB

Dự án sử dụng cơ sở dữ liệu NoSQL **MongoDB** (thông qua thư viện Haskell `mongoDB` và `bson`) để lưu trữ toàn bộ dữ liệu người dùng và lịch sử đối đầu.

### 1. Kiến trúc Database

- **Tên Database:** `tankwar_db`
- **Mô hình kết nối:** Server duy trì connection pool tới MongoDB instance.

### 2. Các Collection (Bảng dữ liệu) chính

#### 👤 Collection `players` (Hồ sơ người chơi)

```json
{
  "_id": "6524f1a2e3b1c90012ab34cd",
  "username": "tank_master",
  "displayName": "ProGamer99",
  "createdAt": "2026-10-10T12:00:00Z",
  "stats": {
    "totalMatches": 42,
    "wins": 28,
    "kills": 135,
    "deaths": 34,
    "boxesCollected": 50
  }
}
```

#### 🏆 Collection `matches` (Lịch sử trận đấu)

```json
{
  "_id": "6524f220e3b1c90012ab34ce",
  "roomId": "TNK889",
  "startTime": "2026-10-10T14:30:00Z",
  "endTime": "2026-10-10T14:45:00Z",
  "winner": "tank_master",
  "players": [
    { "username": "tank_master", "score": 5, "kills": 7 },
    { "username": "ghost_rider", "score": 3, "kills": 4 }
  ],
  "roundsPlayed": 8
}
```

#### 📊 Collection `leaderboards` (Bảng xếp hạng)

- Tự động thống kê Top người chơi có điểm hạ gục (Kills) và tỷ lệ thắng (Win Rate) cao nhất.

---

## 🏠 Hệ thống Máy chủ & Quản lý Phòng (Lobby & Rooms)

Máy chủ (`TankWar-Server`) chịu trách nhiệm tiếp nhận kết nối từ các máy khách (`TankWar-Client`), duy trì danh sách phòng đấu:

```text
               ┌──────────────────────────────────────┐
               │         TANKWAR SERVER               │
               │   (Quản lý Socket, Phòng, Logic, DB) │
               └──────────────────┬───────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Phòng #A8F2K1   │    │  Phòng #B4M9X2   │    │  Phòng #C1K7P0   │
│  (Public - 4/4)  │    │ (Có Pass 🔒- 2/2)│    │ (Public - 1/2)   │
└────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                       │                       │
     Client 1,2,3,4          Client 5,6               Client 7
   (Mạng Nhà / WAN)        (Mạng LAN A)             (Mạng 4G / WAN)
```

- **Tạo phòng (Create Room):** Chọn số lượng người chơi tối đa (2-4 người), đặt tên phòng và thiết lập mật khẩu (tùy chọn). Hệ thống sẽ cấp một **Room ID** gồm 6 ký tự.
- **Tìm & Tham gia phòng (Join by ID):** Nhập Room ID và mật khẩu (nếu phòng có bảo mật) để lập tức vào phòng chờ của bạn bè.
- **Đồng bộ hóa Authoritative:** Server tính toán di chuyển, va chạm vật lý, đạn bay và vị trí hộp quà; Client gửi input và nhận snapshot để render qua Gloss.

---

## 🕹️ Hướng dẫn điều khiển

Mỗi máy tính là một người chơi độc lập kết nối vào phòng:

| Thao tác | Phím / Thiết bị | Mô tả hành động |
| :---: | :---: | :--- |
| **Di chuyển thân xe** | `W` / `A` / `S` / `D` | `W` (Tiến), `S` (Lùi), `A` (Rẽ trái), `D` (Rẽ phải) |
| **Xoay nòng pháo** | **Con trỏ chuột** | Nòng pháo tự động quay 360° hướng về vị trí chuột trên màn hình |
| **Khai hỏa (Bắn)** | **Chuột trái (LMB)** hoặc `Space` | Khai hỏa theo góc ngắm nòng pháo (Reset sau 1.0s, Gatling xả 3 viên liên thanh) |
| **Tạm dừng / Menu** | `Esc` | Mở menu cài đặt / Rời phòng |
| **Xem bảng điểm** | `Tab` | Hiển thị số mạng hạ gục (Kills) và tỷ số hiện tại |

---

## 🛠️ Kiến trúc Công nghệ Haskell

Hệ thống được module hóa thành các tầng xử lý riêng biệt:

- **Frontend & Rendering:** Thư viện **`gloss`**
  - Dựng hình vector 2D tốc độ cao, xử lý xoay nòng pháo theo chuột, render UI phòng chờ và HUD hiển thị đồng hồ buff 15s.
- **Networking:** Thư viện **`websockets`**
  - Giao tiếp thời gian thực, độ trễ thấp giữa Client và Server qua Internet / LAN.
- **Database:** Thư viện **`mongoDB`** và **`bson`**
  - Thực hiện các thao tác CRUD bất đồng bộ lưu trữ hồ sơ, lịch sử trận đấu và bảng xếp hạng.
- **Concurrency & State Management:** **`stm`** (Software Transactional Memory)
  - `TVar (Map RoomId RoomState)`: Quản lý danh sách phòng đa luồng, an toàn, không nghẽn khóa.
- **Tuần tự hóa dữ liệu (Serialization):** Thư viện **`aeson`** (JSON) cho các gói tin mạng.

---

## 📁 Cấu trúc thư mục dự án

```text
TankWar/
├── common/                     -- Mã nguồn dùng chung giữa Client & Server
│   ├── Protocol.hs             -- Định nghĩa gói tin ClientMessage, ServerMessage
│   ├── Types.hs                -- Kiểu dữ liệu Tank, Bullet, MysteryBox, Maze
│   └── Config.hs               -- Các hằng số (Cooldown 1s, Buff 15s, TickRate 60Hz)
│
├── server/                     -- Ứng dụng Server quản lý kết nối, game logic & DB
│   ├── Main.hs                 -- Khởi chạy WebSocket Server & Kết nối MongoDB
│   ├── Database/
│   │   ├── Connection.hs       -- Thiết lập kết nối MongoDB Pool
│   │   ├── PlayerRepo.hs       -- Thao tác CRUD thông tin người chơi, thống kê
│   │   └── MatchRepo.hs        -- Lưu trữ kết quả trận đấu, lịch sử ván chơi
│   ├── State.hs                -- Quản lý TVar chứa danh sách các Room và kết nối
│   ├── RoomManager.hs          -- Xử lý tạo phòng, kiểm tra mật khẩu, tìm theo Room ID
│   └── GameEngine.hs           -- Xử lý vòng lặp vật lý, đạn nảy, burst Gatling 3 viên, buff 15s
│
├── client/                     -- Ứng dụng Client đồ họa Gloss cho mỗi máy
│   ├── Main.hs                 -- Khởi chạy Gloss `play` & kết nối Socket Client
│   ├── Network.hs              -- Luồng gửi PlayerInput & nhận WorldSnapshot
│   ├── Input.hs                -- Bắt phím WASD và tính toán góc trỏ chuột
│   ├── Render.hs               -- Dựng hình Gloss Picture (Xe, Nòng, Mê cung, Box)
│   └── UI/
│       ├── LobbyView.hs        -- Giao diện tạo phòng, nhập ID phòng và mật khẩu
│       └── GameView.hs         -- Giao diện HUD trận đấu, thanh thời gian buff 15s
│
├── package.yaml / TankWar.cabal
├── stack.yaml
└── README.md
```

---

## 🚀 Yêu cầu hệ thống & Hướng dẫn khởi chạy

### Yêu cầu tiên quyết

- [GHC](https://www.haskell.org/ghc/) phiên bản >= 9.2
- [Cabal](https://www.haskell.org/cabal/) hoặc [Stack](https://docs.haskellstack.org/)
- **MongoDB** (Server chạy local hoặc Cloud MongoDB Atlas):
  - Chạy local bằng Docker: `docker run -d -p 27017:27017 --name tankwar-mongo mongo:latest`
- **Thư viện OpenGL / GLUT** (phục vụ đồ họa Gloss):
  - **Ubuntu/Debian:** `sudo apt-get install freeglut3-dev`
  - **macOS:** `brew install freeglut`
  - **Windows:** Tích hợp sẵn trong GHCup / MSYS2.

---

### Hướng dẫn khởi chạy

#### 1. Khởi động Cơ sở dữ liệu MongoDB

```bash
docker run -d -p 27017:27017 --name tankwar-mongo mongo:latest
```

#### 2. Khởi động Máy chủ (Dedicated Server)

```bash
# Sử dụng Cabal
cabal run tankwar-server -- --port 8080 --mongo-uri "mongodb://localhost:27017/tankwar_db"

# Hoặc sử dụng Stack
stack exec tankwar-server -- --port 8080 --mongo-uri "mongodb://localhost:27017/tankwar_db"
```

> 💡 **Mẹo chơi qua Internet:** Mở cổng (Port Forwarding cổng `8080`) hoặc sử dụng công cụ như `ngrok tcp 8080` để cung cấp địa chỉ IP/Domain công khai cho bạn bè.

#### 3. Khởi chạy Client cho từng người chơi

Mỗi người chơi mở một cửa sổ game trên máy của mình:

```bash
# Sử dụng Cabal
cabal run tankwar-client -- --host <IP_HOAC_DOMAIN_SERVER> --port 8080

# Hoặc sử dụng Stack
stack exec tankwar-client -- --host 127.0.0.1 --port 8080
```

#### 4. Quy trình tạo & Vào phòng trong Game

1. Tại màn hình chính, chọn **Create Room** (Tạo phòng): đặt số người chơi (2-4) và nhập mật khẩu nếu muốn bảo mật.
2. Sao chép **Room ID** (ví dụ: `TNK889`) gửi cho bạn bè.
3. Người chơi khác chọn **Join Room**, nhập `TNK889` cùng mật khẩu để tham gia.
4. Khi các người chơi đã sẵn sàng, trận đấu lập tức bắt đầu!

---

## 🗺️ Lộ trình phát triển (Roadmap)

- [x] Thiết kế mô hình Client-Server với WebSocket và Gloss 2D.
- [x] Cơ chế điều khiển thân xe WASD + nòng xoay tự do theo chuột.
- [x] Hệ thống phòng (Room ID, Password, Tạo và Tham gia phòng).
- [x] Tích hợp cơ sở dữ liệu MongoDB quản lý người chơi và lịch sử đối đầu.
- [x] Thiết lập thời gian hồi đạn 2 giây và đạn Gatling bắn loạt 3 viên.
- [x] Hộp bí ẩn `?` ban tặng 4 loại đạn đặc biệt trong thời gian 15 giây.
- [ ] Tính năng Chat nhanh trong phòng chờ (In-game Lobby Chat).
- [ ] Bảng xếp hạng trực tiếp trong game (In-game Leaderboard).

---

## 🤝 Đóng góp & Giấy phép

Mọi đóng góp, báo cáo lỗi (Issue) hoặc đề xuất tính năng mới (Pull Request) đều được chào đón!

Dự án được phân phối dưới giấy phép **MIT License**. Chi tiết xem tại tệp [LICENSE](LICENSE).
