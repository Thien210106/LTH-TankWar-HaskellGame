/*
 * Temporary, browser-only match settings.
 *
 * This file deliberately contains the local test knobs only: the real online
 * room, map choice, simulation and random-map policy remain server concerns.
 * Remove this file together with the offline test flow when that server path is
 * ready; app.js falls back to its original logical canvas values.
 */
window.TankWarTestGame = Object.freeze({
  enabled: true,
  // The 4096px world is viewed through the existing 832×576 logical canvas.
  // .2 shows five times as much terrain in the browser test.
  cameraZoom: 0.2,
  // The browser test uses half-size tanks, including matching collision.
  tankRenderScale: 0.5,
  collisionRadius: 60,
  // These values are strictly for the browser-only bot practice path.
  // They do not affect map selection, simulation or visibility on the server.
  enemyVisibilityRadius: 1120,
  playerRespawnSeconds: 5,
  magazineSize: 6,
  reloadSeconds: 2.2,
  winKills: 6,
  // This is only the temporary local-bot fallback. Online map randomness is
  // intentionally left to the Haskell server and is not exposed in the UI.
  defaultMapId: 'forest',
  localBotNames: Object.freeze(['CPU-ALPHA', 'CPU-BRAVO', 'CPU-DELTA']),
  localMapIds: Object.freeze(['forest', 'ruins', 'depot'])
});
