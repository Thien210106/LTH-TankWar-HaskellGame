module Assets
  ( Assets(..)
  , ThemeAssets(..)
  , SoundAssets(..)
  , loadAssets
  , soundPath
  ) where

import qualified Data.Map.Strict as Map
import Data.Map.Strict (Map)
import Graphics.Gloss (Picture, blank)
import Graphics.Gloss.Juicy (loadJuicyPNG)

import Types (AssetLoadFailure(..), MapTheme(..), SoundEffect(..))

data ThemeAssets = ThemeAssets
  { themeTerrain :: !(Map Int Picture)
  , themeProps   :: !(Map Int Picture)
  , themeRoads   :: !(Map Int Picture)
  }

data SoundAssets = SoundAssets
  { soundMenuMusic     :: !FilePath
  , soundInGameMusic   :: !FilePath
  , soundEndMusic      :: !FilePath
  , soundClick         :: !FilePath
  , soundTankMove      :: !FilePath
  , soundShoot         :: !FilePath
  , soundLaser         :: !FilePath
  , soundGatling       :: !FilePath
  , soundWallPiercing  :: !FilePath
  , soundHit           :: !FilePath
  , soundItemPickup    :: !FilePath
  , soundVictory       :: !FilePath
  , soundDefeat        :: !FilePath
  , soundCountdown     :: !FilePath
  , soundRanking       :: !FilePath
  }

data Assets = Assets
  { assetMenuBackground       :: !Picture
  , assetNameInputFrame       :: !Picture
  , assetSetNameButton        :: !Picture
  , assetCreateRoomButton     :: !Picture
  , assetJoinRoomButton       :: !Picture
  , assetExitButton           :: !Picture
  , assetRankingPanel         :: !Picture
  , assetRankingSelfLabel     :: !Picture
  , assetRankingWinnerLabel   :: !Picture
  , assetRankingOtherLabel    :: !Picture
  , assetMapNameplates        :: !(Map MapTheme Picture)
  , assetTankHull01           :: !Picture
  , assetTankHull02           :: !Picture
  , assetTankHull05           :: !Picture
  , assetTankGun01            :: !Picture
  , assetTankGun05            :: !Picture
  , assetTankGun06            :: !Picture
  , assetShotgunBullet        :: !Picture
  , assetLaserBullet          :: !Picture
  , assetGatlingBullet        :: !Picture
  , assetWallPiercingBullet   :: !Picture
  , assetHeart                :: !Picture
  , assetBomb                 :: !Picture
  , assetShield               :: !Picture
  , assetMysteryBox           :: !Picture
  , assetBrokenMysteryBox     :: !Picture
  , assetDigits               :: !(Map Int Picture)
  , assetCursor               :: !Picture
  , assetPressedCursor        :: !Picture
  , assetExplosionFrames      :: ![Picture]
  , assetLoadingFrames        :: ![Picture]
  , assetWallPiercingEffects  :: ![Picture]
  , assetGatlingEffects       :: ![Picture]
  , assetShotgunEffects       :: ![Picture]
  , assetLaserEffects         :: ![Picture]
  , assetThemes               :: !(Map MapTheme ThemeAssets)
  , assetSounds               :: !SoundAssets
  }

