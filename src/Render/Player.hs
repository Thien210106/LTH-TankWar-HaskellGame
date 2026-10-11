module Render.Player
  ( renderPlayers
  , renderPlayer
  , renderTankPreview
  , renderTankLoadoutPreview
  , renderHullPreview
  , renderGunPreview
  ) where

import Graphics.Gloss

import Assets
import Types

renderPlayers :: Assets -> [TankView] -> Picture
renderPlayers assets = Pictures . map (renderPlayer assets)

renderPlayer :: Assets -> TankView -> Picture
renderPlayer assets tank
  | not (viewTankAlive tank) = blank
  | otherwise = Translate x y (Pictures [selectionRing, hullPicture, turretPicture, aimLine, healthBar, nameLabel])
  where
    Vec2 x y = viewTankPosition tank
    hullAngle = radiansToDegrees (viewTankBodyAngle tank)
    turretAngle = radiansToDegrees (viewTankTurretAngle tank)
    tint = tankTint (viewTankColour tank)
    hullPicture = Rotate hullAngle (Color tint (Scale 0.25 0.25 (hullSprite assets (viewTankHull tank))))
    turretPicture = Rotate turretAngle (Color tint (Scale 0.25 0.25 (gunSprite assets (gunForHull (viewTankHull tank)))))
    aimLine = Rotate turretAngle (Color (makeColor 1 0.86 0.28 0.8) (Line [(0, 12), (0, 47)]))
    selectionRing = Color (withAlpha 0.7 tint) (ThickCircle 34 2)
    healthBar = renderHealthBar (viewTankHealth tank) (viewTankMaxHealth tank)
    nameLabel = renderName (viewTankName tank)

renderTankPreview :: Assets -> TankHull -> TankColour -> Float -> Picture
renderTankPreview assets hull colour = renderTankLoadoutPreview assets hull (gunForHull hull) colour

renderTankLoadoutPreview :: Assets -> TankHull -> TankGun -> TankColour -> Float -> Picture
renderTankLoadoutPreview assets hull gun colour scaleFactor = Pictures
  [ Color tint (Scale scaleFactor scaleFactor (hullSprite assets hull))
  , Color tint (Scale scaleFactor scaleFactor (gunSprite assets gun))
  ]
  where
    tint = tankTint colour

renderHullPreview :: Assets -> TankHull -> TankColour -> Float -> Picture
renderHullPreview assets hull colour scaleFactor = Color (tankTint colour) (Scale scaleFactor scaleFactor (hullSprite assets hull))

renderGunPreview :: Assets -> TankGun -> TankColour -> Float -> Picture
renderGunPreview assets gun colour scaleFactor = Color (tankTint colour) (Scale scaleFactor scaleFactor (gunSprite assets gun))

hullSprite :: Assets -> TankHull -> Picture
hullSprite assets hull = case hull of
  Hull01 -> assetTankHull01 assets
  Hull02 -> assetTankHull02 assets
  Hull05 -> assetTankHull05 assets

gunSprite :: Assets -> TankGun -> Picture
gunSprite assets gun = case gun of
  Gun01 -> assetTankGun01 assets
  Gun05 -> assetTankGun05 assets
  Gun06 -> assetTankGun06 assets

gunForHull :: TankHull -> TankGun
gunForHull hull = case hull of
  Hull01 -> Gun01
  Hull02 -> Gun05
  Hull05 -> Gun06

tankTint :: TankColour -> Color
tankTint tankColour = case tankColour of
  RedTank -> makeColor 1 0.38 0.34 1
  BlueTank -> makeColor 0.36 0.66 1 1
  GreenTank -> makeColor 0.43 1 0.55 1
  YellowTank -> makeColor 1 0.86 0.3 1

renderHealthBar :: Float -> Float -> Picture
renderHealthBar health maximumHealth = Translate 0 48 (Pictures [background, foreground])
  where
    ratio
      | maximumHealth <= 0 = 0
      | otherwise = max 0 (min 1 (health / maximumHealth))
    totalWidth = 62
    filledWidth = totalWidth * ratio
    background = Color (makeColor 1 1 1 0.7) (rectangleWire totalWidth 8)
    foreground = Translate ((filledWidth - totalWidth) / 2) 0 (Color (makeColor 0.25 0.95 0.37 1) (rectangleSolid filledWidth 5))

renderName :: PlayerName -> Picture
renderName playerName
  | null playerName = blank
  | otherwise = Translate offset 61 (Scale 0.12 0.12 (Color white (Text playerName)))
  where
    offset = negate (fromIntegral (length playerName) * 4.7)

radiansToDegrees :: Float -> Float
radiansToDegrees radians = radians * 180 / pi
