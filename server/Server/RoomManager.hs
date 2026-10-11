-- | Server.RoomManager
-- Quản lý vòng đời phòng đấu: tạo, tham gia, rời, tìm kiếm, bắt đầu trận.
-- Xử lý Room ID, mật khẩu, và khởi tạo trạng thái trận đấu.
module Server.RoomManager
  ( handleCreateRoom
  , handleJoinRoom
  , handleLeaveRoom
  , handleStartGame
  , handleListRooms
  , generateRoomId
  , generateMaze
  , assignTankColor
  ) where

import Control.Concurrent.STM
import Data.Map.Strict         (Map)
import qualified Data.Map.Strict as Map
import Data.Text               (Text, pack, unpack)
import Data.Time.Clock         (getCurrentTime)
import Data.Time.Format        (formatTime, defaultTimeLocale)
import System.Random           (randomRIO)
import Control.Monad           (when, unless)

import Common.Types
import Common.Config
import Common.Protocol
import Server.State

--------------------------------------------------------------------------------
-- Tạo phòng mới
--------------------------------------------------------------------------------

-- | Xử lý yêu cầu tạo phòng mới.
handleCreateRoom :: ServerState -> Text -> Text -> Int -> Maybe Text -> IO ()
handleCreateRoom ss username roomName maxP password = do
  -- Kiểm tra client đã trong phòng chưa
  currentRoom <- atomically $ getClientRoom ss username
  case currentRoom of
    Just _  -> sendToClient ss username (SRoomError "Bạn đang ở trong phòng khác!")
    Nothing -> do
      -- Sinh Room ID duy nhất
      rid <- generateUniqueRoomId ss
      now <- getCurrentTime
      let startTime = pack $ formatTime defaultTimeLocale "%Y-%m-%dT%H:%M:%SZ" now
          clampedMax = max minPlayersToStart (min maxPlayersPerRoom maxP)

      -- Tạo mê cung
      maze <- generateMaze

      -- Tạo xe tăng cho người tạo phòng
      let spawnPt = head (mazeSpawnPts maze)
          tank = mkTank username spawnPt TankRed

      -- Tạo phòng mới
      let room = RoomState
            { rsRoomId       = rid
            , rsRoomName     = roomName
            , rsPassword     = password
            , rsMaxPlayers   = clampedMax
            , rsHostPlayer   = username
            , rsPlayerIds    = [username]
            , rsPhase        = LobbyPhase
            , rsTanks        = Map.singleton username tank
            , rsBullets      = []
            , rsLasers       = []
            , rsMysteryBoxes = []
            , rsMaze         = maze
            , rsInputs       = Map.singleton username emptyInput
            , rsRoundNumber  = 0
            , rsStartTime    = startTime
            , rsBoxTimer     = 0
            }

      atomically $ do
        addRoom ss room
        setClientRoom ss username rid

      let info = roomToInfo room
      sendToClient ss username (SRoomCreated info)
      putStrLn $ "[Room] Phòng " ++ show rid ++ " được tạo bởi " ++ show username

--------------------------------------------------------------------------------
-- Tham gia phòng
--------------------------------------------------------------------------------

-- | Xử lý yêu cầu tham gia phòng.
handleJoinRoom :: ServerState -> Text -> Text -> Maybe Text -> IO ()
handleJoinRoom ss username roomId password = do
  -- Kiểm tra client đã trong phòng chưa
  currentRoom <- atomically $ getClientRoom ss username
  case currentRoom of
    Just _  -> sendToClient ss username (SRoomError "Bạn đang ở trong phòng khác!")
    Nothing -> do
      maybeRoom <- atomically $ getRoom ss roomId
      case maybeRoom of
        Nothing -> sendToClient ss username (SRoomError "Phòng không tồn tại!")
        Just room -> do
          -- Kiểm tra mật khẩu
          case rsPassword room of
            Just pw | password /= Just pw ->
              sendToClient ss username (SRoomError "Sai mật khẩu!")
            _ -> do
              -- Kiểm tra phòng đầy
              if length (rsPlayerIds room) >= rsMaxPlayers room
                then sendToClient ss username (SRoomError "Phòng đã đầy!")
                else do
                  -- Kiểm tra đang trong trận
                  case rsPhase room of
                    LobbyPhase -> doJoin ss username room
                    _          -> sendToClient ss username
                                   (SRoomError "Trận đấu đã bắt đầu, không thể vào!")

