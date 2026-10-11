module Input
  ( handleInput
  ) where

import Data.Char (isPrint, toLower)
import Graphics.Gloss.Interface.Pure.Game

import Render.Map (mapForTheme)
import Types

handleInput :: Event -> GameState -> GameState
handleInput event gameState = case event of
  EventMotion position -> setAim position gameState
  EventKey key Down _ position -> handleKeyDown key position gameState
  EventKey key Up _ _ -> handleKeyUp key gameState
  _ -> gameState

handleKeyDown :: Key -> (Float, Float) -> GameState -> GameState
handleKeyDown key position gameState = case key of
  SpecialKey KeyEsc -> leaveCurrentScreen gameState
  SpecialKey KeyTab -> switchField gameState
  SpecialKey KeyBackspace -> eraseCharacter gameState
  SpecialKey KeyEnter -> confirmEntry gameState
  SpecialKey KeySpace -> setFire True gameState
  MouseButton LeftButton -> handleLeftClick position (setFire True gameState)
  MouseButton WheelUp -> changeZoom 0.1 gameState
  MouseButton WheelDown -> changeZoom (-0.1) gameState
  Char character -> handleCharacter character gameState
  _ -> gameState

handleKeyUp :: Key -> GameState -> GameState
handleKeyUp key gameState = case key of
  SpecialKey KeySpace -> setFire False gameState
  MouseButton LeftButton -> setFire False gameState
  Char character -> setMovement character False gameState
  _ -> gameState

handleCharacter :: Char -> GameState -> GameState
handleCharacter character gameState
  | gameScreen gameState == MainMenuScreen && menuJoinOpen (gameMenu gameState) && isPrint character = appendCharacter character gameState
  | gameScreen gameState == LobbyScreen = handleLobbyCharacter character gameState
  | gameScreen gameState == InGameScreen = setMovement character True gameState
  | otherwise = gameState

handleLobbyCharacter :: Char -> GameState -> GameState
handleLobbyCharacter character gameState
  | menuFocusedField menuState == PlayerNameField && isPrint character = updateLocalName (appendCharacter character gameState)
  | otherwise = case toLower character of
      'h' -> selectHull gameState
      'g' -> selectGun gameState
      'm' -> selectMap gameState
      'r' -> startPreview gameState
      _ -> gameState
  where
    menuState = gameMenu gameState

appendCharacter :: Char -> GameState -> GameState
appendCharacter character gameState = gameState { gameMenu = updatedMenu }
  where
    menuState = gameMenu gameState
    updatedMenu = case menuFocusedField menuState of
      PlayerNameField -> menuState { menuPlayerName = appendLimited 16 character (menuPlayerName menuState) }
      RoomCodeField -> menuState { menuRoomCode = appendLimited 6 (toUpperCode character) (menuRoomCode menuState) }
      RoomPasswordField -> menuState { menuRoomPassword = appendLimited 24 character (menuRoomPassword menuState) }

eraseCharacter :: GameState -> GameState
eraseCharacter gameState = case gameScreen gameState of
  MainMenuScreen
    | menuJoinOpen (gameMenu gameState) -> gameState { gameMenu = eraseInMenu (gameMenu gameState) }
    | otherwise -> gameState
  LobbyScreen
    | menuFocusedField (gameMenu gameState) == PlayerNameField -> updateLocalName (gameState { gameMenu = eraseInMenu (gameMenu gameState) })
    | otherwise -> gameState
  _ -> gameState

eraseInMenu :: MenuState -> MenuState
eraseInMenu menuState = case menuFocusedField menuState of
  PlayerNameField -> menuState { menuPlayerName = dropLast (menuPlayerName menuState) }
  RoomCodeField -> menuState { menuRoomCode = dropLast (menuRoomCode menuState) }
  RoomPasswordField -> menuState { menuRoomPassword = dropLast (menuRoomPassword menuState) }

switchField :: GameState -> GameState
switchField gameState = case gameScreen gameState of
  MainMenuScreen
    | menuJoinOpen (gameMenu gameState) -> focus RoomCodeField gameState
    | otherwise -> beginJoining gameState
  LobbyScreen -> focus PlayerNameField gameState
  _ -> gameState