loadAssets :: IO (Assets, [AssetLoadFailure])
loadAssets = do
  (menuBackground, e01) <- loadPNG "assets/images/Menu/Backgroup.png"
  (nameInputFrame, e02) <- loadPNG "assets/images/Menu/ghiten.png"
  (setNameButton, e03) <- loadPNG "assets/images/Menu/datten.png"
  (createRoomButton, e04) <- loadPNG "assets/images/Menu/batdauphong.png"
  (joinRoomButton, e05) <- loadPNG "assets/images/Menu/timphong.png"
  (exitButton, e06) <- loadPNG "assets/images/Menu/exit.png"

  (rankingPanel, e07) <- loadPNG "assets/images/MenuEnd/Leaderboard.png"
  (rankingSelf, e08) <- loadPNG "assets/images/MenuEnd/Banthan.png"
  (rankingWinner, e09) <- loadPNG "assets/images/MenuEnd/Hangnhat.png"
  (rankingOther, e10) <- loadPNG "assets/images/MenuEnd/Nguoikhac.png"

  (depotName, e11) <- loadPNG "assets/images/NameMap/depot.png"
  (forestName, e12) <- loadPNG "assets/images/NameMap/forest.png"
  (ruinsName, e13) <- loadPNG "assets/images/NameMap/ruins.png"

  (hull01, e14) <- loadPNG "assets/images/Tank/Hull_01.png"
  (hull02, e15) <- loadPNG "assets/images/Tank/Hull_02.png"
  (hull05, e16) <- loadPNG "assets/images/Tank/Hull_05.png"
  (gun01, e17) <- loadPNG "assets/images/Tank/Gun_01.png"
  (gun05, e18) <- loadPNG "assets/images/Tank/Gun_05.png"
  (gun06, e19) <- loadPNG "assets/images/Tank/Gun_06.png"

  (shotgunBullet, e20) <- loadPNG "assets/images/Bullet/Shotgun_Bullet.png"
  (laserBullet, e21) <- loadPNG "assets/images/Bullet/Laser_Bullet.png"
  (gatlingBullet, e22) <- loadPNG "assets/images/Bullet/Tieulien_Bullet.png"
  (wallPiercingBullet, e23) <- loadPNG "assets/images/Bullet/Xuyentuong_Bullet.png"

  (heart, e24) <- loadPNG "assets/images/Tym,Bomb,Khien,MysteryBox/Tym2.png"
  (bomb, e25) <- loadPNG "assets/images/Tym,Bomb,Khien,MysteryBox/bomb.png"
  (shield, e26) <- loadPNG "assets/images/Tym,Bomb,Khien,MysteryBox/khien.png"
  (mysteryBox, e27) <- loadPNG "assets/images/Tym,Bomb,Khien,MysteryBox/mysterybox.png"
  (brokenMysteryBox, e28) <- loadPNG "assets/images/Tym,Bomb,Khien,MysteryBox/mysteryboxbroken.png"

  (cursor, e29) <- loadPNG "assets/images/clickmouse/mousenormal.png"
  (pressedCursor, e30) <- loadPNG "assets/images/clickmouse/pressmouse.png"

  (digits, e31) <- loadNumbered "assets/images/Number" "" 0 9
  (explosions, e32) <- loadFrames "assets/images/Explosion/Sprite_Effects_Explosion_" 0 8
  (loading, e33) <- loadLoadingFrames
  (wallPiercingEffects, e34) <- loadFrames "assets/images/Bullet/HieuungXuyentuong/Sprite_Fire_Shots_Shot_A_" 0 3
  (gatlingEffects, e35) <- loadFrames "assets/images/Bullet/HieuungTieulien/Sprite_Effects_Exhaust_01_" 0 2
  (shotgunEffects, e36) <- loadFrames "assets/images/Bullet/HieuungShotgun/Sprite_Fire_Shots_Impact_A_" 1 3
  (laserEffects, e37) <- loadFrames "assets/images/Bullet/HieuungLaser/Sprite_Fire_Shots_Shot_B_" 0 2

  (depotAssets, e38) <- loadTheme "assets/images/Map/depot_assets" 30 20 0
  (forestAssets, e39) <- loadTheme "assets/images/Map/forest_assets" 61 27 11
  (ruinsAssets, e40) <- loadTheme "assets/images/Map/ruins_assets" 30 20 0

  let assets = Assets
        { assetMenuBackground = menuBackground
        , assetNameInputFrame = nameInputFrame
        , assetSetNameButton = setNameButton
        , assetCreateRoomButton = createRoomButton
        , assetJoinRoomButton = joinRoomButton
        , assetExitButton = exitButton
        , assetRankingPanel = rankingPanel
        , assetRankingSelfLabel = rankingSelf
        , assetRankingWinnerLabel = rankingWinner
        , assetRankingOtherLabel = rankingOther
        , assetMapNameplates = Map.fromList
            [ (DepotMap, depotName), (ForestMap, forestName), (RuinsMap, ruinsName) ]
        , assetTankHull01 = hull01
        , assetTankHull02 = hull02
        , assetTankHull05 = hull05
        , assetTankGun01 = gun01
        , assetTankGun05 = gun05
        , assetTankGun06 = gun06
        , assetShotgunBullet = shotgunBullet
        , assetLaserBullet = laserBullet
        , assetGatlingBullet = gatlingBullet
        , assetWallPiercingBullet = wallPiercingBullet
        , assetHeart = heart
        , assetBomb = bomb
        , assetShield = shield
        , assetMysteryBox = mysteryBox
        , assetBrokenMysteryBox = brokenMysteryBox
        , assetDigits = digits
        , assetCursor = cursor
        , assetPressedCursor = pressedCursor
        , assetExplosionFrames = explosions
        , assetLoadingFrames = loading
        , assetWallPiercingEffects = wallPiercingEffects
        , assetGatlingEffects = gatlingEffects
        , assetShotgunEffects = shotgunEffects
        , assetLaserEffects = laserEffects
        , assetThemes = Map.fromList
            [ (DepotMap, depotAssets), (ForestMap, forestAssets), (RuinsMap, ruinsAssets) ]
        , assetSounds = SoundAssets
            { soundMenuMusic = "assets/sounds/backgroundmenu.mp3"
            , soundInGameMusic = "assets/sounds/musicongame.mp3"
            , soundEndMusic = "assets/sounds/backgroundmenuend.mp3"
            , soundClick = "assets/sounds/clickmouse.mp3"
            , soundTankMove = "assets/sounds/tankmove.mp3"
            , soundShoot = "assets/sounds/shot sound/sungshot.mp3"
            , soundLaser = "assets/sounds/shot sound/laser.mp3"
            , soundGatling = "assets/sounds/shot sound/tieulien.mp3"
            , soundWallPiercing = "assets/sounds/shot sound/xuyentuong.mp3"
            , soundHit = "assets/sounds/explosion.mp3"
            , soundItemPickup = "assets/sounds/claimitem.mp3"
            , soundVictory = "assets/sounds/gamewinner.mp3"
            , soundDefeat = "assets/sounds/gameover.mp3"
            , soundCountdown = "assets/sounds/coutdown.mp3"
            , soundRanking = "assets/sounds/rank.mp3"
            }
        }
      failures = concat
        [ e01, e02, e03, e04, e05, e06, e07, e08, e09, e10
        , e11, e12, e13, e14, e15, e16, e17, e18, e19, e20
        , e21, e22, e23, e24, e25, e26, e27, e28, e29, e30
        , e31, e32, e33, e34, e35, e36, e37, e38, e39, e40
        ]
  pure (assets, failures)

