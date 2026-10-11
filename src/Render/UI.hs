module Render.UI
  ( renderGame
  ) where

import qualified Data.Map.Strict as Map
import Graphics.Gloss

import Assets
import Render.Map
import Render.Player
import Types

renderGame :: Assets -> GameState -> Picture
renderGame assets gameState = Pictures
  [ screenPicture
  , renderCursor assets gameState
  ]
  where
    screenPicture = case gameScreen gameState of
      MainMenuScreen -> renderMainMenu assets gameState
      LobbyScreen -> renderLobby assets gameState
      InGameScreen -> renderInGame assets gameState
      RankingScreen -> renderRanking assets gameState

renderMainMenu :: Assets -> GameState -> Picture
renderMainMenu assets gameState = Pictures (Scale 0.75 0.68 (assetMenuBackground assets) : controls)
  where
    menuState = gameMenu gameState
    controls
      | menuJoinOpen menuState =
          [ Translate 0 52 (Scale 0.17 0.17 (assetNameInputFrame assets))
          , roomCodePicture
          , Translate 0 (-104) (Scale 0.17 0.17 (assetJoinRoomButton assets))
          , Translate 0 (-230) (Scale 0.14 0.14 (assetExitButton assets))
          ]
      | otherwise =
          [ Translate 0 (-45) (Scale 0.17 0.17 (assetJoinRoomButton assets))
          , Translate 0 (-160) (Scale 0.17 0.17 (assetCreateRoomButton assets))
          , Translate 0 (-270) (Scale 0.14 0.14 (assetExitButton assets))
          ]
    roomCode = menuRoomCode menuState
    roomCodePicture
      | null roomCode = blank
      | otherwise = textAt (centredX 0 roomCode 0.13) 43 0.13 white roomCode

renderLobby :: Assets -> GameState -> Picture
renderLobby assets gameState = Pictures
  [ Scale 0.75 0.68 (assetMenuBackground assets)
  , Translate 0 55 (Scale 0.15 0.15 (assetNameInputFrame assets))
  , localNamePicture
  , Translate 0 (-42) (Scale 0.105 0.105 (assetSetNameButton assets))
  , Translate (-330) 35 (renderTankLoadoutPreview assets (lobbySelectedHull lobby) (lobbySelectedGun lobby) (lobbySelectedColour lobby) 0.9)
  , Translate (-465) (-220) (renderHullPreview assets (lobbySelectedHull lobby) (lobbySelectedColour lobby) 0.36)
  , selectionArrows (-465) (-220) 58
  , Translate (-300) (-220) (renderGunPreview assets (lobbySelectedGun lobby) (lobbySelectedColour lobby) 0.48)
  , selectionArrows (-300) (-220) 48
  , Translate 300 105 (Scale 0.14 0.14 selectedMapPicture)
  , selectionArrows 300 105 172
  , Translate 300 (-120) (Scale 0.13 0.13 (assetCreateRoomButton assets))
  , Translate 300 (-245) (Scale 0.13 0.13 (assetExitButton assets))
  ]
  where
    lobby = gameLobby gameState
    localName = menuPlayerName (gameMenu gameState)
    selectedMapPicture = Map.findWithDefault blank (lobbySelectedMap lobby) (assetMapNameplates assets)
    localNamePicture
      | null localName = blank
      | otherwise = textAt (centredX 0 localName 0.12) 46 0.12 white localName

selectionArrows :: Float -> Float -> Float -> Picture
selectionArrows x y offset = Pictures
  [ Translate (x - offset) y (Color (makeColor 1 0.85 0.26 1) (Polygon [(-9, 0), (7, 10), (7, -10)]))
  , Translate (x + offset) y (Color (makeColor 1 0.85 0.26 1) (Polygon [(9, 0), (-7, 10), (-7, -10)]))
  ]