confirmEntry :: GameState -> GameState
confirmEntry gameState = case gameScreen gameState of
  MainMenuScreen -> beginOrJoin gameState
  LobbyScreen -> saveLobbyName gameState
  _ -> gameState

handleLeftClick :: (Float, Float) -> GameState -> GameState
handleLeftClick position gameState = case gameScreen gameState of
  MainMenuScreen -> handleMenuClick position gameState
  LobbyScreen -> handleLobbyClick position gameState
  RankingScreen -> handleRankingClick position gameState
  InGameScreen -> gameState

handleMenuClick :: (Float, Float) -> GameState -> GameState
handleMenuClick (x, y) gameState
  | menuJoinOpen menuState && inRect x y 0 52 420 118 = focus RoomCodeField gameState
  | menuJoinOpen menuState && inRect x y 0 (-104) 430 108 = beginOrJoin gameState
  | menuJoinOpen menuState && inRect x y 0 (-230) 360 90 = closeRoomSearch gameState
  | not (menuJoinOpen menuState) && inRect x y 0 (-45) 430 108 = beginJoining gameState
  | not (menuJoinOpen menuState) && inRect x y 0 (-160) 430 108 = createLobby gameState
  | not (menuJoinOpen menuState) && inRect x y 0 (-270) 360 90 = requestExit gameState
  | otherwise = gameState
  where
    menuState = gameMenu gameState

handleLobbyClick :: (Float, Float) -> GameState -> GameState
handleLobbyClick (x, y) gameState
  | inRect x y 0 55 380 100 = focus PlayerNameField gameState
  | inRect x y 0 (-42) 250 70 = saveLobbyName gameState
  | inRect x y (-465) (-220) 140 140 = selectHull gameState
  | inRect x y (-300) (-220) 125 140 = selectGun gameState
  | inRect x y 300 105 400 130 = selectMap gameState
  | inRect x y 300 (-120) 430 110 = startPreview gameState
  | inRect x y 300 (-245) 430 110 = returnToPreviousScreen gameState
  | otherwise = gameState

handleRankingClick :: (Float, Float) -> GameState -> GameState
handleRankingClick (x, y) gameState
  | inRect x y (-260) (-322) 155 58 = createLobby gameState
  | inRect x y 0 (-322) 155 58 = beginJoining (gameState { gameScreen = MainMenuScreen })
  | inRect x y 260 (-322) 135 58 = returnToMainMenu gameState
  | otherwise = gameState

createLobby :: GameState -> GameState
createLobby gameState = enqueue CreateRoom (gameState
  { gameScreen = LobbyScreen
  , gamePreviousScreen = Just (gameScreen gameState)
  , gameMenu = (gameMenu gameState) { menuFocusedField = PlayerNameField, menuJoinOpen = False }
  , gameLobby = lobbyState
  , gameNotice = Nothing
  })
  where
    menuState = gameMenu gameState
    localPlayer = LobbyPlayer (menuPlayerName menuState) Hull01 RedTank True True
    lobbyState = (gameLobby gameState)
      { lobbyRoomCode = "LOCAL01"
      , lobbySelectedHull = Hull01
      , lobbySelectedGun = Gun01
      , lobbySelectedColour = RedTank
      , lobbyPlayers = localPlayer : filter (not . lobbyIsLocal) (lobbyPlayers (gameLobby gameState))
      }

joinLobby :: GameState -> GameState
joinLobby gameState = enqueue command (gameState
  { gameScreen = LobbyScreen
  , gamePreviousScreen = Just (gameScreen gameState)
  , gameMenu = (gameMenu gameState) { menuFocusedField = PlayerNameField, menuJoinOpen = False }
  , gameLobby = lobbyState
  , gameNotice = Nothing
  })
  where
    menuState = gameMenu gameState
    roomCode = menuRoomCode menuState
    command = JoinRoom roomCode (nonEmpty (menuRoomPassword menuState))
    localPlayer = LobbyPlayer (menuPlayerName menuState) (lobbySelectedHull (gameLobby gameState)) (lobbySelectedColour (gameLobby gameState)) True True
    lobbyState = (gameLobby gameState)
      { lobbyRoomCode = roomCode
      , lobbyPlayers = localPlayer : filter (not . lobbyIsLocal) (lobbyPlayers (gameLobby gameState))
      }