-- | Thực hiện join: thêm người chơi vào phòng.
doJoin :: ServerState -> Text -> RoomState -> IO ()
doJoin ss username room = do
  let rid       = rsRoomId room
      playerIdx = length (rsPlayerIds room)
      color     = assignTankColor playerIdx
      spawnPts  = mazeSpawnPts (rsMaze room)
      spawnPt   = if playerIdx < length spawnPts
                  then spawnPts !! playerIdx
                  else Vec2 100 100  -- fallback
      tank      = mkTank username spawnPt color

  atomically $ do
    modifyRoom ss rid $ \r -> r
      { rsPlayerIds = rsPlayerIds r ++ [username]
      , rsTanks     = Map.insert username tank (rsTanks r)
      , rsInputs    = Map.insert username emptyInput (rsInputs r)
      }
    setClientRoom ss username rid

  updatedRoom <- atomically $ getRoom ss rid
  case updatedRoom of
    Nothing -> return ()
    Just r  -> do
      let info = roomToInfo r
      sendToClient ss username (SRoomJoined info)
      -- Thông báo cho người chơi khác
      broadcastToRoom ss rid (SPlayerJoined username color)
      putStrLn $ "[Room] " ++ show username ++ " vào phòng " ++ show rid

--------------------------------------------------------------------------------
-- Rời phòng
--------------------------------------------------------------------------------

-- | Xử lý yêu cầu rời phòng.
handleLeaveRoom :: ServerState -> Text -> IO ()
handleLeaveRoom ss username = do
  maybeRoomId <- atomically $ getClientRoom ss username
  case maybeRoomId of
    Nothing  -> sendToClient ss username (SRoomError "Bạn không ở trong phòng nào!")
    Just rid -> do
      atomically $ do
        modifyRoom ss rid $ \r -> r
          { rsPlayerIds = filter (/= username) (rsPlayerIds r)
          , rsTanks     = Map.delete username (rsTanks r)
          , rsInputs    = Map.delete username (rsInputs r)
          }
        clearClientRoom ss username

      -- Kiểm tra phòng trống -> xoá phòng
      maybeRoom <- atomically $ getRoom ss rid
      case maybeRoom of
        Nothing -> return ()
        Just r  ->
          if null (rsPlayerIds r)
            then do
              atomically $ removeRoom ss rid
              putStrLn $ "[Room] Phòng " ++ show rid ++ " đã bị xoá (trống)"
            else do
              -- Nếu host rời, chuyển host
              when (rsHostPlayer r == username) $ do
                let newHost = head (rsPlayerIds r)
                atomically $ modifyRoom ss rid $ \r' ->
                  r' { rsHostPlayer = newHost }
                putStrLn $ "[Room] Chuyển host phòng " ++ show rid
                        ++ " sang " ++ show newHost

              broadcastToRoom ss rid (SPlayerLeft username)

      sendToClient ss username SRoomLeft
      putStrLn $ "[Room] " ++ show username ++ " rời phòng " ++ show rid

--------------------------------------------------------------------------------
-- Bắt đầu trận đấu
--------------------------------------------------------------------------------

