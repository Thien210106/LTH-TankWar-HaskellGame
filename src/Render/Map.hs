module Render.Map
  ( renderMap
  , renderMapWorld
  , applyCamera
  , mapForTheme
  , forestPreviewMap
  , depotPreviewMap
  , ruinsPreviewMap
  ) where

import qualified Data.Map.Strict as Map
import Graphics.Gloss

import Assets
import Types

tileSize :: Float
tileSize = 64

renderMap :: Assets -> Camera -> GameMap -> Picture
renderMap assets camera gameMap = applyCamera camera (renderMapWorld assets (visibleTiles camera gameMap))

renderMapWorld :: Assets -> GameMap -> Picture
renderMapWorld assets gameMap = Pictures (map renderTile (Map.toAscList gameMap))
  where
    renderTile (gridPos, tileInfo) = renderTileAt assets gridPos tileInfo

visibleTiles :: Camera -> GameMap -> GameMap
visibleTiles (Camera (Vec2 cameraX cameraY) zoomLevel) = Map.filterWithKey isVisible
  where
    safeZoom = max 0.1 zoomLevel
    halfWidth = 760
    halfHeight = 480
    isVisible (gridX, gridY) _ =
      abs (fromIntegral gridX * tileSize * safeZoom - cameraX) <= halfWidth &&
      abs (fromIntegral gridY * tileSize * safeZoom - cameraY) <= halfHeight

applyCamera :: Camera -> Picture -> Picture
applyCamera (Camera (Vec2 px py) zoomLevel) worldPicture =
  Translate (-px) (-py) (Scale zoomLevel zoomLevel worldPicture)

mapForTheme :: MapTheme -> GameMap
mapForTheme mapTheme = case mapTheme of
  ForestMap -> forestPreviewMap
  DepotMap -> depotPreviewMap
  RuinsMap -> ruinsPreviewMap

forestPreviewMap :: GameMap
forestPreviewMap = mapFromLayout forestTile forestLayout

depotPreviewMap :: GameMap
depotPreviewMap = mapFromLayout depotTile depotLayout

ruinsPreviewMap :: GameMap
ruinsPreviewMap = mapFromLayout ruinsTile ruinsLayout

mapFromLayout :: (Char -> TileInfo) -> [String] -> GameMap
mapFromLayout tileFor rows = Map.fromList
  [ ((x - halfWidth, halfHeight - y), tileFor cell)
  | (y, row) <- zip [0 ..] rows
  , (x, cell) <- zip [0 ..] row
  ]
  where
    halfWidth = maximum (0 : map length rows) `div` 2
    halfHeight = length rows `div` 2

assemble :: [[[String]]] -> [String]
assemble = concatMap joinBlockRow
  where
    joinBlockRow = foldr1 (zipWith (++))

forestTile :: Char -> TileInfo
forestTile cell = case cell of
  's' -> TileInfo ForestMap (TerrainTile 31) Nothing
  'w' -> TileInfo ForestMap (TerrainTile 45) Nothing
  't' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 20))
  'n' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 21))
  'd' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 15))
  'l' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 16))
  'k' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 17))
  'o' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 2))
  'a' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 3))
  'b' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 10))
  'f' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 7))
  'h' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 22))
  'x' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 23))
  'm' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 24))
  'c' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 26))
  'r' -> TileInfo ForestMap (TerrainTile 17) (Just (PropTile 27))
  _ -> TileInfo ForestMap (TerrainTile 17) Nothing

depotTile :: Char -> TileInfo
depotTile cell = case cell of
  'c' -> TileInfo DepotMap (TerrainTile 2) Nothing
  'm' -> TileInfo DepotMap (TerrainTile 3) Nothing
  'k' -> TileInfo DepotMap (TerrainTile 1) (Just (PropTile 1))
  'w' -> TileInfo DepotMap (TerrainTile 1) (Just (PropTile 5))
  'b' -> TileInfo DepotMap (TerrainTile 2) (Just (PropTile 10))
  _ -> TileInfo DepotMap (TerrainTile 1) Nothing

