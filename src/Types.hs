{-# LANGUAGE DeriveGeneric #-}

module Types
  ( PlayerName
  , RoomCode
  , GridPos
  , Vec2(..)
  , UIScreen(..)
  , TextField(..)
  , TankHull(..)
  , TankGun(..)
  , TankColour(..)
  , MapTheme(..)
  , TerrainLayer(..)
  , Decoration(..)
  , TileInfo(..)
  , GameMap
  , Camera(..)
  , defaultCamera
  , LocalInput(..)
  , emptyLocalInput
  , MenuState(..)
  , defaultMenuState
  , LobbyPlayer(..)
  , LobbyState(..)
  , defaultLobbyState
  , TankView(..)
  , BulletView(..)
  , ItemIndicator(..)
  , WorldView(..)
  , emptyWorldView
  , RankingEntry(..)
  , ClientCommand(..)
  , ServerResponse(..)
  , SoundEffect(..)
  , AssetLoadFailure(..)
  , GameState(..)
  , initialGameState
  ) where

import Data.Map.Strict (Map)
import GHC.Generics (Generic)

type PlayerName = String
type RoomCode = String
type GridPos = (Int, Int)

data Vec2 = Vec2
  { vecX :: !Float
  , vecY :: !Float
  } deriving (Show, Read, Eq, Generic)

data UIScreen
  = MainMenuScreen
  | LobbyScreen
  | InGameScreen
  | RankingScreen
  deriving (Show, Read, Eq, Ord, Enum, Bounded, Generic)

data TextField
  = PlayerNameField
  | RoomCodeField
  | RoomPasswordField
  deriving (Show, Read, Eq, Ord, Enum, Bounded, Generic)

data TankHull
  = Hull01
  | Hull02
  | Hull05
  deriving (Show, Read, Eq, Ord, Enum, Bounded, Generic)

data TankGun
  = Gun01
  | Gun05
  | Gun06
  deriving (Show, Read, Eq, Ord, Enum, Bounded, Generic)

data TankColour
  = RedTank
  | BlueTank
  | GreenTank
  | YellowTank
  deriving (Show, Read, Eq, Ord, Enum, Bounded, Generic)

data MapTheme
  = DepotMap
  | ForestMap
  | RuinsMap
  deriving (Show, Read, Eq, Ord, Enum, Bounded, Generic)

data TerrainLayer
  = TerrainTile !Int
  | RoadTile !Int
  deriving (Show, Read, Eq, Ord, Generic)

data Decoration = PropTile !Int
  deriving (Show, Read, Eq, Ord, Generic)

data TileInfo = TileInfo
  { tileTheme       :: !MapTheme
  , tileTerrain     :: !TerrainLayer
  , tileDecoration  :: !(Maybe Decoration)
  } deriving (Show, Read, Eq, Generic)

type GameMap = Map GridPos TileInfo

data Camera = Camera
  { cameraCentre :: !Vec2
  , cameraZoom   :: !Float
  } deriving (Show, Read, Eq, Generic)

defaultCamera :: Camera
defaultCamera = Camera (Vec2 0 0) 1.0

data LocalInput = LocalInput
  { inputMoveUp     :: !Bool
  , inputMoveDown   :: !Bool
  , inputMoveLeft   :: !Bool
  , inputMoveRight  :: !Bool
  , inputAimWorld   :: !Vec2
  , inputFire       :: !Bool
  } deriving (Show, Read, Eq, Generic)

emptyLocalInput :: LocalInput
emptyLocalInput = LocalInput False False False False (Vec2 0 0) False

data MenuState = MenuState
  { menuPlayerName   :: !PlayerName
  , menuRoomCode     :: !RoomCode
  , menuRoomPassword :: !String
  , menuFocusedField :: !TextField
  , menuJoinOpen     :: !Bool
  } deriving (Show, Read, Eq, Generic)

defaultMenuState :: MenuState
defaultMenuState = MenuState "" "" "" RoomCodeField False

data LobbyPlayer = LobbyPlayer
  { lobbyPlayerName :: !PlayerName
  , lobbyTankHull   :: !TankHull
  , lobbyTankColour :: !TankColour
  , lobbyIsLocal    :: !Bool
  , lobbyIsReady    :: !Bool
  } deriving (Show, Read, Eq, Generic)

data LobbyState = LobbyState
  { lobbyRoomCode      :: !RoomCode
  , lobbySelectedHull  :: !TankHull
  , lobbySelectedGun   :: !TankGun
  , lobbySelectedColour :: !TankColour
  , lobbySelectedMap   :: !MapTheme
  , lobbyPlayers       :: ![LobbyPlayer]
  } deriving (Show, Read, Eq, Generic)

defaultLobbyState :: LobbyState
defaultLobbyState = LobbyState "" Hull01 Gun01 RedTank DepotMap []

data TankView = TankView
  { viewTankId          :: !String
  , viewTankName        :: !PlayerName
  , viewTankPosition    :: !Vec2
  , viewTankBodyAngle   :: !Float
  , viewTankTurretAngle :: !Float
  , viewTankHull        :: !TankHull
  , viewTankColour      :: !TankColour
  , viewTankHealth      :: !Float
  , viewTankMaxHealth   :: !Float
  , viewTankKills       :: !Int
  , viewTankAlive       :: !Bool
  } deriving (Show, Read, Eq, Generic)

data BulletView = BulletView
  { viewBulletPosition :: !Vec2
  , viewBulletAngle    :: !Float
  , viewBulletStyle    :: !String
  } deriving (Show, Read, Eq, Generic)

data ItemIndicator
  = NoItem
  | ShieldItem
  | BombItem
  | MysteryWeapon !String !Float
  deriving (Show, Read, Eq, Generic)

data WorldView = WorldView
  { worldLocalPlayerId :: !String
  , worldTanks         :: ![TankView]
  , worldBullets       :: ![BulletView]
  , worldItems         :: ![(Vec2, ItemIndicator)]
  , worldScore         :: !Int
  } deriving (Show, Read, Eq, Generic)

emptyWorldView :: WorldView
emptyWorldView = WorldView "" [] [] [] 0

data RankingEntry = RankingEntry
  { rankingPlacement :: !Int
  , rankingPlayer    :: !PlayerName
  , rankingColour    :: !TankColour
  , rankingKills     :: !Int
  , rankingLabel     :: !String
  } deriving (Show, Read, Eq, Generic)

data ClientCommand
  = SetDisplayName !PlayerName
  | CreateRoom
  | JoinRoom !RoomCode !(Maybe String)
  | SelectTankHull !TankHull
  | SelectTankColour !TankColour
  | SelectMapTheme !MapTheme
  | StartMatch
  | LeaveRoom
  | SendLocalInput !LocalInput
  | RequestRanking
  deriving (Show, Read, Eq, Generic)

data ServerResponse
  = LobbyUpdated !LobbyState
  | WorldUpdated !GameMap !WorldView
  | RankingUpdated ![RankingEntry]
  | ServerNotice !String
  | ServerRejected !String
  deriving (Show, Read, Eq, Generic)

data SoundEffect
  = MenuMusic
  | InGameMusic
  | EndScreenMusic
  | ClickSound
  | TankMoveSound
  | ShootSound
  | LaserSound
  | GatlingSound
  | WallPiercingSound
  | HitSound
  | ItemPickupSound
  | VictorySound
  | DefeatSound
  | CountdownSound
  | RankSound
  deriving (Show, Read, Eq, Ord, Enum, Bounded, Generic)

data AssetLoadFailure = AssetLoadFailure
  { missingAssetPath :: !FilePath
  } deriving (Show, Read, Eq, Generic)

data GameState = GameState
  { gameScreen          :: !UIScreen
  , gamePreviousScreen  :: !(Maybe UIScreen)
  , gameMenu            :: !MenuState
  , gameLobby           :: !LobbyState
  , gameMap             :: !GameMap
  , gameWorld           :: !WorldView
  , gameCamera          :: !Camera
  , gameCursorScreen    :: !Vec2
  , gameInput           :: !LocalInput
  , gameRanking         :: ![RankingEntry]
  , gamePendingCommands :: ![ClientCommand]
  , gameLastResponse    :: !(Maybe ServerResponse)
  , gameNotice          :: !(Maybe String)
  , gameExitRequested   :: !Bool
  } deriving (Show, Read, Eq, Generic)

initialGameState :: GameState
initialGameState = GameState
  { gameScreen = MainMenuScreen
  , gamePreviousScreen = Nothing
  , gameMenu = defaultMenuState
  , gameLobby = defaultLobbyState
  , gameMap = mempty
  , gameWorld = emptyWorldView
  , gameCamera = defaultCamera
  , gameCursorScreen = Vec2 0 0
  , gameInput = emptyLocalInput
  , gameRanking = []
  , gamePendingCommands = []
  , gameLastResponse = Nothing
  , gameNotice = Nothing
  , gameExitRequested = False
  }