renderInGame :: Assets -> GameState -> Picture
renderInGame assets gameState = Pictures
  [ renderMap assets (gameCamera gameState) (gameMap gameState)
  , applyCamera (gameCamera gameState) (renderPlayers assets displayedTanks)
  , renderAmmo assets
  ]
  where
    displayedTanks = map updateLocalName (worldTanks (gameWorld gameState))
    ownName = localPlayerName gameState
    updateLocalName tank
      | viewTankId tank == worldLocalPlayerId (gameWorld gameState) && not (null ownName) = tank { viewTankName = ownName }
      | otherwise = tank

renderAmmo :: Assets -> Picture
renderAmmo assets = Translate 560 250 (Scale 0.055 0.055 zeroPicture)
  where
    zeroPicture = Map.findWithDefault blank 0 (assetDigits assets)

renderRanking :: Assets -> GameState -> Picture
renderRanking assets gameState = Pictures
  [ Scale 0.6 0.6 (assetRankingPanel assets)
  , renderChampion assets gameState entries
  , Pictures (zipWith (renderEntry assets gameState) rowPositions entries)
  , Translate (-260) (-322) (Scale 0.06 0.06 (assetCreateRoomButton assets))
  , Translate 0 (-322) (Scale 0.06 0.06 (assetJoinRoomButton assets))
  , Translate 260 (-322) (Scale 0.06 0.06 (assetExitButton assets))
  ]
  where
    entries = take 4 (gameRanking gameState)
    rowPositions = [101, 17, -67, -151]

renderChampion :: Assets -> GameState -> [RankingEntry] -> Picture
renderChampion assets gameState entries = case filter ((== 1) . rankingPlacement) entries of
  entry : _ -> Translate (-215) (-48) (renderTankPreview assets championHull (rankingColour entry) 0.6)
  [] -> blank
  where
    championHull = case filter ((== championName) . lobbyPlayerName) (lobbyPlayers (gameLobby gameState)) of
      player : _ -> lobbyTankHull player
      [] -> lobbySelectedHull (gameLobby gameState)
    championName = case filter ((== 1) . rankingPlacement) entries of
      entry : _ -> rankingPlayer entry
      [] -> ""

renderEntry :: Assets -> GameState -> Float -> RankingEntry -> Picture
renderEntry assets gameState y entry = Pictures
  [ Translate 253 y (Scale 0.19 0.19 band)
  , textAt 62 (y - 8) 0.105 (makeColor 1 0.86 0.28 1) (show (rankingPlacement entry))
  , textAt 135 (y - 8) 0.105 white (rankingPlayer entry)
  , textAt 380 (y - 8) 0.105 white (show (rankingKills entry))
  ]
  where
    ownName = localPlayerName gameState
    band
      | rankingPlacement entry == 1 = assetRankingWinnerLabel assets
      | not (null ownName) && rankingPlayer entry == ownName = assetRankingSelfLabel assets
      | otherwise = assetRankingOtherLabel assets

localPlayerName :: GameState -> PlayerName
localPlayerName gameState
  | not (null (menuPlayerName menuState)) = menuPlayerName menuState
  | otherwise = case filter lobbyIsLocal (lobbyPlayers (gameLobby gameState)) of
      player : _ -> lobbyPlayerName player
      [] -> ""
  where
    menuState = gameMenu gameState

renderCursor :: Assets -> GameState -> Picture
renderCursor assets gameState = Translate (cursorX + 17) (cursorY - 17) (Scale 0.04 0.04 cursorPicture)
  where
    Vec2 cursorX cursorY = gameCursorScreen gameState
    cursorPicture
      | inputFire (gameInput gameState) = assetPressedCursor assets
      | otherwise = assetCursor assets

centredX :: Float -> String -> Float -> Float
centredX centre value scaleFactor = centre - fromIntegral (length value) * scaleFactor * 42

textAt :: Float -> Float -> Float -> Color -> String -> Picture
textAt x y scaleFactor textColour value = Translate x y (Scale scaleFactor scaleFactor (Color textColour (Text value)))