ruinsTile :: Char -> TileInfo
ruinsTile cell = case cell of
  's' -> TileInfo RuinsMap (TerrainTile 2) Nothing
  'c' -> TileInfo RuinsMap (TerrainTile 4) Nothing
  'v' -> TileInfo RuinsMap (TerrainTile 1) (Just (PropTile 14))
  'w' -> TileInfo RuinsMap (TerrainTile 1) (Just (PropTile 5))
  'o' -> TileInfo RuinsMap (TerrainTile 1) (Just (PropTile 20))
  'b' -> TileInfo RuinsMap (TerrainTile 1) (Just (PropTile 10))
  _ -> TileInfo RuinsMap (TerrainTile 1) Nothing

forestLayout :: [String]
forestLayout = assemble
  [ [ forestNorthA, forestNorthB, forestNorthC, forestNorthA, forestNorthB, forestNorthC, forestNorthA, forestNorthB ]
  , [ forestWestA, forestMeadowA, forestMeadowB, forestPatchA, forestPatchB, forestMeadowC, forestMeadowA, forestEastA ]
  , [ forestWestB, forestGroveA, forestMeadowC, forestMeadowA, forestMeadowB, forestGroveB, forestMeadowA, forestEastB ]
  , [ forestWestA, forestOutpostA, forestMeadowB, forestGroveA, forestMeadowC, forestOutpostB, forestMeadowB, forestEastA ]
  , [ forestWestB, forestMeadowC, forestGroveB, forestMeadowA, forestGroveA, forestMeadowB, forestOutpostA, forestEastB ]
  , [ forestWestA, forestOutpostB, forestMeadowA, forestMeadowC, forestPatchA, forestGroveB, forestMeadowC, forestEastA ]
  , [ forestWestB, forestMeadowB, forestGroveA, forestMeadowA, forestMeadowB, forestPatchB, forestMeadowA, forestEastB ]
  , [ forestSouthA, forestSouthB, forestSouthC, forestSouthA, forestSouthB, forestSouthC, forestSouthA, forestSouthB ]
  ]

forestNorthA :: [String]
forestNorthA =
  [ "tttdtttt"
  , "tggggggt"
  , "tggoaggt"
  , "tggggggt"
  , "tggbgggt"
  , "tggggggt"
  , "tggggggt"
  , "ttggggtt"
  ]

forestNorthB :: [String]
forestNorthB =
  [ "ttnttttt"
  , "tggggggt"
  , "tgggggot"
  , "tggfgggt"
  , "tggggggt"
  , "tggggggt"
  , "tggsgggt"
  , "ttggggtt"
  ]

forestNorthC :: [String]
forestNorthC =
  [ "ttttdttt"
  , "tggggggt"
  , "tgaagggt"
  , "tggggggt"
  , "tggggbgt"
  , "tggggggt"
  , "tgggggot"
  , "ttggggtt"
  ]

forestSouthA :: [String]
forestSouthA = reverse forestNorthB

forestSouthB :: [String]
forestSouthB = reverse forestNorthC

forestSouthC :: [String]
forestSouthC = reverse forestNorthA

forestWestA :: [String]
forestWestA =
  [ "tttttttt"
  , "tggggggg"
  , "tggggggo"
  , "tggbgggg"
  , "tggggggg"
  , "tggggfgg"
  , "tggggggg"
  , "tttttttt"
  ]

forestWestB :: [String]
forestWestB =
  [ "tttttttt"
  , "tggggggg"
  , "tggoggag"
  , "tggggggg"
  , "tgggdggg"
  , "tggggggg"
  , "tgggbggg"
  , "tttttttt"
  ]

forestEastA :: [String]
forestEastA = map reverse forestWestB

forestEastB :: [String]
forestEastB = map reverse forestWestA

forestMeadowA :: [String]
forestMeadowA =
  [ "gggggggg"
  , "gggggggg"
  , "gggogggg"
  , "gggggggg"
  , "ggggbggg"
  , "gggggggg"
  , "gggggggg"
  , "gggggggg"
  ]

forestMeadowB :: [String]
forestMeadowB =
  [ "gggggggg"
  , "gggggggg"
  , "ggggggfg"
  , "gggggggg"
  , "ggggaggg"
  , "gggggggg"
  , "gggggggg"
  , "gggggggg"
  ]

forestMeadowC :: [String]
forestMeadowC =
  [ "gggggggg"
  , "gggggggg"
  , "gggggggg"
  , "ggsggggg"
  , "gggggggg"
  , "gggggggo"
  , "gggggggg"
  , "gggggggg"
  ]