beginOrJoin :: GameState -> GameState
beginOrJoin gameState
  | menuJoinOpen menuState && not (null (menuRoomCode menuState)) = joinLobby gameState
  | otherwise = beginJoining gameState
  where
    menuState = gameMenu gameState

beginJoining :: GameState -> GameState
beginJoining gameState = gameState { gameMenu = menuState { menuFocusedField = RoomCodeField, menuJoinOpen = True }, gameNotice = Nothing }
  where
    menuState = gameMenu gameState

saveLobbyName :: GameState -> GameState
saveLobbyName gameState = enqueue (SetDisplayName (menuPlayerName menuState)) updatedState
  where
    menuState = gameMenu gameState
    updatedState = updateLocalName (gameState { gameMenu = menuState { menuFocusedField = RoomCodeField }, gameNotice = Nothing })

startPreview :: GameState -> GameState
startPreview gameState = enqueue StartMatch (gameState
  { gameScreen = InGameScreen
  , gamePreviousScreen = Just (gameScreen gameState)
  , gameMap = mapForTheme (lobbySelectedMap (gameLobby gameState))
  , gameNotice = Nothing
  })

selectHull :: GameState -> GameState
selectHull gameState = enqueue (SelectTankHull selected) (updateLocalTank updatedState)
  where
    selected = nextHull (lobbySelectedHull (gameLobby gameState))
    updatedState = gameState { gameLobby = (gameLobby gameState) { lobbySelectedHull = selected } }

selectGun :: GameState -> GameState
selectGun gameState = gameState { gameLobby = lobbyState }
  where
    lobbyState = (gameLobby gameState) { lobbySelectedGun = nextGun (lobbySelectedGun (gameLobby gameState)) }

selectMap :: GameState -> GameState
selectMap gameState = enqueue (SelectMapTheme selected) (gameState { gameLobby = lobbyState })
  where
    lobbyState = (gameLobby gameState) { lobbySelectedMap = selected }
    selected = nextMap (lobbySelectedMap (gameLobby gameState))

updateLocalName :: GameState -> GameState
updateLocalName gameState = gameState { gameLobby = lobbyState }
  where
    updatedName = menuPlayerName (gameMenu gameState)
    lobbyState = (gameLobby gameState) { lobbyPlayers = map setName (lobbyPlayers (gameLobby gameState)) }
    setName player
      | lobbyIsLocal player = player { lobbyPlayerName = updatedName }
      | otherwise = player

updateLocalTank :: GameState -> GameState
updateLocalTank gameState = gameState { gameLobby = lobbyState }
  where
    selectedHull = lobbySelectedHull (gameLobby gameState)
    selectedColour = lobbySelectedColour (gameLobby gameState)
    lobbyState = (gameLobby gameState) { lobbyPlayers = map setTank (lobbyPlayers (gameLobby gameState)) }
    setTank player
      | lobbyIsLocal player = player { lobbyTankHull = selectedHull, lobbyTankColour = selectedColour }
      | otherwise = player

setMovement :: Char -> Bool -> GameState -> GameState
setMovement character isPressed gameState
  | gameScreen gameState /= InGameScreen = gameState
  | otherwise = gameState { gameInput = updatedInput }
  where
    currentInput = gameInput gameState
    updatedInput = case toLower character of
      'w' -> currentInput { inputMoveUp = isPressed }
      's' -> currentInput { inputMoveDown = isPressed }
      'a' -> currentInput { inputMoveLeft = isPressed }
      'd' -> currentInput { inputMoveRight = isPressed }
      _ -> currentInput