loadPNG :: FilePath -> IO (Picture, [AssetLoadFailure])
loadPNG path = do
  picture <- loadJuicyPNG path
  pure $ case picture of
    Just value -> (value, [])
    Nothing    -> (blank, [AssetLoadFailure path])

loadTheme :: FilePath -> Int -> Int -> Int -> IO (ThemeAssets, [AssetLoadFailure])
loadTheme directory terrainCount propCount roadCount = do
  (terrain, terrainFailures) <- loadNumbered directory "terrain" 1 terrainCount
  (props, propFailures) <- loadNumbered directory "prop" 1 propCount
  (roads, roadFailures) <- loadNumbered directory "road" 1 roadCount
  pure (ThemeAssets terrain props roads, terrainFailures <> propFailures <> roadFailures)

loadNumbered :: FilePath -> String -> Int -> Int -> IO (Map Int Picture, [AssetLoadFailure])
loadNumbered directory stem first last = do
  loaded <- traverse loadOne [first .. last]
  pure (Map.fromList [(number, picture) | (number, picture, _) <- loaded], concatMap third loaded)
  where
    loadOne number = do
      let filename
            | null stem = show number <> ".png"
            | otherwise = stem <> "_" <> padded number <> ".png"
          path = directory <> "/" <> filename
      (picture, failures) <- loadPNG path
      pure (number, picture, failures)

    third (_, _, value) = value

loadFrames :: FilePath -> Int -> Int -> IO ([Picture], [AssetLoadFailure])
loadFrames prefix first last = do
  loaded <- traverse (loadPNG . framePath) [first .. last]
  pure (map fst loaded, concatMap snd loaded)
  where
    framePath frame = prefix <> padded frame <> ".png"

loadLoadingFrames :: IO ([Picture], [AssetLoadFailure])
loadLoadingFrames = do
  loaded <- traverse (loadPNG . pathFor) [1 .. 8]
  pure (map fst loaded, concatMap snd loaded)
  where
    pathFor frame = "assets/images/Loading/Loading" <> show frame <> ".png"

padded :: Int -> String
padded number
  | number < 10 = '0' : show number
  | otherwise = show number

soundPath :: SoundAssets -> SoundEffect -> FilePath
soundPath sounds effect = case effect of
  MenuMusic         -> soundMenuMusic sounds
  InGameMusic       -> soundInGameMusic sounds
  EndScreenMusic    -> soundEndMusic sounds
  ClickSound        -> soundClick sounds
  TankMoveSound     -> soundTankMove sounds
  ShootSound        -> soundShoot sounds
  LaserSound        -> soundLaser sounds
  GatlingSound      -> soundGatling sounds
  WallPiercingSound -> soundWallPiercing sounds
  HitSound          -> soundHit sounds
  ItemPickupSound   -> soundItemPickup sounds
  VictorySound      -> soundVictory sounds
  DefeatSound       -> soundDefeat sounds
  CountdownSound    -> soundCountdown sounds
  RankSound         -> soundRanking sounds