forestPatchA :: [String]
forestPatchA =
  [ "wwwwwwww"
  , "wwwwwwww"
  , "wwwwswww"
  , "wwwwwwww"
  , "wwwowwww"
  , "wwwwwwww"
  , "wwwwwwww"
  , "wwwwwwww"
  ]

forestPatchB :: [String]
forestPatchB =
  [ "wwwwwwww"
  , "wwwwwwww"
  , "wwwwwwww"
  , "wwwbwwww"
  , "wwwwwwww"
  , "wwwwwwww"
  , "wwwwawww"
  , "wwwwwwww"
  ]

forestGroveA :: [String]
forestGroveA =
  [ "gggggggg"
  , "ggtggtgg"
  , "gggggggg"
  , "gngggtgg"
  , "gggggggg"
  , "ggtggggg"
  , "gggggngg"
  , "gggggggg"
  ]

forestGroveB :: [String]
forestGroveB =
  [ "gggggggg"
  , "gggtgggg"
  , "ggggggng"
  , "gggggggg"
  , "ggtggtgg"
  , "gggggggg"
  , "gngggggg"
  , "gggggggg"
  ]

forestOutpostA :: [String]
forestOutpostA =
  [ "gggggggg"
  , "gggggggg"
  , "gggmgggg"
  , "ggggcggg"
  , "gghhhggg"
  , "ggggrggg"
  , "gggggggg"
  , "gggggggg"
  ]

forestOutpostB :: [String]
forestOutpostB =
  [ "gggggggg"
  , "gggggggg"
  , "ggggxggg"
  , "ggglkggg"
  , "gggggggg"
  , "gghhhggg"
  , "ggggcggg"
  , "gggggggg"
  ]

depotLayout :: [String]
depotLayout = assemble
  [ [ depotEdge, depotEdge, depotOpen, depotOpen, depotOpen, depotOpen, depotEdge, depotEdge ]
  , [ depotEdge, depotContainers, depotOpen, depotBarriers, depotBarriers, depotOpen, depotContainers, depotEdge ]
  , [ depotOpen, depotOpen, depotContainers, depotOpen, depotOpen, depotContainers, depotOpen, depotOpen ]
  , [ depotOpen, depotBarriers, depotOpen, depotYard, depotYard, depotOpen, depotBarriers, depotOpen ]
  , [ depotOpen, depotBarriers, depotOpen, depotYard, depotYard, depotOpen, depotBarriers, depotOpen ]
  , [ depotOpen, depotOpen, depotContainers, depotOpen, depotOpen, depotContainers, depotOpen, depotOpen ]
  , [ depotEdge, depotContainers, depotOpen, depotBarriers, depotBarriers, depotOpen, depotContainers, depotEdge ]
  , [ depotEdge, depotEdge, depotOpen, depotOpen, depotOpen, depotOpen, depotEdge, depotEdge ]
  ]

depotOpen :: [String]
depotOpen =
  [ "mmmmmmmm"
  , "mmmmmmmm"
  , "mmmccmmm"
  , "mmmccmmm"
  , "mmmmmmmm"
  , "mmmmmmmm"
  , "mmmmmmmm"
  , "mmmmmmmm"
  ]

depotEdge :: [String]
depotEdge =
  [ "wwwwwwww"
  , "wmmmmmmw"
  , "wmmmmmmw"
  , "wmmccmmw"
  , "wmmccmmw"
  , "wmmmmmmw"
  , "wmmmmmmw"
  , "wwwwwwww"
  ]

depotContainers :: [String]
depotContainers =
  [ "mmmmmmmm"
  , "mmkkkkmm"
  , "mmmmmmmm"
  , "mmkkkkmm"
  , "mmmmmmmm"
  , "mmkkkkmm"
  , "mmmmmmmm"
  , "mmmmmmmm"
  ]

depotBarriers :: [String]
depotBarriers =
  [ "mmmmmmmm"
  , "mwwwwwwm"
  , "mmmmmmmm"
  , "mmmmmmmm"
  , "mwwwwwwm"
  , "mmmmmmmm"
  , "mmmmmmmm"
  , "mwwwwwwm"
  ]

depotYard :: [String]
depotYard =
  [ "mmmmmmmm"
  , "mmmbbmmm"
  , "mmmmmmmm"
  , "mkkmmmmk"
  , "mkkmmmmk"
  , "mmmmmmmm"
  , "mmmbbmmm"
  , "mmmmmmmm"
  ]