-- | Chủ phòng nhấn Start.
handleStartGame :: ServerState -> Text -> IO ()
handleStartGame ss username = do
  maybeRoomId <- atomically $ getClientRoom ss username
  case maybeRoomId of
    Nothing  -> sendToClient ss username (SRoomError "Bạn không ở trong phòng!")
    Just rid -> do
      maybeRoom <- atomically $ getRoom ss rid
      case maybeRoom of
        Nothing -> return ()
        Just room -> do
          -- Chỉ host mới được bắt đầu
          unless (rsHostPlayer room == username) $ do
            sendToClient ss username (SRoomError "Chỉ chủ phòng mới được bắt đầu!")
            return ()

          when (rsHostPlayer room == username) $ do
            -- Cần ít nhất 2 người
            if length (rsPlayerIds room) < minPlayersToStart
              then sendToClient ss username
                     (SRoomError $ "Cần ít nhất " <> pack (show minPlayersToStart)
                                <> " người chơi!")
              else do
                -- Chuyển sang Countdown
                atomically $ modifyRoom ss rid $ \r -> r
                  { rsPhase = CountdownPhase countdownDuration
                  }
                broadcastToRoom ss rid (SCountdown countdownDuration)
                putStrLn $ "[Game] Phòng " ++ show rid ++ " bắt đầu countdown!"

--------------------------------------------------------------------------------
-- Liệt kê phòng
--------------------------------------------------------------------------------

-- | Gửi danh sách phòng cho client.
handleListRooms :: ServerState -> Text -> IO ()
handleListRooms ss username = do
  rooms <- atomically $ getAllRooms ss
  let infos = map roomToInfo rooms
  sendToClient ss username (SRoomList infos)

--------------------------------------------------------------------------------
-- Sinh Room ID duy nhất
--------------------------------------------------------------------------------

-- | Sinh Room ID 6 ký tự ngẫu nhiên, đảm bảo duy nhất.
generateUniqueRoomId :: ServerState -> IO Text
generateUniqueRoomId ss = do
  rid <- generateRoomId
  exists <- atomically $ do
    rooms <- readTVar (ssRooms ss)
    return $ Map.member rid rooms
  if exists
    then generateUniqueRoomId ss  -- thử lại
    else return rid

-- | Sinh Room ID 6 ký tự ngẫu nhiên.
generateRoomId :: IO Text
generateRoomId = do
  let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  cs <- mapM (\_ -> do
    idx <- randomRIO (0, length chars - 1)
    return $ chars !! idx
    ) [1..roomIdLength]
  return $ pack cs

--------------------------------------------------------------------------------
-- Gán màu xe tăng
--------------------------------------------------------------------------------

-- | Gán màu xe tăng theo thứ tự tham gia (index 0-3).
assignTankColor :: Int -> TankColor
assignTankColor idx = case idx `mod` 4 of
  0 -> TankRed
  1 -> TankBlue
  2 -> TankGreen
  _ -> TankYellow

--------------------------------------------------------------------------------
-- Chuyển đổi RoomState -> RoomInfo (thông tin hiển thị)
--------------------------------------------------------------------------------

roomToInfo :: RoomState -> RoomInfo
roomToInfo r = RoomInfo
  { riRoomId         = rsRoomId r
  , riRoomName       = rsRoomName r
  , riMaxPlayers     = rsMaxPlayers r
  , riCurrentPlayers = length (rsPlayerIds r)
  , riHasPassword    = case rsPassword r of
                         Just _  -> True
                         Nothing -> False
  , riPhase          = rsPhase r
  }

--------------------------------------------------------------------------------
-- Tạo xe tăng mới
--------------------------------------------------------------------------------

mkTank :: Text -> Vec2 -> TankColor -> Tank
mkTank pid spawnPos color = Tank
  { tankId          = pid
  , tankPos         = spawnPos
  , tankVel         = vec2Zero
  , tankBodyAngle   = 0
  , tankTurretAngle = 0
  , tankColor       = color
  , tankWeapon      = defaultWeaponState
  , tankAlive       = True
  , tankScore       = 0
  , tankKills       = 0
  }

--------------------------------------------------------------------------------
-- Sinh mê cung (Maze Generation)
--------------------------------------------------------------------------------