setFire :: Bool -> GameState -> GameState
setFire isPressed gameState
  | gameScreen gameState /= InGameScreen = gameState
  | otherwise = gameState { gameInput = (gameInput gameState) { inputFire = isPressed } }

setAim :: (Float, Float) -> GameState -> GameState
setAim (screenX, screenY) gameState = gameState
  { gameCursorScreen = Vec2 screenX screenY
  , gameInput = (gameInput gameState) { inputAimWorld = Vec2 worldX worldY }
  }
  where
    Camera (Vec2 cameraX cameraY) zoom = gameCamera gameState
    safeZoom = max 0.1 zoom
    worldX = (screenX + cameraX) / safeZoom
    worldY = (screenY + cameraY) / safeZoom

changeZoom :: Float -> GameState -> GameState
changeZoom amount gameState
  | gameScreen gameState /= InGameScreen = gameState
  | otherwise = gameState { gameCamera = camera { cameraZoom = max 0.45 (min 1.75 (cameraZoom camera + amount)) } }
  where
    camera = gameCamera gameState

leaveCurrentScreen :: GameState -> GameState
leaveCurrentScreen gameState = case gameScreen gameState of
  MainMenuScreen
    | menuJoinOpen (gameMenu gameState) -> closeRoomSearch gameState
    | otherwise -> requestExit gameState
  _ -> returnToPreviousScreen gameState

closeRoomSearch :: GameState -> GameState
closeRoomSearch gameState = gameState
  { gameMenu = (gameMenu gameState) { menuRoomCode = "", menuFocusedField = RoomCodeField, menuJoinOpen = False }
  , gameNotice = Nothing
  }

returnToPreviousScreen :: GameState -> GameState
returnToPreviousScreen gameState = gameState
  { gameScreen = previousScreen
  , gamePreviousScreen = Nothing
  , gameMenu = (gameMenu gameState) { menuFocusedField = RoomCodeField, menuJoinOpen = False }
  , gameNotice = Nothing
  , gameExitRequested = False
  }
  where
    previousScreen = case gamePreviousScreen gameState of
      Just screen -> screen
      Nothing -> MainMenuScreen

returnToMainMenu :: GameState -> GameState
returnToMainMenu gameState = gameState
  { gameScreen = MainMenuScreen
  , gamePreviousScreen = Nothing
  , gameMenu = (gameMenu gameState) { menuFocusedField = RoomCodeField, menuJoinOpen = False }
  , gameNotice = Nothing
  , gameExitRequested = False
  }

requestExit :: GameState -> GameState
requestExit gameState = gameState { gameExitRequested = True }

focus :: TextField -> GameState -> GameState
focus field gameState = gameState { gameMenu = (gameMenu gameState) { menuFocusedField = field } }

enqueue :: ClientCommand -> GameState -> GameState
enqueue command gameState = gameState { gamePendingCommands = gamePendingCommands gameState <> [command] }

appendLimited :: Int -> Char -> String -> String
appendLimited maximumLength character value
  | length value >= maximumLength = value
  | otherwise = value <> [character]

dropLast :: String -> String
dropLast [] = []
dropLast value = init value

nextHull :: TankHull -> TankHull
nextHull hull = case hull of
  Hull01 -> Hull02
  Hull02 -> Hull05
  Hull05 -> Hull01

nextGun :: TankGun -> TankGun
nextGun gun = case gun of
  Gun01 -> Gun05
  Gun05 -> Gun06
  Gun06 -> Gun01

nextMap :: MapTheme -> MapTheme
nextMap mapTheme = case mapTheme of
  DepotMap -> ForestMap
  ForestMap -> RuinsMap
  RuinsMap -> DepotMap

nonEmpty :: String -> Maybe String
nonEmpty [] = Nothing
nonEmpty value = Just value

toUpperCode :: Char -> Char
toUpperCode character
  | character >= 'a' && character <= 'z' = toEnum (fromEnum character - 32)
  | otherwise = character

inRect :: Float -> Float -> Float -> Float -> Float -> Float -> Bool
inRect x y centreX centreY width height =
  abs (x - centreX) <= width / 2 && abs (y - centreY) <= height / 2