ruinsLayout :: [String]
ruinsLayout = assemble
  [ [ ruinsEdge, ruinsOpen, ruinsOpen, ruinsVillage, ruinsVillage, ruinsOpen, ruinsOpen, ruinsEdge ]
  , [ ruinsOpen, ruinsVillage, ruinsOpen, ruinsWalls, ruinsWalls, ruinsOpen, ruinsVillage, ruinsOpen ]
  , [ ruinsOpen, ruinsOpen, ruinsCars, ruinsOpen, ruinsOpen, ruinsCars, ruinsOpen, ruinsOpen ]
  , [ ruinsVillage, ruinsWalls, ruinsOpen, ruinsSquare, ruinsSquare, ruinsOpen, ruinsWalls, ruinsVillage ]
  , [ ruinsVillage, ruinsWalls, ruinsOpen, ruinsSquare, ruinsSquare, ruinsOpen, ruinsWalls, ruinsVillage ]
  , [ ruinsOpen, ruinsOpen, ruinsCars, ruinsOpen, ruinsOpen, ruinsCars, ruinsOpen, ruinsOpen ]
  , [ ruinsOpen, ruinsVillage, ruinsOpen, ruinsWalls, ruinsWalls, ruinsOpen, ruinsVillage, ruinsOpen ]
  , [ ruinsEdge, ruinsOpen, ruinsOpen, ruinsVillage, ruinsVillage, ruinsOpen, ruinsOpen, ruinsEdge ]
  ]

ruinsOpen :: [String]
ruinsOpen =
  [ "ssssssss"
  , "ssssssss"
  , "sssccsss"
  , "sssccsss"
  , "ssssssss"
  , "ssssssss"
  , "ssssssss"
  , "ssssssss"
  ]

ruinsEdge :: [String]
ruinsEdge =
  [ "oooooooo"
  , "osssssso"
  , "osssssso"
  , "ossccsso"
  , "ossccsso"
  , "osssssso"
  , "osssssso"
  , "oooooooo"
  ]

ruinsVillage :: [String]
ruinsVillage =
  [ "ssssssss"
  , "swwsswws"
  , "swssssws"
  , "ssssssss"
  , "sssbbsss"
  , "ssssssss"
  , "swwsswws"
  , "ssssssss"
  ]

ruinsWalls :: [String]
ruinsWalls =
  [ "ssssssss"
  , "swwwwwws"
  , "ssssssss"
  , "ssssssss"
  , "swwwwwws"
  , "ssssssss"
  , "ssssssss"
  , "swwwwwws"
  ]

ruinsCars :: [String]
ruinsCars =
  [ "ssssssss"
  , "sssvvsss"
  , "ssssssss"
  , "ssssssss"
  , "ssssssss"
  , "sssvvsss"
  , "ssssssss"
  , "ssssssss"
  ]

ruinsSquare :: [String]
ruinsSquare =
  [ "ssssssss"
  , "sssoosss"
  , "ssssssss"
  , "sssvvsss"
  , "sssvvsss"
  , "ssssssss"
  , "sssoosss"
  , "ssssssss"
  ]

renderTileAt :: Assets -> GridPos -> TileInfo -> Picture
renderTileAt assets (gridX, gridY) TileInfo { tileTheme = theme, tileTerrain = terrain, tileDecoration = decoration } =
  Translate x y (Pictures [terrainPicture, decorationPicture])
  where
    x = fromIntegral gridX * tileSize
    y = fromIntegral gridY * tileSize
    themeAssets = Map.findWithDefault emptyTheme theme (assetThemes assets)
    terrainPicture = Scale 0.25 0.25 (terrainAsset themeAssets terrain)
    decorationPicture = case decoration of
      Nothing -> blank
      Just (PropTile propNumber) -> Scale 0.25 0.25 (Map.findWithDefault blank propNumber (themeProps themeAssets))

terrainAsset :: ThemeAssets -> TerrainLayer -> Picture
terrainAsset themeAssets terrain = case terrain of
  TerrainTile terrainNumber -> Map.findWithDefault blank terrainNumber (themeTerrain themeAssets)
  RoadTile roadNumber -> Map.findWithDefault blank roadNumber (themeRoads themeAssets)

emptyTheme :: ThemeAssets
emptyTheme = ThemeAssets Map.empty Map.empty Map.empty