-- | Tạo mê cung mặc định với tường bao quanh và các vách ngăn bên trong.
-- Trong phiên bản hoàn chỉnh, có thể thay bằng thuật toán random maze.
generateMaze :: IO Maze
generateMaze = do
  let w = defaultMazeWidth
      h = defaultMazeHeight
      cs = cellSize

      -- Tường bao quanh (4 cạnh)
      borderWalls =
        [ Wall (Vec2 0 0) (Vec2 w 0)     -- Đáy
        , Wall (Vec2 w 0) (Vec2 w h)     -- Phải
        , Wall (Vec2 w h) (Vec2 0 h)     -- Đỉnh
        , Wall (Vec2 0 h) (Vec2 0 0)     -- Trái
        ]

      -- Vách ngăn bên trong (tạo mê cung thú vị)
      -- Layout thiết kế tay cho gameplay cân bằng
      innerWalls =
        -- Hàng ngang giữa
        [ Wall (Vec2 (2*cs) (3*cs)) (Vec2 (4*cs) (3*cs))
        , Wall (Vec2 (5*cs) (3*cs)) (Vec2 (7*cs) (3*cs))
        , Wall (Vec2 (6*cs) (6*cs)) (Vec2 (8*cs) (6*cs))
        , Wall (Vec2 (9*cs) (3*cs)) (Vec2 (11*cs) (3*cs))
        -- Hàng ngang trên/dưới
        , Wall (Vec2 (3*cs) (2*cs)) (Vec2 (5*cs) (2*cs))
        , Wall (Vec2 (8*cs) (2*cs)) (Vec2 (10*cs) (2*cs))
        , Wall (Vec2 (3*cs) (7*cs)) (Vec2 (5*cs) (7*cs))
        , Wall (Vec2 (8*cs) (7*cs)) (Vec2 (10*cs) (7*cs))
        -- Cột dọc
        , Wall (Vec2 (2*cs) (1*cs)) (Vec2 (2*cs) (3*cs))
        , Wall (Vec2 (11*cs) (1*cs)) (Vec2 (11*cs) (3*cs))
        , Wall (Vec2 (2*cs) (6*cs)) (Vec2 (2*cs) (8*cs))
        , Wall (Vec2 (11*cs) (6*cs)) (Vec2 (11*cs) (8*cs))
        -- Trung tâm
        , Wall (Vec2 (6*cs) (4*cs)) (Vec2 (6*cs) (5*cs))
        , Wall (Vec2 (7*cs) (4*cs)) (Vec2 (7*cs) (5*cs))
        , Wall (Vec2 (5*cs) (4.5*cs)) (Vec2 (6*cs) (4.5*cs))
        , Wall (Vec2 (7*cs) (4.5*cs)) (Vec2 (8*cs) (4.5*cs))
        ]

      -- Điểm spawn xe tăng (4 góc)
      spawns =
        [ Vec2 (1.5*cs) (1.5*cs)       -- Góc trái dưới
        , Vec2 (w - 1.5*cs) (h - 1.5*cs) -- Góc phải trên
        , Vec2 (w - 1.5*cs) (1.5*cs)   -- Góc phải dưới
        , Vec2 (1.5*cs) (h - 1.5*cs)   -- Góc trái trên
        ]

      -- Vị trí spawn hộp bí ẩn (giao lộ)
      boxSpawns =
        [ Vec2 (4*cs) (4.5*cs)
        , Vec2 (9*cs) (4.5*cs)
        , Vec2 (6.5*cs) (2*cs)
        , Vec2 (6.5*cs) (7*cs)
        , Vec2 (6.5*cs) (4.5*cs)  -- Trung tâm
        ]

  return Maze
    { mazeWalls       = borderWalls ++ innerWalls
    , mazeWidth       = w
    , mazeHeight      = h
    , mazeSpawnPts    = spawns
    , mazeBoxSpawnPts = boxSpawns
    }
