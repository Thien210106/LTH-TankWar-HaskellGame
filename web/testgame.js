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
  // The 4096px world is viewed through the existing 832x576 logical canvas.
  // .2 shows five times as much terrain in the browser test.
  cameraZoom: 0.2,
  // The browser test uses half-size tanks, including matching collision.
  tankRenderScale: 0.5,
  collisionRadius: 60,

  // ---- Engagement range -------------------------------------------------
  // 1 stud = 1 maze cell. Enemies are visible (and bots shoot) up to this many
  // studs away. It was ~3.2 studs; now 4.5 (allowed range: 4 to 5).
  rangeStuds: 4.5,

  // ---- Respawn / spawn protection / magazine ------------------------------
  playerRespawnSeconds: 5,            // dead time before respawning
  respawnInvulnerableSeconds: 1.5,    // immunity right after respawn
  magazineSize: 6,                    // a respawned tank always starts with a full magazine
  reloadSeconds: 2.2,                 // press R (or empty magazine) to reload

  // ---- Scoring -----------------------------------------------------------
  survivalPointsPerSecond: 3,         // +3 for each full second alive (dead = no points)
  killPoints: 10,                     // +10 per tank destroyed
  shutdownBonus: 20,                  // +20 extra for ending an enemy streak
  streakStartKills: 3,                // an enemy counts as "on a streak" from this many kills without dying
  multiKillWindowSeconds: 10,         // kills inside this window chain: Double, Triple, Quadra, Penta (max)

  // Local test match ends after this many kills by the player.
  winKills: 20,

  // This is only the temporary local-bot fallback. Online map randomness is
  // intentionally left to the Haskell server and is not exposed in the UI.
  defaultMapId: 'forest',
  localBotNames: Object.freeze(['CPU-ALPHA', 'CPU-BRAVO', 'CPU-DELTA']),
  localMapIds: Object.freeze(['forest', 'ruins', 'depot'])
});
