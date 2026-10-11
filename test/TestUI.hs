{-# LANGUAGE ForeignFunctionInterface #-}

module Main where

import Data.IORef
import Foreign.C.Types (CInt(..))
import Graphics.Gloss
import Graphics.Gloss.Interface.IO.Game (playIO)
import Graphics.Gloss.Interface.Pure.Game
import System.Exit (exitSuccess)

import Assets
import Input
import Render.Map
import Render.UI
import Sound
import Types

foreign import ccall unsafe "ShowCursor"
  setSystemCursorVisible :: CInt -> IO CInt

main :: IO ()
main = do
  (assets, _) <- loadAssets
  cursorHidden <- newIORef False
  triggerSound (assetSounds assets) MenuMusic
  playIO window backgroundColor 60 demoState (renderFrame assets cursorHidden) (handleEvent assets) stepDemo
  showSystemCursor

renderFrame :: Assets -> IORef Bool -> GameState -> IO Picture
renderFrame assets cursorHidden gameState = do
  isHidden <- readIORef cursorHidden
  if isHidden
    then pure ()
    else hideSystemCursor >> writeIORef cursorHidden True
  pure (renderGame assets gameState)

window :: Display
window = InWindow "TankWar UI Test" (1280, 720) (80, 60)

backgroundColor :: Color
backgroundColor = makeColor 0.025 0.045 0.055 1

handleEvent :: Assets -> Event -> GameState -> IO GameState
handleEvent assets event gameState = case event of
  EventKey (MouseButton LeftButton) Down _ _
    | gameScreen gameState /= InGameScreen -> triggerSound sounds ClickSound >> finish (handleInput event gameState)
  EventKey (Char '1') Down _ _ -> triggerSound sounds MenuMusic >> pure (gameState { gameScreen = MainMenuScreen, gamePreviousScreen = Nothing, gameMenu = (gameMenu gameState) { menuJoinOpen = False }, gameNotice = Nothing, gameExitRequested = False })
  EventKey (Char '2') Down _ _ -> triggerSound sounds ClickSound >> pure (gameState { gameScreen = LobbyScreen, gamePreviousScreen = Just (gameScreen gameState), gameMenu = (gameMenu gameState) { menuFocusedField = PlayerNameField }, gameNotice = Nothing, gameExitRequested = False })
  EventKey (Char '3') Down _ _ -> activateMap ForestMap InGameMusic
  EventKey (Char '4') Down _ _ -> triggerSound sounds EndScreenMusic >> triggerSound sounds RankSound >> pure (gameState { gameScreen = RankingScreen, gamePreviousScreen = Just (gameScreen gameState), gameNotice = Nothing, gameExitRequested = False })
  EventKey (Char '5') Down _ _ -> activateMap DepotMap InGameMusic
  EventKey (Char '6') Down _ _ -> activateMap RuinsMap InGameMusic
  EventKey (Char 'S') Down _ _ -> triggerSound sounds ClickSound >> pure gameState
  EventKey (Char 's') Down _ _
    | gameScreen gameState /= InGameScreen -> triggerSound sounds ClickSound >> pure gameState
  _ -> finish (handleInput event gameState)
  where
    sounds = assetSounds assets
    activateMap mapTheme music = triggerSound sounds music >> pure (gameState
      { gameScreen = InGameScreen
      , gamePreviousScreen = Just (gameScreen gameState)
      , gameMap = mapForTheme mapTheme
      , gameLobby = (gameLobby gameState) { lobbySelectedMap = mapTheme }
      , gameNotice = Nothing
      , gameExitRequested = False
      })
    finish updatedState
      | gameExitRequested updatedState = showSystemCursor >> exitSuccess
      | otherwise = pure updatedState

stepDemo :: Float -> GameState -> IO GameState
stepDemo elapsed gameState
  | gameScreen gameState /= InGameScreen = pure gameState
  | otherwise = pure (gameState { gameWorld = updatedWorld, gameCamera = updatedCamera })
  where
    world = gameWorld gameState
    localInput = gameInput gameState
    speed = 190 * elapsed
    horizontal = movementAxis (inputMoveRight localInput) (inputMoveLeft localInput)
    vertical = movementAxis (inputMoveUp localInput) (inputMoveDown localInput)
    updatedTanks = map updateTank (worldTanks world)
    updatedWorld = world { worldTanks = updatedTanks }
    localPosition = case filter ((== worldLocalPlayerId world) . viewTankId) updatedTanks of
      tank : _ -> viewTankPosition tank
      [] -> cameraCentre (gameCamera gameState)
    updatedCamera = (gameCamera gameState) { cameraCentre = scaledPosition (cameraZoom (gameCamera gameState)) localPosition }
    updateTank tank
      | viewTankId tank /= worldLocalPlayerId world = tank
      | otherwise = tank
          { viewTankPosition = movedPosition (viewTankPosition tank)
          , viewTankBodyAngle = bodyAngle tank
          , viewTankTurretAngle = turretAngle tank
          }
    movedPosition (Vec2 x y) = Vec2 (x + horizontal * speed) (y + vertical * speed)
    bodyAngle tank
      | horizontal == 0 && vertical == 0 = viewTankBodyAngle tank
      | otherwise = atan2 vertical horizontal - pi / 2
    turretAngle tank = case (viewTankPosition tank, inputAimWorld localInput) of
      (Vec2 x y, Vec2 aimX aimY) -> atan2 (aimY - y) (aimX - x) - pi / 2

scaledPosition :: Float -> Vec2 -> Vec2
scaledPosition zoomLevel (Vec2 x y) = Vec2 (x * zoomLevel) (y * zoomLevel)

movementAxis :: Bool -> Bool -> Float
movementAxis positive negative = fromIntegral (fromEnum positive - fromEnum negative)

demoState :: GameState
demoState = initialGameState
  { gameMenu = demoMenu
  , gameLobby = demoLobby
  , gameMap = forestPreviewMap
  , gameWorld = demoWorld
  , gameCamera = Camera (Vec2 0 0) 0.9
  , gameRanking = demoRanking
  , gameNotice = Nothing
  }

demoMenu :: MenuState
demoMenu = defaultMenuState

demoLobby :: LobbyState
demoLobby = LobbyState
  { lobbyRoomCode = ""
  , lobbySelectedHull = Hull02
  , lobbySelectedGun = Gun05
  , lobbySelectedColour = BlueTank
  , lobbySelectedMap = ForestMap
  , lobbyPlayers = []
  }

demoWorld :: WorldView
demoWorld = WorldView
  { worldLocalPlayerId = "player-1"
  , worldTanks =
      [ TankView "player-1" "" (Vec2 0 0) 0 0 Hull02 BlueTank 86 100 7 True
      , TankView "player-2" "" (Vec2 (-310) 190) 0.8 1.2 Hull01 RedTank 65 100 5 True
      , TankView "player-3" "" (Vec2 340 (-140)) (-0.7) (-0.4) Hull05 GreenTank 48 100 4 True
      , TankView "player-4" "" (Vec2 155 265) 2.2 1.8 Hull02 YellowTank 94 100 3 True
      ]
  , worldBullets = []
  , worldItems = []
  , worldScore = 12
  }

demoRanking :: [RankingEntry]
demoRanking =
  [ RankingEntry 1 "" BlueTank 7 ""
  , RankingEntry 2 "" RedTank 5 ""
  , RankingEntry 3 "" GreenTank 4 ""
  , RankingEntry 4 "" YellowTank 3 ""
  ]

hideSystemCursor :: IO ()
hideSystemCursor = do
  _ <- setSystemCursorVisible 0
  pure ()

showSystemCursor :: IO ()
showSystemCursor = do
  _ <- setSystemCursorVisible 1
  pure ()
