/* TankWar browser client. No frontend build step is required.
 * Online protocol mirrors Common.Protocol.hs (Aeson Generic tagged encoding).
 * The offline practice mode uses the same canvas renderer but a local simulator
 * driven by the JSON map layouts in assets/maps.
 */
(() => {
  'use strict';

  let WORLD_W = 1344;
  let WORLD_H = 704;
  const TANK_RADIUS = 15;
  const COLORS = {
    TankRed: '#ff655d', TankBlue: '#5ca9ff', TankGreen: '#8ae65e', TankYellow: '#ffd45d',
    red: '#ff655d', blue: '#5ca9ff', green: '#8ae65e', yellow: '#ffd45d'
  };
  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $('home-screen'), map: $('map-screen'), tankSelect: $('tank-select-screen'), lobby: $('lobby-screen'),
    room: $('room-screen'), game: $('game-screen'), results: $('results-screen')
  };
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const input = { up: false, down: false, left: false, right: false, fire: false, mouseX: WORLD_W / 2, mouseY: WORLD_H / 2, reloadRequest: false, reloadPulse: false };
  const imageFiles = {
    hull: 'assets/img/tank-hull.png', gun: 'assets/img/tank-gun.png',
    box: 'assets/img/mystery-box.png'
  };
  const images = {};
  Object.entries(imageFiles).forEach(([name, src]) => {
    const im = new Image();
    im.src = src;
    images[name] = im;
  });
  // Hull / gun picked in the garage. Other tanks keep the default sprites.
  const partImages = {};
  function partImage(kind, id) {
    const key = `${kind}_${id}`;
    if (!partImages[key]) {
      const im = new Image();
      im.src = `assets/tanks/${kind}_${String(id).padStart(2, '0')}.png`;
      partImages[key] = im;
    }
    return partImages[key];
  }
  function spritesFor(tankId) {
    if (isMe(String(tankId || ''))) {
      const hull = partImage('hull', selectedHullId), gun = partImage('gun', selectedGunId);
      return { hull: hull.complete && hull.naturalWidth ? hull : images.hull, gun: gun.complete && gun.naturalWidth ? gun : images.gun };
    }
    return { hull: images.hull, gun: images.gun };
  }
  const hudImages = {};
  Array.from({ length: 10 }, (_, digit) => digit).forEach(digit => {
    const image = new Image();
    image.src = `assets/hud/numbers/${digit}.png`;
    hudImages[`digit-${digit}`] = image;
  });
  Array.from({ length: 8 }, (_, index) => index + 1).forEach(frame => {
    const image = new Image();
    image.src = `assets/hud/loading/Loading${frame}.png`;
    hudImages[`loading-${frame}`] = image;
  });

  let screenName = 'home';
  let mode = 'none';
  let ws = null;
  let wsReady = false;
  let loggedIn = false;
  let displayName = '';
  let username = '';
  let activeRoom = null;
  let isHost = false;
  let roomPlayerNames = [];
  let roomList = [];
  let latestSnapshot = null;
  let inputTimer = null;
  let animationId = null;
  let lastFrameTime = 0;
  let fpsFrameCount = 0;
  let fpsLast = performance.now();
  let soundEnabled = true;
  let audioUnlocked = false;
  let currentMusic = '';
  let lastCountdownSecond = null;
  let roundOverlayAction = null;
  let localGame = null;
  let localMap = null;
  let selectedMapId = 'forest';
  let selectedTankColor = 'TankRed';
  let selectedHullId = '05';
  let selectedGunId = '05';
  let tankLoadoutConfirmed = false;
  let tankSelectReturn = 'home';
  let mapLoadError = '';
  let lastOnlineUiUpdate = 0;
  let isPaused = false;
  let musicScale = 1;
  let matchClockStart = 0;
  let bannerTimer = 0;
  let lastHudUpdate = 0;
  let myDeathAt = 0;
  let myWasAlive = true;
  let lastKillerOfMe = '';
  let tabHeld = false;
  let lastClockBeep = null, minuteWarnKey = null;
  let firstBloodDone = false;
  // Kill announcements (banner + voice) wait in this queue and play one after another.
  const announceQueue = [];
  let announceBusy = false, announceGen = 0, announceTimer = 0;
  const ANNOUNCE_MIN_MS = 1000;   // every announcement stays at least this long, so its banner can be read
  let killAudioCtx = null;
  const killTracker = new Map();
  const streakTracker = new Map();
  const lastKnownStreak = new Map();
  const shotVoices = {};

  const SoundFX = {
    init() {
      if (!audioContext) {
        try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      }
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
      }
    },
    shoot(type) {
      if (!soundEnabled) return;
      this.init();
      if (!audioContext) return;
      try {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        if (type === 'LaserBullet') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(920, now);
          osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.start(now); osc.stop(now + 0.12);
        } else if (type === 'ShotgunBullet') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(250, now);
          osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
          gain.gain.setValueAtTime(0.14, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          osc.start(now); osc.stop(now + 0.18);
        } else if (type === 'GatlingBullet') {
          osc.type = 'square';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.start(now); osc.stop(now + 0.05);
        } else if (type === 'WallPiercingBullet') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(580, now);
          osc.frequency.linearRampToValueAtTime(260, now + 0.14);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
          osc.start(now); osc.stop(now + 0.14);
        } else {
          osc.type = 'square';
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.exponentialRampToValueAtTime(100, now + 0.09);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.start(now); osc.stop(now + 0.09);
        }
      } catch (_) {}
    },
    bounce() {
      if (!soundEnabled) return;
      this.init();
      if (!audioContext) return;
      try {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(750, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.035);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        osc.connect(gain); gain.connect(audioContext.destination);
        osc.start(now); osc.stop(now + 0.035);
      } catch (_) {}
    },
    explosion() {
      if (!soundEnabled) return;
      this.init();
      if (!audioContext) return;
      try {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.35);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain); gain.connect(audioContext.destination);
        osc.start(now); osc.stop(now + 0.35);
      } catch (_) {}
    },
    pickup() {
      if (!soundEnabled) return;
      this.init();
      if (!audioContext) return;
      try {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const t = audioContext.currentTime + i * 0.055;
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.08, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
          osc.connect(gain); gain.connect(audioContext.destination);
          osc.start(t); osc.stop(t + 0.1);
        });
      } catch (_) {}
    },
    countdown(seconds) {
      if (!soundEnabled) return;
      this.init();
      if (!audioContext) return;
      try {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const isStart = Number(seconds) <= 0;
        osc.type = 'sine';
        osc.frequency.value = isStart ? 880 : 440;
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (isStart ? 0.3 : 0.09));
        osc.connect(gain); gain.connect(audioContext.destination);
        osc.start(now); osc.stop(now + (isStart ? 0.3 : 0.09));
      } catch (_) {}
    },
    victory() {
      if (!soundEnabled) return;
      this.init();
      if (!audioContext) return;
      try {
        [440, 554.37, 659.25, 880].forEach((freq, i) => {
          const t = audioContext.currentTime + i * 0.09;
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.1, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain); gain.connect(audioContext.destination);
          osc.start(t); osc.stop(t + 0.22);
        });
      } catch (_) {}
    }
  };
  const trainingMaps = new Map();
  const camera = { x: 0, y: 0 };
  // Online maze data always comes from the server snapshot (wsMaze); this is only a fallback.
  const maze = { mazeWidth: WORLD_W, mazeHeight: WORLD_H, mazeWalls: [] };

  let maze = generateRandomMaze();

  function generateRandomMaze() {
    // Kích thước thế giới bám theo device-width với lưới ô chuẩn cs = 64px (luôn gấp đôi xe tank: 30px * 2)
    const winW = window.innerWidth || document.documentElement.clientWidth || 1344;
    const winH = window.innerHeight || document.documentElement.clientHeight || 704;
    const aspect = Math.max(1.3, Math.min(2.5, winW / winH));

    const cs = 64; // 1 ô lưới = 64px = 2 xe tank (tankRadius = 15 => diameter = 30px)
    const numRows = 11; // h = 704px
    const h = numRows * cs;
    const baseW = Math.round(h * aspect);
    const numCols = Math.max(21, Math.round(baseW / cs));
    const w = numCols * cs;
    WORLD_W = w;
    WORLD_H = h;

    const vec = (x, y) => ({ vx: Math.round(x * cs), vy: Math.round(y * cs) });
    const wall = (x1, y1, x2, y2) => ({ wallStart: vec(x1, y1), wallEnd: vec(x2, y2) });

    // 4 bức tường biên bao quanh chiến trường
    const borderWalls = [
      { wallStart: { vx: 0, vy: 0 }, wallEnd: { vx: w, vy: 0 } },
      { wallStart: { vx: w, vy: 0 }, wallEnd: { vx: w, vy: h } },
      { wallStart: { vx: w, vy: h }, wallEnd: { vx: 0, vy: h } },
      { wallStart: { vx: 0, vy: h }, wallEnd: { vx: 0, vy: 0 } }
    ];

    // Thuật toán sinh mê cung rối cả dọc lẫn ngang:
    // 1. Tường cả dọc cả ngang đan xen nhau tạo góc L, T, ngã tư rối mắt, không song song
    // 2. Luôn có khe hở thoát (mỗi ô luôn có ít nhất 2 lối đi, minDegree >= 2), không bao giờ bị bít kín
    // 3. Toàn bộ mê cung 100% liên thông, không có ngõ cụt hiểm
    // 4. Các đoạn tường được ghép nối thành tường dài
    // 5. Khoảng cách giữa các tường luôn đúng 64px = 2 thân xe tank
    const wallSet = new Set();
    const cols = numCols, rows = numRows;

    function isConnected() {
      const visited = new Set();
      const queue = [{ c: 0, r: 0 }];
      visited.add('0,0');
      while (queue.length > 0) {
        const { c, r } = queue.shift();
        if (r + 1 < rows && !wallSet.has('H:' + c + ',' + (r + 1))) {
          const k = c + ',' + (r + 1); if (!visited.has(k)) { visited.add(k); queue.push({ c, r: r + 1 }); }
        }
        if (r - 1 >= 0 && !wallSet.has('H:' + c + ',' + r)) {
          const k = c + ',' + (r - 1); if (!visited.has(k)) { visited.add(k); queue.push({ c, r: r - 1 }); }
        }
        if (c + 1 < cols && !wallSet.has('V:' + (c + 1) + ',' + r)) {
          const k = (c + 1) + ',' + r; if (!visited.has(k)) { visited.add(k); queue.push({ c: c + 1, r }); }
        }
        if (c - 1 >= 0 && !wallSet.has('V:' + c + ',' + r)) {
          const k = (c - 1) + ',' + r; if (!visited.has(k)) { visited.add(k); queue.push({ c: c - 1, r }); }
        }
      }
      return visited.size === cols * rows;
    }

    function getMinDegree() {
      let minD = 4;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let deg = 0;
          if (r + 1 < rows && !wallSet.has('H:' + c + ',' + (r + 1))) deg++;
          if (r - 1 >= 0 && !wallSet.has('H:' + c + ',' + r)) deg++;
          if (c + 1 < cols && !wallSet.has('V:' + (c + 1) + ',' + r)) deg++;
          if (c - 1 >= 0 && !wallSet.has('V:' + c + ',' + r)) deg++;
          if (deg < minD) minD = deg;
        }
      }
      return minD;
    }

    const hCandidates = [];
    for (let r = 1; r < rows; r++) {
      for (let c = 1; c < cols - 2; c += 2) {
        const len = 2 + Math.floor(Math.random() * 4);
        const endC = Math.min(cols - 1, c + len);
        if (endC - c >= 2) hCandidates.push({ type: 'H', x1: c, y1: r, x2: endC, y2: r });
      }
    }

    const vCandidates = [];
    for (let c = 1; c < cols; c++) {
      for (let r = 1; r < rows - 2; r += 2) {
        const len = 2 + Math.floor(Math.random() * 3);
        const endR = Math.min(rows - 1, r + len);
        if (endR - r >= 2) vCandidates.push({ type: 'V', x1: c, y1: r, x2: c, y2: endR });
      }
    }

    hCandidates.sort(() => Math.random() - 0.5);
    vCandidates.sort(() => Math.random() - 0.5);

    const candidates = [];
    const maxLen = Math.max(hCandidates.length, vCandidates.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < hCandidates.length) candidates.push(hCandidates[i]);
      if (i < vCandidates.length) candidates.push(vCandidates[i]);
    }

    for (const cand of candidates) {
      const addedEdges = [];
      if (cand.type === 'H') {
        for (let x = cand.x1; x < cand.x2; x++) {
          const edge = 'H:' + x + ',' + cand.y1;
          if (!wallSet.has(edge)) { wallSet.add(edge); addedEdges.push(edge); }
        }
      } else {
        for (let y = cand.y1; y < cand.y2; y++) {
          const edge = 'V:' + cand.x1 + ',' + y;
          if (!wallSet.has(edge)) { wallSet.add(edge); addedEdges.push(edge); }
        }
      }
      if (addedEdges.length > 0 && isConnected() && getMinDegree() >= 2) {
        // Chấp nhận đoạn tường
      } else {
        // Hoàn tác để giữ khe hở và bảo đảm đường đi luôn thông suốt
        for (const edge of addedEdges) wallSet.delete(edge);
      }
    }

    // Hợp nhất các đoạn thẳng hàng liền kề thành tường dài mê cung
    const innerWalls = [];
    for (let r = 1; r < rows; r++) {
      let start = null;
      for (let c = 0; c <= cols; c++) {
        if (c < cols && wallSet.has('H:' + c + ',' + r)) {
          if (start === null) start = c;
        } else {
          if (start !== null) {
            innerWalls.push(wall(start, r, c, r));
            start = null;
          }
        }
      }
    }
    for (let c = 1; c < cols; c++) {
      let start = null;
      for (let r = 0; r <= rows; r++) {
        if (r < rows && wallSet.has('V:' + c + ',' + r)) {
          if (start === null) start = r;
        } else {
          if (start !== null) {
            innerWalls.push(wall(c, start, c, r));
            start = null;
          }
        }
      }
    }

    const mazeWalls = [...borderWalls, ...innerWalls];

    // Các điểm spawn thoáng rộng tại tâm các ô hành lang (cách tường 32px)
    const candidateSpawns = [];
    for (let r = 0; r < rows; r += 2) {
      for (let c = 1; c < cols; c += 3) {
        candidateSpawns.push({ vx: Math.round((c + 0.5) * cs), vy: Math.round((r + 0.5) * cs) });
      }
    }

    const mazeSpawnPts = candidateSpawns.filter(pt => {
      return !innerWalls.some(w => pointWallDistance(pt, w) < 26);
    }).sort(() => Math.random() - 0.5);

    if (mazeSpawnPts.length < 4) {
      mazeSpawnPts.push(
        { vx: Math.round(1.5 * cs), vy: Math.round(0.5 * cs) },
        { vx: Math.round((numCols - 1.5) * cs), vy: Math.round(0.5 * cs) },
        { vx: Math.round(1.5 * cs), vy: Math.round((numRows - 0.5) * cs) },
        { vx: Math.round((numCols - 1.5) * cs), vy: Math.round((numRows - 0.5) * cs) }
      );
    }

    const mazeBoxSpawnPts = [
      { vx: Math.round((numCols / 2) * cs), vy: Math.round(5.5 * cs) },
      { vx: Math.round(numCols * 0.25 * cs), vy: Math.round(3.5 * cs) },
      { vx: Math.round(numCols * 0.75 * cs), vy: Math.round(3.5 * cs) },
      { vx: Math.round(numCols * 0.25 * cs), vy: Math.round(7.5 * cs) },
      { vx: Math.round(numCols * 0.75 * cs), vy: Math.round(7.5 * cs) }
    ].filter(pt => !innerWalls.some(w => pointWallDistance(pt, w) < 22));

    if (mazeBoxSpawnPts.length === 0) {
      mazeBoxSpawnPts.push({ vx: Math.round((numCols / 2) * cs), vy: Math.round(5.5 * cs) });
    }

    return { mazeWidth: w, mazeHeight: h, mazeWalls, mazeSpawnPts, mazeBoxSpawnPts };
  }

  function getRandomSpawnPoint(m, existingTanks = []) {
    const spawns = (m && m.mazeSpawnPts) ? m.mazeSpawnPts : [];
    const curW = (m && m.mazeWidth) ? m.mazeWidth : WORLD_W;
    const curH = (m && m.mazeHeight) ? m.mazeHeight : WORLD_H;
    const wallsToCheck = (m && m.mazeWalls) ? m.mazeWalls : (maze && maze.mazeWalls ? maze.mazeWalls : []);

    for (let attempt = 0; attempt < 40; attempt++) {
      let candidate;
      if (attempt < spawns.length) {
        candidate = { ...spawns[attempt] };
      } else {
        const randRow = Math.floor(Math.random() * 11);
        const maxCol = Math.max(2, Math.floor(curW / 64) - 2);
        const randCol = 1.5 + Math.random() * (maxCol - 1.5);
        candidate = {
          vx: Math.round(randCol * 64),
          vy: Math.round((randRow + 0.5) * 64)
        };
      }
      const tooCloseToWall = hitsWall(candidate, TANK_RADIUS + 3, true, wallsToCheck);
      const tooCloseToTank = existingTanks.some(t => t.tankAlive && distance(t.tankPos, candidate) < 70);
      if (!tooCloseToWall && !tooCloseToTank) return candidate;
    }
    if (spawns.length > 0) return { ...spawns[Math.floor(Math.random() * spawns.length)] };
    return { vx: 96, vy: 32 };
  }

  // Win / lose jingle: gamewinner / gameover for free-for-all (and online), gamewinner2 / gameover2 for the team modes
  // (2v2, 3v3, 4v4, 5v5).
  function playEndSfx(won, volume = .66, team = false) {
    playSfx(team ? (won ? 'winner2' : 'gameover2') : (won ? 'winner' : 'gameover'), volume);
  }

  // ---- Full-screen phase overlays (offline): pre-match countdown and the VICTORY / DEFEAT screen ----
  let endSplash = null, countdownBox = null, countdownShown = null;
  function removeCountdownOverlay() { if (countdownBox) { countdownBox.remove(); countdownBox = null; countdownShown = null; } }
  function updateCountdownOverlay(seconds) {
    const n = Math.max(1, Math.ceil(seconds));
    if (!countdownBox) {
      countdownBox = document.createElement('div');
      countdownBox.className = 'phase-overlay countdown';
      countdownBox.innerHTML = '<div class="phase-sub">TRẬN ĐẤU BẮT ĐẦU SAU</div><div class="phase-main"></div>';
      document.body.appendChild(countdownBox);
    }
    if (countdownShown !== n) {
      countdownShown = n;
      const main = countdownBox.querySelector('.phase-main');
      main.textContent = String(n);
      main.classList.remove('tick'); void main.offsetWidth; main.classList.add('tick');   // restart the pulse every second
    }
  }
  function hideEndSplash() { if (endSplash) { clearTimeout(endSplash.timer); endSplash.box.remove(); endSplash = null; } }
  // The match is already frozen (gameOver) when this runs; `proceed` opens the results screen once the player clicks / presses a key.
  function showEndSplash(outcome, proceed) {
    hideEndSplash();
    stopBattleMusic();   // battle music stops immediately...
    if (outcome === 'win') playSfx('endVictory', 1);        // ...and the announcer voice starts together with the splash
    else if (outcome === 'lose') playSfx('endDefeat', 1);
    const box = document.createElement('div');
    box.className = `phase-overlay end ${outcome}`;
    box.innerHTML = '<div class="phase-main"></div><div class="phase-sub" hidden>Nhấn để tiếp tục</div>';
    box.querySelector('.phase-main').textContent = outcome === 'win' ? 'VICTORY' : outcome === 'lose' ? 'DEFEAT' : 'DRAW';
    document.body.appendChild(box);
    const state = { box, ready: false, proceed, timer: 0 };
    state.timer = setTimeout(() => { state.ready = true; box.querySelector('.phase-sub').hidden = false; }, 5000);
    endSplash = state;
  }
  ['keydown', 'keyup', 'mousedown', 'mouseup', 'click', 'contextmenu', 'wheel'].forEach(type => {
    window.addEventListener(type, event => {
      if (!endSplash) return;
      event.stopImmediatePropagation(); event.preventDefault();   // nothing reaches the game while the end screen is up
      if ((type === 'click' || type === 'keydown') && endSplash.ready) { const s = endSplash; hideEndSplash(); s.proceed(); }
    }, true);
  });

  function setMovementSound(isMoving) {
    if (!soundEnabled || !audioUnlocked || !isMoving) {
      movementTrack.pause();
      movementTrack.currentTime = 0;
      return;
    }
    movementTrack.play().catch(() => {});
  }

  function syncMusicForScreen() {
    const wanted = screenName === 'game' ? (battleMusicStopped ? 'silence' : matchPointActive ? matchPointTrack : countdownActive ? 'countdown' : 'game') : screenName === 'results' ? 'results' : 'menu';
    Object.entries(musicTracks).forEach(([name, track]) => {
      if (!soundEnabled || !audioUnlocked || name !== wanted) {
        track.pause();
        if (name !== wanted) track.currentTime = 0;
      }
    });
    if (soundEnabled && audioUnlocked && currentMusic !== wanted) {
      currentMusic = wanted;
      if (wanted === 'game' && gameTrack._list.length > 1) playGameTrack(gameTrack._i + 1);   // each match starts on the next track
      else if (musicTracks[wanted]) musicTracks[wanted].play().catch(() => {});
    } else if (!soundEnabled) {
      currentMusic = '';
    }
  }

  function refreshSoundToggle() {
    const button = $('sound-toggle');
    button.style.color = soundEnabled ? 'var(--lime)' : 'var(--muted)';
    button.textContent = soundEnabled ? '♫' : '♩';
    button.title = soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh';
    button.setAttribute('aria-label', button.title);
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    refreshSoundToggle();
    updatePauseSoundLabel();
    setMovementSound(false);
    syncMusicForScreen();
    if (soundEnabled) playSfx('click', .3);
  }

  // ---------------------------------------------------------------- screens

  function showScreen(name) {
    screenName = name;
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    document.body.classList.toggle('in-game', name === 'game');
    if (name !== 'game') { document.body.classList.remove('mouse-pressed', 'player-dead'); battleMusicStopped = false; }
    if (name === 'game') startRenderLoop();
    else stopRenderLoop();
    syncMusicForScreen();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (name === 'game') {
      hidePauseModal();
      resizeCanvasBacking();
      setTimeout(resizeCanvasBacking, 50);
      setTimeout(resizeCanvasBacking, 180);
      if (mode === 'online') startInputSender();
    } else {
      hidePauseModal();
      stopInputSender();
      stopShotSounds();
      showTabScoreboard(false);
      resizeCanvasBacking();
    }
  }

  // A browser only grants native fullscreen from a user gesture. The local test
  // flow calls this immediately from its confirmation button; CSS still fills
  // the available viewport if a browser declines the native request.
  function enterGameplayFullscreen() {
    const root = document.documentElement;
    if (document.fullscreenElement || !root.requestFullscreen) return;
    root.requestFullscreen().catch(() => {});
  }

  function leaveGameplayFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  function statusPill(state, text) {
    const el = $('connection-pill');
    el.className = `status-pill ${state}`;
    $('connection-text').textContent = text;
  }

  function setError(target, text) {
    const el = $(target);
    el.textContent = text;
    el.hidden = !text;
  }

  // ---------------------------------------------------------------- protocol helpers

  function readField(obj, key) {
    if (!obj || typeof obj !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    // Tolerate both default Aeson record labels (clUsername) and prefix-stripped labels (username).
    const unprefixed = key.length > 2 ? key.slice(2) : key;
    const plain = unprefixed ? unprefixed[0].toLowerCase() + unprefixed.slice(1) : unprefixed;
    if (Object.prototype.hasOwnProperty.call(obj, plain)) return obj[plain];
    return undefined;
  }

  function tagOf(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    if (typeof value.tag === 'string') return value.tag;
    const keys = Object.keys(value);
    if (keys.length === 1) return keys[0];
    return '';
  }

  function contentsOf(msg) {
    if (!msg || typeof msg !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(msg, 'contents')) return msg.contents;
    const keys = Object.keys(msg);
    if (keys.length === 1) return msg[keys[0]];
    if (Object.prototype.hasOwnProperty.call(msg, 'tag')) return msg;
    return undefined;
  }

  function unwrapOne(value) {
    return Array.isArray(value) && value.length === 1 ? value[0] : value;
  }

  function stringPayload(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data) && typeof data[0] === 'string') return data[0];
    if (data && typeof data === 'object') return data.message || data.error || data.contents || '';
    return '';
  }

  function sendMessage(tag, contents) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    let message;
    if (tag === 'CPlayerInput') {
      message = { tag, contents };
    } else if (contents && typeof contents === 'object' && !Array.isArray(contents)) {
      message = { tag, ...contents };
    } else if (contents !== undefined) {
      message = { tag, contents };
    } else {
      message = { tag };
    }
    try { ws.send(JSON.stringify(message)); return true; }
    catch (error) { addFeed(`Không gửi được gói tin: ${error.message}`, 'warn'); return false; }
  }

  // ---------------------------------------------------------------- online connection

  function connectOnline() {
    unlockAudio();
    setError('home-error', '');
    const rawName = $('player-name').value.trim();
    const url = $('server-url').value.trim();
    if (!rawName) { setError('home-error', 'Hãy nhập tên chiến binh trước khi kết nối.'); $('player-name').focus(); return; }
    if (!/^wss?:\/\//i.test(url)) { setError('home-error', 'Địa chỉ server phải bắt đầu bằng ws:// hoặc wss://'); $('server-url').focus(); return; }
    closeSocket(false);
    username = rawName;
    displayName = rawName;
    localStorage.setItem('tankwar-name', rawName);
    localStorage.setItem('tankwar-server', url);
    statusPill('connecting', 'ĐANG KẾT NỐI');
    $('online-button').disabled = true;
    $('online-button').classList.add('is-loading');
    $('online-button').setAttribute('aria-label', 'Đang kết nối tới server');
    let socket;
    try { socket = new WebSocket(url); }
    catch (error) { resetConnectButton(); statusPill('idle', 'CHƯA KẾT NỐI SERVER'); setError('home-error', `Không tạo được kết nối WebSocket: ${error.message}`); return; }
    ws = socket;
    const timeout = window.setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN && ws === socket) {
        socket.close();
        resetConnectButton();
        statusPill('idle', 'CHƯA KẾT NỐI SERVER');
        setError('home-error', 'Không kết nối được server. Hãy kiểm tra server Haskell, MongoDB và cổng 8080.');
      }
    }, 8000);
    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      wsReady = true;
      statusPill('online', 'ĐÃ KẾT NỐI');
      // The server requires CLogin to be the first client message.
      sendMessage('CLogin', { clUsername: rawName, clDisplayName: displayName });
    });
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); }
      catch (_) { addFeed('Server gửi dữ liệu không phải JSON.', 'warn'); return; }
      handleServerMessage(message);
    });
    socket.addEventListener('error', () => {
      statusPill('idle', 'LỖI KẾT NỐI');
      if (screenName === 'home') setError('home-error', 'Kết nối WebSocket thất bại. Kiểm tra địa chỉ và trạng thái server.');
    });
    socket.addEventListener('close', () => {
      if (ws !== socket) return;
      wsReady = false; loggedIn = false; resetConnectButton();
      statusPill('idle', 'ĐÃ NGẮT KẾT NỐI');
      if (screenName === 'game' && mode === 'online') {
        showOverlay('MẤT KẾT NỐI', 'Kết nối tới Haskell server đã đóng.', 'VỀ TRANG CHỦ', () => { closeSocket(false); showScreen('home'); });
      } else if (screenName !== 'home') {
        setError(screenName === 'lobby' ? 'lobby-error' : 'home-error', 'Kết nối server đã đóng. Hãy quay về trang chủ và kết nối lại.');
      }
    });
  }

  function resetConnectButton() {
    $('online-button').disabled = false;
    $('online-button').classList.remove('is-loading');
    $('online-button').setAttribute('aria-label', 'Tìm phòng online');
  }

  function closeSocket(sendLeave = true) {
    if (ws && ws.readyState === WebSocket.OPEN && sendLeave && activeRoom) sendMessage('CLeaveRoom');
    if (ws) { const old = ws; ws = null; try { old.close(); } catch (_) {} }
    wsReady = false; loggedIn = false; activeRoom = null; isHost = false;
    stopInputSender();
  }

  function handleServerMessage(msg) {
    const tag = tagOf(msg);
    const data = contentsOf(msg);
    switch (tag) {
      case 'SLoginSuccess': {
        loggedIn = true;
        const payload = unwrapOne(data);
        if (payload && typeof payload === 'object') {
          username = readField(payload, 'slsUsername') || username;
          displayName = username;
        }
        mode = 'online';
        setError('home-error', '');
        setError('lobby-error', '');
        $('lobby-subtitle').textContent = `Đã đăng nhập với tên ${displayName}. Chọn phòng để vào trận.`;
        showScreen('lobby');
        sendMessage('CListRooms');
        addFeed(`Đã đăng nhập: ${displayName}`);
        break;
      }
      case 'SLoginError':
        setError(screenName === 'lobby' ? 'lobby-error' : 'home-error', stringPayload(data) || 'Server từ chối đăng nhập.');
        resetConnectButton();
        break;
      case 'SRoomList':
        roomList = Array.isArray(data) ? data : (Array.isArray(unwrapOne(data)) ? unwrapOne(data) : []);
        renderRoomList();
        break;
      case 'SRoomCreated':
        activeRoom = unwrapOne(data); isHost = true; onRoomReady(); break;
      case 'SRoomJoined':
        activeRoom = unwrapOne(data); isHost = false; onRoomReady(); break;
      case 'SRoomRoster': {
        const list = Array.isArray(data) ? data : (Array.isArray(unwrapOne(data)) ? unwrapOne(data) : []);
        const hostName = readField(activeRoom, 'riHostPlayer') || (roomPlayerNames[0]?.host ? roomPlayerNames[0].name : username);
        roomPlayerNames = list.map(item => {
          const pName = Array.isArray(item) ? item[0] : (item.name || item.username || 'Người chơi');
          const pColor = Array.isArray(item) ? item[1] : (item.color || 'TankBlue');
          return {
            name: pName,
            color: pColor,
            self: pName === username || pName === displayName,
            host: pName === hostName || (isHost && (pName === username || pName === displayName))
          };
        });
        renderRoomPlayers();
        break;
      }
      case 'SRoomError':
        setError(screenName === 'room' ? 'room-error' : 'lobby-error', stringPayload(data) || 'Thao tác phòng thất bại.');
        break;
      case 'SRoomLeft':
        activeRoom = null; isHost = false; roomPlayerNames = [];
        hideOverlay();
        showScreen('lobby'); sendMessage('CListRooms'); addFeed('Bạn đã rời phòng.');
        break;
      case 'SPlayerJoined': {
        const pair = Array.isArray(data) ? data : [];
        const joinedName = pair[0] || 'Người chơi mới';
        if (!roomPlayerNames.some(p => p.name === joinedName)) roomPlayerNames.push({ name: joinedName, color: pair[1] || 'TankBlue', self: false });
        renderRoomPlayers(); addFeed(`${joinedName} đã vào phòng.`); break;
      }
      case 'SPlayerLeft': {
        const gone = stringPayload(data);
        roomPlayerNames = roomPlayerNames.filter(p => p.name !== gone);
        renderRoomPlayers(); addFeed(`${gone || 'Người chơi'} đã rời phòng.`, 'warn'); break;
      }
      case 'SCountdown': {
        const seconds = Number(Array.isArray(data) ? data[0] : data);
        const countdownSecond = Math.max(0, Math.ceil(seconds || 0));
        lastCountdownSecond = countdownSecond;
        $('countdown-banner').hidden = false;
        $('countdown-banner').textContent = `TRẬN ĐẤU BẮT ĐẦU SAU ${Math.max(0, Math.ceil(seconds || 0))}…`;
        SoundFX.countdown(seconds);
        break;
      }
      case 'SGameSnapshot': {
        latestSnapshot = unwrapOne(data);
        if (mode === 'online' && screenName !== 'game') resetMatchUi();
        trackSnapshot(latestSnapshot);
        if (mode === 'online') {
          const phase = tagOf(readField(latestSnapshot, 'wsPhase'));
          if (phase === 'CountdownPhase') $('phase-label').textContent = 'CHUẨN BỊ';
          else if (phase === 'InGamePhase') $('phase-label').textContent = 'ĐANG GIAO TRANH';
          else if (phase === 'RoundEndPhase') $('phase-label').textContent = 'KẾT THÚC HIỆP';
          else if (phase === 'MatchOverPhase') $('phase-label').textContent = 'KẾT THÚC TRẬN';
          if (screenName !== 'game') showScreen('game');
          const now = performance.now();
          if (now - lastOnlineUiUpdate > 150) {
            updateMatchHeader(latestSnapshot);
            updateScoreboard(latestSnapshot);
            updateWeaponPanel(latestSnapshot);
            lastOnlineUiUpdate = now;
          }
        }
        break;
      }
      case 'SRoundEnd': {
        const values = Array.isArray(data) ? data : [];
        const winner = values[0] || 'Chưa xác định';
        const scores = Array.isArray(values[1]) ? values[1] : [];
        updateScoreboard({ wsTanks: [], wsScores: scores });
        showOverlay('KẾT THÚC HIỆP', `${winner} thắng hiệp này. Chuẩn bị cho vòng tiếp theo.`, 'TIẾP TỤC', () => hideOverlay());
        addFeed(`${winner} thắng hiệp đấu.`); break;
      }
      case 'SMatchOver': {
        const values = Array.isArray(data) ? data : [];
        const winner = values[0] || 'Chưa xác định';
        showOverlay('TRẬN ĐẤU KẾT THÚC', `${winner} là người chiến thắng chung cuộc.`, 'VỀ PHÒNG CHỜ', () => { hideOverlay(); if (mode === 'online' && activeRoom) sendMessage('CLeaveRoom'); else { showScreen('lobby'); sendMessage('CListRooms'); } });
        addFeed(`Chiến thắng chung cuộc: ${winner}`, 'warn');
        SoundFX.victory();
        break;
      }
      case 'SKillEvent': {
        const pair = Array.isArray(data) ? data : [];
        addFeed(`${pair[0] || 'Ai đó'} hạ ${pair[1] || 'đối thủ'}!`, 'warn');
        SoundFX.explosion();
        break;
      }
      case 'SMysteryBoxPickup': {
        const pair = Array.isArray(data) ? data : [];
        addFeed(`${pair[0] || 'Người chơi'} nhặt hộp: ${weaponName(pair[1])}.`);
        SoundFX.pickup();
        break;
      }
      case 'SLeaderboard':
        addFeed('Đã nhận bảng xếp hạng.'); break;
      case 'SPong': break;
      case 'SError': addFeed(stringPayload(data) || 'Lỗi server.', 'warn'); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- results

  function showPostMatch({ title, summary, kills = 0, score = 0, map = 'FOREST', scores = [], players = null, report = null }) {
    // The match is over: stop and clear every kill notification (banner, voice queue, kill feed).
    resetAnnouncements();
    clearTimeout(bannerTimer);
    ['kill-banner', 'respawn-banner', 'shield-chip'].forEach(id => { const el = $(id); if (el) el.hidden = true; });
    const killFeedEl = $('kill-feed'); if (killFeedEl) killFeedEl.innerHTML = '';
    hideOverlay();
    leaveGameplayFullscreen();
    $('results-title').textContent = title;
    $('results-summary').textContent = summary;
    $('results-kills').textContent = String(kills);
    $('results-score').textContent = String(score);
    $('results-map').textContent = String(map).toUpperCase();
    $('results-player-name').textContent = username || displayName || 'TANK PILOT';
    const board = $('results-board');
    board.innerHTML = '';
    const entries = Array.isArray(scores) ? scores.slice().sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)) : [];
    if (!entries.length) entries.push([username || 'TANK PILOT', score]);
    entries.slice(0, MAX_TEAM_BOTS + 1).forEach(([name, points], index) => {
      const row = document.createElement('div'); row.className = 'results-row';
      const frame = document.createElement('img');
      frame.className = 'results-row-frame';
      frame.alt = '';
      frame.src = index === 0 ? 'assets/menu/hangnhat.png' : 'assets/menu/nguoikhac.png';
      const rank = document.createElement('span'); rank.textContent = String(index + 1).padStart(2, '0');
      const player = document.createElement('span'); player.textContent = name || 'TANK PILOT';
      const value = document.createElement('strong'); value.textContent = `${Number(points || 0)} PTS`;
      row.append(frame, rank, player, value); board.append(row);
    });
    // Offline modes (free-for-all, 2v2, 3v3, 4v4, 5v5) get the detailed LoL / AOV style report.
    const detailed = Array.isArray(players) && players.length > 0;
    const lol = $('results-lol');
    if (lol) { lol.hidden = !detailed; if (detailed) renderMatchReport(lol, players, report || {}); }
    board.hidden = detailed;
    const youPanel = document.querySelector('.results-you-panel'); if (youPanel) youPanel.hidden = detailed;
    const card = document.querySelector('.results-card'); if (card) card.classList.toggle('wide', detailed);
    showScreen('results');
  }

  // Players for the report: { name, team (-1 = free-for-all), kills, deaths, points, me, color }.
  function matchPlayers(g) {
    return g.tanks.map(t => ({ name: t.tankId, team: t.team, kills: t.tankKills, deaths: t.tankDeaths, points: t.tankPoints, me: isMe(t.tankId), color: COLORS[t.tankColor] || '#c7f36b' }));
  }

  // LoL / AOV style report: per-team panels with result banner, MVP / SVP, K/D and score bars.
  function renderMatchReport(root, players, info) {
    root.innerHTML = '';
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    const team = !!info.team, myTeam = info.myTeam ?? 0;
    const maxPoints = Math.max(1, ...players.map(p => p.points));
    const byPoints = list => list.slice().sort((a, b) => b.points - a.points || b.kills - a.kills || a.deaths - b.deaths);
    const outcome = info.outcome || 'draw';
    const groups = team
      ? [myTeam, 1 - myTeam].map(id => ({ id, list: byPoints(players.filter(p => p.team === id)), mine: id === myTeam }))
      : [{ id: -1, list: byPoints(players), mine: true }];
    // MVP: the best score of EACH team in team modes (the losing side keeps an MVP too, no SVP), or of everybody in free-for-all.
    const mvps = new Set(team ? groups.map(gr => gr.list[0]) : [byPoints(players)[0]]);
    if (team && (info.history || []).length) {
      const pips = el('div', 'rl-rounds'); pips.append(el('span', 'rl-rounds-label', 'CÁC VÁN'));
      info.history.forEach(w => pips.append(el('span', `rl-pip ${w < 0 ? 'draw' : w === myTeam ? 'win' : 'lose'}`)));
      root.append(pips);
    }
    const wrap = el('div', `rl-teams${team ? '' : ' ffa'}`);
    groups.forEach(gr => {
      const cls = !team ? 'ffa' : (gr.mine ? 'blue' : 'red');
      const box = el('section', `rl-team ${cls}`);
      const head = el('div', 'rl-head');
      const name = el('div', 'rl-team-name', !team ? 'XẾP HẠNG TỬ CHIẾN' : (gr.mine ? 'ĐỘI BẠN' : 'ĐỘI ĐỊCH'));
      if (team) name.append(el('small', '', `${info.wins ? info.wins[gr.id] : 0} VÁN THẮNG`));
      else { const rank = byPoints(players).findIndex(p => p.me) + 1; name.append(el('small', '', `BẠN HẠNG ${rank}/${players.length}`)); }
      head.append(name);
      if (team) {
        const res = outcome === 'draw' ? 'draw' : (gr.mine === (outcome === 'win') ? 'win' : 'lose');
        head.append(el('div', `rl-result ${res}`, res === 'win' ? 'CHIẾN THẮNG' : res === 'lose' ? 'THẤT BẠI' : 'HÒA'));
      }
      box.append(head);
      const cols = el('div', 'rl-cols'); ['', 'NGƯỜI CHƠI', 'K / D', 'ĐIỂM'].forEach(t => cols.append(el('span', '', t)));
      box.append(cols);
      gr.list.forEach((p, i) => {
        const row = el('div', `rl-row${p.me ? ' me' : ''}${i === 0 ? ' first' : ''}`);
        const player = el('div', 'rl-player');
        const nm = el('div', 'rl-name'); const dot = el('span', 'rl-dot'); dot.style.background = p.color;
        nm.append(dot, el('span', '', p.name + (p.me ? ' (BẠN)' : '')));
        if (mvps.has(p)) nm.append(el('span', 'rl-badge', 'MVP'));
        const bar = el('span', 'rl-bar'); const fill = document.createElement('i'); fill.style.width = `${Math.max(3, Math.round(p.points / maxPoints * 100))}%`; bar.append(fill);
        player.append(nm, bar);
        const kd = el('div', 'rl-kd', `${p.kills} / ${p.deaths}`); kd.append(el('small', '', `KDA ${(p.kills / Math.max(1, p.deaths)).toFixed(1)}`));
        row.append(el('span', 'rl-rank', String(i + 1)), player, kd, el('div', 'rl-score', String(p.points)));
        box.append(row);
      });
      wrap.append(box);
    });
    root.append(wrap);
  }

  function exitResultsToHome() {
    setMovementSound(false);
    leaveGameplayFullscreen();
    localGame = null;
    localMap = null;
    if (mode === 'online') closeSocket();
    mode = 'none';
    showScreen('home');
  }

  // From the results screen straight back to where the next match is set up (no trip via the home page):
  // bot mode -> map / difficulty / mode screen, online -> room lobby (leaves the finished room, stays connected).
  function backToBattleRoom() {
    setMovementSound(false);
    leaveGameplayFullscreen();
    const wasOnline = mode === 'online';
    localGame = null;
    localMap = null;
    if (wasOnline && ws && ws.readyState === WebSocket.OPEN && loggedIn) {
      mode = 'none';
      stopInputSender();
      if (activeRoom) { sendMessage('CLeaveRoom'); showScreen('lobby'); }   // SRoomLeft refreshes the room list
      else { showScreen('lobby'); sendMessage('CListRooms'); }
      return;
    }
    if (wasOnline) { exitResultsToHome(); return; }
    openMapSelect();
  }

  // ---------------------------------------------------------------- room / tank select

  function onRoomReady() {
    setError('lobby-error', '');
    roomPlayerNames = [{ name: username || displayName || 'Bạn', color: isHost ? 'TankRed' : 'TankBlue', self: true, host: isHost }];
    $('room-title').textContent = (readField(activeRoom, 'riRoomName') || 'PHÒNG CHIẾN ĐẤU').toString().toUpperCase();
    $('room-code').textContent = readField(activeRoom, 'riRoomId') || '------';
    $('room-caption').textContent = isHost ? 'Bạn là chủ phòng. Chờ bạn bè tham gia.' : 'Bạn đã tham gia phòng. Chờ chủ phòng bắt đầu.';
    $('countdown-banner').hidden = true;
    setError('room-error', '');
    renderRoomPlayers();
    // The player already picked a loadout before connecting. Keep the server
    // room flow intact and do not make them choose the same parts twice.
    if (tankLoadoutConfirmed) showScreen('room');
    else openTankSelect('room');
    addFeed(isHost ? 'Đã tạo phòng mới.' : 'Đã tham gia phòng.');
  }

  function refreshTankAssembly() {
    const hull = String(selectedHullId).padStart(2, '0');
    const gun = String(selectedGunId).padStart(2, '0');
    $('tank-preview-hull').src = `assets/tanks/hull_${hull}.png`;
    $('tank-preview-gun').src = `assets/tanks/gun_${gun}.png`;
    $('selected-hull-label').textContent = `THÂN ${hull}`;
    $('selected-gun-label').textContent = `NÒNG ${gun}`;
    document.querySelectorAll('[data-hull]').forEach(button => {
      const active = button.dataset.hull === hull;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-gun]').forEach(button => {
      const active = button.dataset.gun === gun;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function openTankSelect(returnTo) {
    tankSelectReturn = returnTo;
    const savedName = $('player-name').value.trim() || username || displayName || localStorage.getItem('tankwar-name') || '';
    $('tank-name').value = savedName;
    const roomId = activeRoom && readField(activeRoom, 'riRoomId');
    $('garage-room-code').textContent = returnTo === 'offline' ? 'BOT-TEST' : roomId || 'CONNECT';
    $('tank-select-note').textContent = returnTo === 'offline'
      ? 'Sau khi xác nhận xe, chọn độ khó bot, số bot và map thử. Map online vẫn do server ngẫu nhiên.'
      : roomId
        ? 'Mã phòng đã được cấp. Map và trạng thái trận online vẫn do server quyết định.'
        : 'Sau khi xác nhận, bạn sẽ kết nối để tìm hoặc tạo phòng. Map online do server chọn ngẫu nhiên.';
    refreshTankAssembly();
    showScreen('tankSelect');
  }

  function closeTankSelect() {
    if (tankSelectReturn === 'room') showScreen('lobby');
    else showScreen('home');
  }

  function confirmTankSelection() {
    unlockAudio();
    const name = $('tank-name').value.trim() || $('player-name').value.trim() || 'TankPilot';
    username = name;
    displayName = name;
    $('player-name').value = name;
    localStorage.setItem('tankwar-name', name);
    tankLoadoutConfirmed = true;
    if (tankSelectReturn === 'offline') {
      openMapSelect();   // bot difficulty (EASY ... EXTREME), bot count and map are chosen here
      return;
    }
    if (tankSelectReturn === 'connect') {
      // connectOnline keeps the existing WebSocket protocol and reads the
      // name from the (hidden) home field which was just updated above.
      showScreen('home');
      connectOnline();
      return;
    }
    showScreen('room');
  }

  function renderRoomList() {
    const root = $('room-list');
    if (!roomList.length) {
      root.innerHTML = '<div class="empty-state"><span class="empty-icon">⌁</span><strong>CHƯA CÓ PHÒNG NÀO</strong><small>Tạo phòng mới hoặc làm mới danh sách.</small></div>';
      return;
    }
    root.innerHTML = '';
    roomList.forEach(room => {
      const id = readField(room, 'riRoomId') || '------';
      const name = readField(room, 'riRoomName') || 'TankWar Room';
      const max = Number(readField(room, 'riMaxPlayers') || 4);
      const current = Number(readField(room, 'riCurrentPlayers') || 0);
      const privateRoom = !!readField(room, 'riHasPassword');
      const phase = tagOf(readField(room, 'riPhase')) || 'LobbyPhase';
      const card = document.createElement('div'); card.className = 'room-card';
      const info = document.createElement('div');
      const h3 = document.createElement('h3'); h3.textContent = name;
      const p = document.createElement('p'); p.textContent = `MÃ ${id} · ${phaseLabel(phase)}`;
      const tags = document.createElement('div'); tags.className = 'room-tags';
      tags.innerHTML = `<span class="tag">${current} / ${max} NGƯỜI</span><span class="tag ${privateRoom ? 'private' : ''}">${privateRoom ? '⌑ RIÊNG TƯ' : '◎ CÔNG KHAI'}</span>`;
      info.append(h3, p, tags);
      const button = document.createElement('button'); button.className = 'join-room-button'; button.type = 'button'; button.textContent = 'THAM GIA →';
      button.disabled = phase !== 'LobbyPhase' || current >= max;
      button.addEventListener('click', () => { $('join-id').value = id; joinRoom(); });
      card.append(info, button); root.append(card);
    });
  }

  function phaseLabel(phase) {
    return ({ LobbyPhase: 'ĐANG CHỜ', CountdownPhase: 'ĐANG ĐẾM NGƯỢC', InGamePhase: 'ĐANG CHƠI', RoundEndPhase: 'KẾT THÚC HIỆP', MatchOverPhase: 'ĐÃ KẾT THÚC' })[phase] || phase;
  }

  function renderRoomPlayers() {
    if (!activeRoom) return;
    const max = Number(readField(activeRoom, 'riMaxPlayers') || 4);
    const current = Number(readField(activeRoom, 'riCurrentPlayers') || roomPlayerNames.length || 1);
    const currentCount = Math.max(current, roomPlayerNames.length);
    $('players-counter').textContent = `${currentCount} / ${max}`;
    const root = $('room-players'); root.innerHTML = '';
    const list = [...roomPlayerNames];
    while (list.length < Math.max(1, Math.min(current, max))) list.push({ name: `CHIẾN BINH ${String(list.length + 1).padStart(2, '0')}`, color: ['TankBlue', 'TankGreen', 'TankYellow'][list.length % 3], waiting: true });
    list.forEach(player => {
      const row = document.createElement('div'); row.className = 'player-row';
      const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.style.color = COLORS[player.color] || '#c7f36b'; avatar.textContent = (player.name || '?').slice(0, 1).toUpperCase();
      const titleWrap = document.createElement('div');
      const title = document.createElement('div'); title.className = 'player-name'; title.textContent = player.name;
      const sub = document.createElement('div'); sub.className = 'player-sub'; sub.textContent = player.waiting ? 'ĐÃ KẾT NỐI · ĐANG ĐỒNG BỘ' : player.self ? 'BẠN · ĐÃ KẾT NỐI' : 'ĐÃ KẾT NỐI';
      titleWrap.append(title, sub); row.append(avatar, titleWrap);
      if (player.host || (isHost && player.self)) { const host = document.createElement('span'); host.className = 'host-label'; host.textContent = 'CHỦ PHÒNG'; row.append(host); }
      root.append(row);
    });
    $('start-button').disabled = !isHost || currentCount < 2;
    $('start-button').title = !isHost ? 'Chỉ chủ phòng mới bắt đầu được' : currentCount < 2 ? 'Cần ít nhất 2 người chơi' : 'Bắt đầu trận đấu';
  }

  function createRoom() {
    unlockAudio();
    setError('lobby-error', '');
    const roomName = $('room-name').value.trim() || `${displayName || username}’s Arena`;
    const max = Number($('max-players').value || 4);
    const password = $('create-password').value;
    if (!wsReady || !loggedIn) { setError('lobby-error', 'Chưa đăng nhập vào server.'); return; }
    sendMessage('CCreateRoom', { ccrRoomName: roomName, ccrMaxPlayers: max, ccrPassword: password ? password : null });
  }

  function joinRoom() {
    unlockAudio();
    setError('lobby-error', '');
    const id = $('join-id').value.trim().toUpperCase();
    const password = $('join-password').value;
    if (!/^[A-Z0-9]{6}$/.test(id)) { setError('lobby-error', 'Mã phòng phải có đúng 6 ký tự.'); return; }
    if (!wsReady || !loggedIn) { setError('lobby-error', 'Chưa đăng nhập vào server.'); return; }
    sendMessage('CJoinRoom', { cjrRoomId: id, cjrPassword: password ? password : null });
  }

  // ---------------------------------------------------------------- offline practice

  function openMapSelect() {
    unlockAudio();
    closeSocket(false);
    mode = 'none';
    setError('map-error', '');
    showScreen('map');
    mapLoadPromise.then(() => {
      if (mapLoadError) setError('map-error', `Không tải được map luyện tập: ${mapLoadError}. Hãy chạy frontend qua http://localhost như hướng dẫn trong web/README.md.`);
    });
  }

  // Practice flow: pick a tank -> pick bot difficulty / bot count / map -> match starts.
  function chooseOfflineMap(mapId) {
    unlockAudio();
    selectedMapId = mapId;
    startOffline(mapId);
  }

  function startOffline() {
    hideOverlay();
    maze = generateRandomMaze();
    const enteredName = $('player-name').value.trim();
    username = enteredName || localStorage.getItem('tankwar-name') || 'TankPilot';
    displayName = username;
    $('player-name').value = username;
    localStorage.setItem('tankwar-name', username);
    closeSocket(false);
    mode = 'offline'; activeRoom = null; isHost = false;
    selectedMapId = mapId;
    localMap = chosenMap;
    localGame = createLocalGame(username || 'TankPilot');
    latestSnapshot = localSnapshot();
    resetMatchUi();
    const teamLabel = localGame.team ? `${localGame.teamSize}V${localGame.teamSize} · ` : '';
    $('match-mode').textContent = `OFFLINE · ${teamLabel}${BOT_LEVELS[botSettings.difficulty].label}`;
    $('match-room').textContent = chosenMap.label;
    $('phase-label').textContent = localGame.team ? `TỬ CHIẾN ĐỒNG ĐỘI · ${localGame.rounds} VÁN` : 'ĐANG THỰC HÀNH';
    $('match-player-count').textContent = String(localGame.tanks.length);
    setError('home-error', '');
    statusPill('idle', 'CHẾ ĐỘ OFFLINE');
    updateMatchHeader(latestSnapshot); updateScoreboard(latestSnapshot); updateWeaponPanel(latestSnapshot);
    showScreen('game');
    addFeed('Bắt đầu chế độ thực hành offline với mê cung mới!');
  }

  function createLocalGame(name) {
    const colors = ['TankRed','TankBlue','TankGreen','TankYellow'];
    const names = [name, 'CPU-ALPHA', 'CPU-BRAVO', 'CPU-DELTA'];
    const tanks = [];
    names.forEach((n, i) => {
      const sp = getRandomSpawnPoint(maze, tanks);
      tanks.push({
        tankId: n,
        tankPos: { ...sp }, tankVel: { vx: 0, vy: 0 }, tankBodyAngle: 0,
        tankTurretAngle: Math.PI, tankColor: colors[i],
        tankWeapon: { wsCurrentWeapon: 'NormalBullet', wsBuffTimeLeft: 0, wsCooldownState: 'Ready' },
        tankAlive: true, tankScore: 0, tankKills: 0,
        _bot: i > 0, _cooldown: .8 + i * .45, _respawn: 0, _dirTimer: 0, _direction: Math.random() * Math.PI * 2
      });
    });
    return { name, tanks, bullets: [], boxes: [], lasers: [], time: 0, boxTimer: 10, fireCooldown: 0, lives: 5, score: 0, gameOver: false, kills: 0, wave: 1 };
  }

  function localSnapshot() {
    if (!localGame) return null;
    return {
      wsTanks: localGame.tanks.map(publicTank),
      wsBullets: localGame.bullets.map(b => ({ bulPos: b.pos, bulVel: b.vel, bulType: b.type, bulOwnerId: b.owner, bulBounces: b.bounces, bulLifetime: b.life })),
      wsLasers: localGame.lasers,
      wsMysteryBoxes: localGame.boxes.map(b => ({ mbPos: b.pos, mbActive: true, mbRespawnIn: 0 })),
      wsMaze: maze,
      wsPhase: localGame.gameOver ? { tag: 'MatchOverPhase', contents: localGame.name } : { tag: 'InGamePhase' },
      wsScores: localGame.tanks.map(t => [t.tankId, t.tankPoints])
    };
  }

  function localSpawnPoints(count) {
    const points = getLocalSpawns(localMap);
    while (points.length < count) {
      let chosen = null;
      for (let attempt = 0; attempt < 120 && !chosen; attempt++) {
        const candidate = pickOpenLocalPoint(LOCAL_TANK_RADIUS + 10);
        if (points.every(other => distance(other, candidate) > 1400)) chosen = candidate;
      }
      points.push(chosen || pickOpenLocalPoint(LOCAL_TANK_RADIUS + 10));
    }
    return points;
  }

  // ---- bot navigation: a 64 px walkability grid per map, solved with breadth-first search ----
  const NAV_STEP = 64;

  function navGrid() {
    if (localMap._nav) return localMap._nav;
    const cols = Math.ceil(localMap.width / NAV_STEP), rows = Math.ceil(localMap.height / NAV_STEP);
    const open = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        open[r * cols + c] = collidesLocalMap({ vx: (c + .5) * NAV_STEP, vy: (r + .5) * NAV_STEP }, LOCAL_TANK_RADIUS + 6) ? 0 : 1;
      }
    }
    localMap._nav = { cols, rows, open };
    return localMap._nav;
  }

  function nearestOpenCell(nav, index) {
    if (nav.open[index]) return index;
    const cx = index % nav.cols, cy = (index / nav.cols) | 0;
    for (let radius = 1; radius <= 6; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && y >= 0 && x < nav.cols && y < nav.rows && nav.open[y * nav.cols + x]) return y * nav.cols + x;
        }
      }
    }
    return -1;
  }

  function navPath(from, to) {
    const nav = navGrid(), { cols, rows, open } = nav;
    const toIndex = p => clamp(Math.floor(p.vy / NAV_STEP), 0, rows - 1) * cols + clamp(Math.floor(p.vx / NAV_STEP), 0, cols - 1);
    const start = toIndex(from), goal = nearestOpenCell(nav, toIndex(to));
    if (goal < 0) return [];
    const prev = new Int32Array(cols * rows).fill(-1), queue = new Int32Array(cols * rows);
    let head = 0, tail = 0;
    queue[tail++] = start; prev[start] = start;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (head < tail) {
      const cur = queue[head++];
      if (cur === goal) break;
      const cx = cur % cols, cy = (cur / cols) | 0;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = ny * cols + nx;
        if (prev[next] !== -1 || !open[next]) continue;
        if (dx && dy && (!open[cy * cols + nx] || !open[ny * cols + cx])) continue;
        prev[next] = cur; queue[tail++] = next;
      }
    }
    if (prev[goal] === -1) return [];
    const path = [];
    for (let cur = goal; cur !== start; cur = prev[cur]) path.push({ vx: ((cur % cols) + .5) * NAV_STEP, vy: (((cur / cols) | 0) + .5) * NAV_STEP });
    return path.reverse();
  }

  function lineClear(a, b, radius) {
    const steps = Math.max(1, Math.ceil(distance(a, b) / 40));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (collidesLocalMap({ vx: a.vx + (b.vx - a.vx) * t, vy: a.vy + (b.vy - a.vy) * t }, radius)) return false;
    }
    return true;
  }

  // Skip ahead along the path to the farthest waypoint that can be reached in a straight line.
  function pickWaypoint(bot) {
    const path = bot._path;
    while (path.length > 1 && distance(bot.tankPos, path[0]) < NAV_STEP * .8) path.shift();
    for (let i = Math.min(path.length - 1, 7); i > 0; i--) {
      if (lineClear(bot.tankPos, path[i], LOCAL_TANK_RADIUS)) return path[i];
    }
    return path[0] || null;
  }

  function turnToward(current, wanted, maxStep) {
    const diff = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
    return current + clamp(diff, -maxStep, maxStep);
  }

  function angleGap(a, b) { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }

  function botHeading(bot, dest, lvl) {
    let point = dest;
    if (lvl.path && bot._wp) {
      point = bot._wp;
      if (distance(bot.tankPos, point) < 50) bot._think = 0;
    } else if (!lvl.path && bot._dirTimer > 0) {
      return { x: Math.cos(bot._direction), y: Math.sin(bot._direction) };
    }
    const dx = point.vx - bot.tankPos.vx, dy = point.vy - bot.tankPos.vy, len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  // One bot, one frame: pick a target, plan a route, dodge, move, aim (with lead) and shoot.
  function updateLocalBot(bot, dt) {
    const g = localGame, lvl = BOT_LEVELS[g.difficulty] || BOT_LEVELS.medium, player = g.tanks[0];
    bot._cooldown -= dt; bot._think -= dt; bot._strafeT -= dt; bot._dodgeT -= dt; bot._dodgeCheck -= dt; bot._dirTimer -= dt; bot._pathAge += dt;
    const range = visionRadius() * lvl.range;

    // 1. Perception: a bot only reacts to an enemy it has actually spotted (inside its vision range and, on the
    // smarter levels, with a clear line of sight). It no longer knows where everybody is, so it stops rushing the centre.
    let target = null, best = Infinity;
    if (bot._targetId) {
      const known = g.tanks.find(t => t.tankId === bot._targetId && t.tankAlive);
      if (known) { target = known; best = distance(bot.tankPos, known.tankPos); } else bot._targetId = null;
    }

    // 2. Re-plan a few times per second.
    if (bot._think <= 0) {
      bot._think = lvl.think * (.8 + Math.random() * .4);
      let cand = null, candDist = Infinity, bestWeighted = Infinity;
      g.tanks.filter(t => t !== bot && t.tankAlive && (!g.team || t.team !== bot.team)).forEach(t => {
        const d = distance(bot.tankPos, t.tankPos);
        // Only enemies that are really spotted count (in range, clear line of sight on smarter levels), so an enemy
        // hidden behind a wall no longer hides the others.
        if (d > range || (lvl.los && !lineClear(bot.tankPos, t.tankPos, 12))) return;
        // The human is only slightly preferred: their distance counts as 15% shorter.
        const weighted = t === player ? d * .85 : d;
        if (weighted < bestWeighted) { bestWeighted = weighted; candDist = d; cand = t; }
      });
      bot._sees = !!cand;
      if (bot._sees) {
        target = cand; best = candDist; bot._targetId = cand.tankId;
        bot._lastSeen = { pos: { ...cand.tankPos }, t: g.time };
        if (g.team && lvl.path) g.teamSeen[bot.team] = { pos: { ...cand.tankPos }, t: g.time };   // teammates get the callout
      } else { target = null; best = Infinity; bot._targetId = null; }
      bot._dest = botDestination(bot, lvl, target);
      if (lvl.path && bot._dest) {
        bot._path = navPath(bot.tankPos, bot._dest);
        bot._wp = pickWaypoint(bot);
        if (!bot._path.length && !bot._sees) { bot._roam = null; bot._roamUntil = 0; }   // unreachable / already there: pick another patrol point
      }
    }

    // Re-validate the sighting every few frames so a bot never keeps shooting at a target that went out of range
    // or behind a wall since the last re-plan.
    bot._losCheck = (bot._losCheck || 0) - dt;
    if (target && bot._sees && bot._losCheck <= 0) {
      bot._losCheck = .07;
      best = distance(bot.tankPos, target.tankPos);
      if (best > range * 1.1 || (lvl.los && !lineClear(bot.tankPos, target.tankPos, 12))) { bot._sees = false; bot._think = Math.min(bot._think, .05); }
    }

    // 3. Dodge: look for a bullet whose path passes through this tank within the next ~0.9 s.
    if (lvl.dodge > 0 && bot._dodgeCheck <= 0 && bot._dodgeT <= 0) {
      bot._dodgeCheck = .08;
      for (const b of g.bullets) {
        if (b.owner === bot.tankId || b.life <= 0) continue;
        if (g.team && (g.tanks.find(t => t.tankId === b.owner) || {}).team === bot.team) continue;   // ally bullets are harmless
        const rx = bot.tankPos.vx - b.pos.vx, ry = bot.tankPos.vy - b.pos.vy;
        const speed2 = b.vel.vx * b.vel.vx + b.vel.vy * b.vel.vy;
        const t = (rx * b.vel.vx + ry * b.vel.vy) / speed2;
        if (t <= 0 || t > .9) continue;
        const cx = b.pos.vx + b.vel.vx * t - bot.tankPos.vx, cy = b.pos.vy + b.vel.vy * t - bot.tankPos.vy;
        if (Math.hypot(cx, cy) > LOCAL_TANK_RADIUS + 20 || Math.random() > lvl.dodge) continue;
        const speed = Math.sqrt(speed2);
        let px = -b.vel.vy / speed, py = b.vel.vx / speed;
        if (px * cx + py * cy > 0) { px = -px; py = -py; }   // sidestep away from the point of impact
        bot._dodge = { x: px, y: py }; bot._dodgeT = .35;
        break;
      }
    }

    // 4. Movement.
    let dir = null;
    bot._escapeT = (bot._escapeT || 0) - dt;
    if (bot._escapeT > 0) dir = { x: Math.cos(bot._direction), y: Math.sin(bot._direction) };
    else if (bot._dodgeT > 0 && bot._dodge) dir = bot._dodge;
    else if (target && lvl.strafe && bot._sees) {
      const preferred = range * .55, ux = (target.tankPos.vx - bot.tankPos.vx) / (best || 1), uy = (target.tankPos.vy - bot.tankPos.vy) / (best || 1);
      if (best > preferred * 1.2) dir = botHeading(bot, target.tankPos, lvl);
      else if (best < preferred * .6) dir = { x: -ux, y: -uy };
      else {
        if (bot._strafeT <= 0) { bot._strafe *= -1; bot._strafeT = .7 + Math.random() * 1.1; }
        dir = { x: -uy * bot._strafe, y: ux * bot._strafe };
      }
    } else {
      const dest = target ? target.tankPos : bot._dest;
      dir = dest ? botHeading(bot, dest, lvl) : null;
    }
    if (bot._escapeT > 0) dir = { x: Math.cos(bot._direction), y: Math.sin(bot._direction) };
    // Team mode: teammates spread out instead of walking in a single clump.
    if (dir && g.team && bot._dodgeT <= 0 && !(target && lvl.strafe && bot._sees)) {
      let rx = 0, ry = 0;
      g.tanks.forEach(m => {
        if (m === bot || !m.tankAlive || m.team !== bot.team) return;
        const d = distance(bot.tankPos, m.tankPos);
        if (d > 1 && d < 450) { const w = 1 - d / 450; rx += (bot.tankPos.vx - m.tankPos.vx) / d * w; ry += (bot.tankPos.vy - m.tankPos.vy) / d * w; }
      });
      if (rx || ry) { const nx = dir.x + rx * 1.2, ny = dir.y + ry * 1.2, l = Math.hypot(nx, ny) || 1; dir = { x: nx / l, y: ny / l }; }
    }
    if (dir) {
      const step = lvl.speed * LOCAL_SPEED_SCALE * dt, before = { ...bot.tankPos };
      moveLocalTank(bot, dir.x * step, dir.y * step);
      bot.tankBodyAngle = Math.atan2(dir.y, dir.x);
      // Anti-stuck: if the bot has barely moved for ~0.7 s, drop the route and back out in a random direction.
      if (distance(before, bot.tankPos) < step * .25) bot._stuckT = (bot._stuckT || 0) + dt; else bot._stuckT = Math.max(0, (bot._stuckT || 0) - dt * 2);
      if (bot._stuckT > .7) {
        bot._stuckT = 0; bot._escapeT = .6 + Math.random() * .5; bot._direction = Math.random() * Math.PI * 2;
        bot._path = []; bot._wp = null; bot._roam = null; bot._roamUntil = 0; bot._think = 0;
      }
      if (distance(before, bot.tankPos) < step * .25) {   // blocked
        bot._dodgeT = 0;
        if (lvl.strafe && bot._strafeT < .3) { bot._strafe *= -1; bot._strafeT = .5; }
        if (!lvl.path) { bot._direction = Math.random() * Math.PI * 2; bot._dirTimer = .8 + Math.random() * 1.5; }
        else bot._think = Math.min(bot._think, .05);
      }
    }

    // 5. Aim and fire.
    const maxTurn = lvl.turn * dt;
    if (!target) { bot.tankTurretAngle = turnToward(bot.tankTurretAngle, bot.tankBodyAngle, maxTurn); bot._seen = 0; return; }
    let ax = target.tankPos.vx, ay = target.tankPos.vy;
    if (lvl.lead > 0) {
      const flight = Math.min(best / (400 * LOCAL_SPEED_SCALE), 1.5);
      const vmax = 320 * LOCAL_SPEED_SCALE, vl = Math.hypot(target._v.vx, target._v.vy) || 1, vk = Math.min(1, vmax / vl);   // never lead on a teleport spike
      ax += target._v.vx * vk * flight * lvl.lead; ay += target._v.vy * vk * flight * lvl.lead;
      ax = clamp(ax, 0, localMap.width); ay = clamp(ay, 0, localMap.height);
    }
    const wanted = Math.atan2(ay - bot.tankPos.vy, ax - bot.tankPos.vx);
    bot.tankTurretAngle = turnToward(bot.tankTurretAngle, wanted, maxTurn);
    bot._seen = bot._sees ? bot._seen + dt : 0;
    const holdFire = target.tankInvulnerabilityLeft > .25;
    if (bot._sees && !holdFire && bot._cooldown <= 0 && bot._seen >= lvl.react && angleGap(bot.tankTurretAngle, wanted) < .12 + lvl.aim * .3) {
      localShoot(bot, bot.tankTurretAngle + (Math.random() - .5) * 2 * lvl.aim, 'NormalBullet');
      bot._cooldown = lvl.fire[0] + Math.random() * (lvl.fire[1] - lvl.fire[0]);
    }
  }

  // Where a bot wants to go when nothing is in sight: chase the last place it saw an enemy, answer a teammate's
  // callout, otherwise patrol to a varied point on the map.
  function botDestination(bot, lvl, target) {
    const g = localGame;
    if (target) return target.tankPos;
    const seen = bot._lastSeen;
    if (seen && g.time - seen.t < (lvl.hunt ? 9 : 5) && distance(bot.tankPos, seen.pos) > 240) return seen.pos;
    if (g.team && lvl.path) {
      const call = g.teamSeen[bot.team];
      if (call && g.time - call.t < 6 && distance(bot.tankPos, call.pos) > 500) return openPointNear(call.pos);
    }
    if (!bot._roam || distance(bot.tankPos, bot._roam) < 240 || g.time > bot._roamUntil) {
      bot._roam = pickPatrolPoint(bot, lvl);
      bot._roamUntil = g.time + 12 + Math.random() * 10;
    }
    return bot._roam;
  }

  function pickPatrolPoint(bot, lvl) {
    const g = localGame, W = localMap.width, H = localMap.height, margin = 260;
    if (g.team) {
      // Push along a lane between the two bases; every teammate takes its own lane and some flank wide.
      const mates = g.tanks.filter(t => t.team === bot.team), foes = g.tanks.filter(t => t.team !== bot.team);
      const own = mates[0]._spawn, foe = foes[0]._spawn;
      const dx = foe.vx - own.vx, dy = foe.vy - own.vy, len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;
      const lane = (mates.indexOf(bot) - (mates.length - 1) / 2) * 1000 * (Math.random() < .25 ? 2.2 : 1);
      const aliveFoes = foes.filter(f => f.tankAlive);
      if (aliveFoes.length && aliveFoes.length <= 2 && Math.random() < .6) {   // endgame: close in on the area of the last enemies
        const f = aliveFoes[Math.floor(Math.random() * aliveFoes.length)];
        return openPointNear({ vx: f.tankPos.vx + (Math.random() - .5) * 1600, vy: f.tankPos.vy + (Math.random() - .5) * 1600 });
      }
      const t = .3 + Math.random() * .65, jitter = () => (Math.random() - .5) * 500;
      return openPointNear({ vx: own.vx + dx * t + px * lane + jitter(), vy: own.vy + dy * t + py * lane + jitter() });
    }
    // Free-for-all: hunting bots sometimes head for the rough area of an enemy, others visit a different zone.
    if (lvl.hunt && Math.random() < .35) {
      const foes = g.tanks.filter(t => t !== bot && t.tankAlive);
      if (foes.length) {
        const f = foes[Math.floor(Math.random() * foes.length)];
        return openPointNear({ vx: f.tankPos.vx + (Math.random() - .5) * 2000, vy: f.tankPos.vy + (Math.random() - .5) * 2000 });
      }
    }
    const zones = [];
    for (let zy = 0; zy < 3; zy++) for (let zx = 0; zx < 3; zx++) {
      const idx = zy * 3 + zx;
      if (idx === bot._zone) continue;
      zones.push({ idx, zx, zy, w: zx === 1 && zy === 1 ? .35 : (zx !== 1 && zy !== 1 ? 1.3 : 1) });   // the centre is the least attractive
    }
    let roll = Math.random() * zones.reduce((sum, z) => sum + z.w, 0), zone = zones[0];
    for (const z of zones) { roll -= z.w; if (roll <= 0) { zone = z; break; } }
    bot._zone = zone.idx;
    return openPointNear({ vx: margin + (zone.zx + Math.random()) * (W - margin * 2) / 3, vy: margin + (zone.zy + Math.random()) * (H - margin * 2) / 3 });
  }

  function openPointNear(p, radius = LOCAL_TANK_RADIUS + 10) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const spread = 60 + attempt * 25;
      const pt = { vx: clamp(p.vx + (Math.random() - .5) * spread * 2, 190, localMap.width - 190), vy: clamp(p.vy + (Math.random() - .5) * spread * 2, 190, localMap.height - 190) };
      if (!collidesLocalMap(pt, radius)) return pt;
    }
    return pickOpenLocalPoint(radius);
  }

  function visionRadius() {
    return RULES.rangeStuds * (localMap ? localMap.cellSize : 352);
  }

  // Per-tank timers: survival points (alive only), respawn countdown, invulnerability and magazine reload.
  function tickLocalTank(tank, dt) {
    if (dt > 0) {
      tank._v = { vx: (tank.tankPos.vx - tank._prev.vx) / dt, vy: (tank.tankPos.vy - tank._prev.vy) / dt };
      tank._prev = { ...tank.tankPos };
    }
    if (tank.tankAlive) {
      tank.tankInvulnerabilityLeft = Math.max(0, tank.tankInvulnerabilityLeft - dt);
      tank._survival += dt;
      const whole = Math.floor(tank._survival);
      if (whole > 0) { tank.tankPoints += whole * RULES.survivalPoints; tank._survival -= whole; }
    } else if (!(localGame && localGame.team)) {   // team mode: dead tanks stay dead until the next round
      tank.tankRespawnTimer = Math.max(0, tank.tankRespawnTimer - dt);
      if (tank.tankRespawnTimer === 0) respawnLocalTank(tank);
    }
    if (tank.tankReloadTimer > 0) {
      tank.tankReloadTimer = Math.max(0, tank.tankReloadTimer - dt);
      if (tank.tankReloadTimer === 0) tank.tankAmmo = tank.tankMaxAmmo;
    }
  }

  function respawnLocalTank(tank) {
    const g = localGame;
    tank.tankPos = { ...tank._spawn };
    tank.tankVel = { vx: 0, vy: 0 };
    tank.tankAlive = true;
    tank.tankRespawnTimer = 0;
    tank.tankInvulnerabilityLeft = RULES.invulnerableSeconds;
    // A respawned tank always starts with a full magazine and no leftover reload.
    tank.tankAmmo = tank.tankMaxAmmo;
    tank.tankReloadTimer = 0;
    tank._survival = 0;
    tank._cooldown = 1.2;
    tank._prev = { ...tank.tankPos }; tank._v = { vx: 0, vy: 0 };
    tank._path = []; tank._wp = null; tank._dodgeT = 0; tank._seen = 0;
    tank._lastSeen = null; tank._targetId = null; tank._roam = null; tank._dest = null; tank._sees = false; tank._stuckT = 0; tank._escapeT = 0; tank._losCheck = 0; tank._think = Math.random() * .3;
    if (tank === g.tanks[0]) {
      g.spectatorTankId = '';
      g.fireCooldown = 0;
      updateLocalCamera(tank.tankPos, 1);
      if (!g.team) addFeed(`Bạn đã hồi sinh. Bất tử ${RULES.invulnerableSeconds} giây, đạn đầy ${tank.tankMaxAmmo}/${tank.tankMaxAmmo}.`);
    }
  }

  function startLocalReload(tank) {
    if (!tank.tankAlive || tank.tankReloadTimer > 0 || tank.tankAmmo >= tank.tankMaxAmmo) return false;
    tank.tankReloadTimer = RULES.reloadSeconds;
    return true;
  }

  // Scoring: +10 per kill, +20 extra when the victim had a streak of 3 or more (shutdown).
  function killLocalTank(killer, victim) {
    const g = localGame, player = g.tanks[0];
    const victimStreak = victim.tankKillStreak;
    const shutdown = victimStreak >= RULES.streakStart;
    const points = RULES.killPoints + (shutdown ? RULES.shutdownBonus : 0);
    killer.tankKills++; killer.tankKillStreak++; killer.tankPoints += points;
    victim.tankDeaths++; victim.tankKillStreak = 0;
    victim.tankAlive = false; victim.tankVel = { vx: 0, vy: 0 };
    victim.tankRespawnTimer = g.team ? 0 : RULES.respawnSeconds; victim.tankInvulnerabilityLeft = 0;
    victim.tankReloadTimer = 0; victim._survival = 0;
    victim._multi = { count: 0, last: -999 };
    const multi = killer._multi;
    multi.count = g.time - multi.last <= RULES.multiKillWindow ? multi.count + 1 : 1;
    multi.last = g.time;
    if (victim === player) {
      g.spectatorTankId = killer.tankId;
      input.fire = false;
      setMovementSound(false);
      stopShotSounds();
      playSfx('explosion', .62 * SFX_MIX.explosion);
    } else {
      playSfx('explosion', .47 * SFX_MIX.explosion);
    }
    announceKill({ killer: killer.tankId, victim: victim.tankId, tier: Math.min(multi.count, 5), streak: killer.tankKillStreak, shutdown, points });
  }

  function updateOffline(dt) {
    if (!localGame || localGame.gameOver || isPaused) return;
    const g = localGame; g.time += dt; g.fireCooldown = Math.max(0,g.fireCooldown-dt);
    const player = g.tanks[0];
    const weapon = player.tankWeapon;
    weapon.wsBuffTimeLeft=Math.max(0,weapon.wsBuffTimeLeft-dt);
    if (weapon.wsBuffTimeLeft<=0 && weapon.wsCurrentWeapon!=='NormalBullet') weapon.wsCurrentWeapon='NormalBullet';
    if (input.fire && g.fireCooldown<=0) {
      localShoot(player,player.tankTurretAngle,weapon.wsCurrentWeapon);
      g.fireCooldown=weapon.wsCurrentWeapon==='NormalBullet'?0.5:1.0;
    }
    weapon.wsCooldownState = g.fireCooldown > 0 || player.tankReloadTimer > 0
      ? { tag: 'Reloading', contents: Math.max(g.fireCooldown, player.tankReloadTimer) }
      : 'Ready';

    g.boxTimer -= dt;
    if (g.boxTimer<=0 && g.boxes.length===0) {
      const pt=maze.mazeBoxSpawnPts[Math.floor(Math.random()*maze.mazeBoxSpawnPts.length)];
      g.boxes.push({pos:{...pt},life:12}); g.boxTimer=22+Math.random()*8;
    }
    g.boxes.forEach(box=>box.life-=dt); g.boxes=g.boxes.filter(b=>b.life>0);
    if (g.boxes.some(b=>distance(b.pos,player.tankPos)<23)) {
      g.boxes=[]; const special=['ShotgunBullet','LaserBullet','WallPiercingBullet','GatlingBullet'][Math.floor(Math.random()*4)];
      weapon.wsCurrentWeapon=special; weapon.wsBuffTimeLeft=15;
      SoundFX.pickup();
      addFeed(`Nhặt Mystery Box: ${weaponName(special)} trong 15 giây!`);
    }

    g.tanks.slice(1).forEach((bot)=>{
      if (!bot.tankAlive) {
        bot._respawn -= dt;
        if (bot._respawn <= 0) {
          bot.tankPos = getRandomSpawnPoint(maze, g.tanks);
          bot.tankAlive = true;
          bot._cooldown = 1.2;
        }
        return;
      }
      bot._cooldown-=dt; bot._dirTimer-=dt;
      const toX=player.tankPos.vx-bot.tankPos.vx, toY=player.tankPos.vy-bot.tankPos.vy;
      const dist=Math.hypot(toX,toY)||1;
      const primary={vx:bot.tankPos.vx+toX/dist*78*dt,vy:bot.tankPos.vy+toY/dist*78*dt};
      const altX={vx:primary.vx,vy:bot.tankPos.vy}; const altY={vx:bot.tankPos.vx,vy:primary.vy};
      if (!hitsWall(primary,TANK_RADIUS,true)) bot.tankPos=primary;
      else if (!hitsWall(altX,TANK_RADIUS,true)) bot.tankPos=altX;
      else if (!hitsWall(altY,TANK_RADIUS,true)) bot.tankPos=altY;
      else if (bot._dirTimer<=0) {bot._direction=Math.random()*Math.PI*2;bot._dirTimer=.8+Math.random()*1.5;}
      bot.tankBodyAngle=Math.atan2(toY,toX); bot.tankTurretAngle=bot.tankBodyAngle;
      if (bot._cooldown<=0 && dist<530) {localShoot(bot,Math.atan2(toY,toX),'NormalBullet');bot._cooldown=1.6+Math.random()*.8;}
    });

    const curW = WORLD_W;
    const curH = WORLD_H;
    const internalWalls = (maze && maze.mazeWalls ? maze.mazeWalls : []).slice(4);
    g.bullets.forEach(b=>{
      b.life-=dt;
      const oldX=b.pos.vx, oldY=b.pos.vy;
      const nextX=oldX+b.vel.vx*dt, nextY=oldY+b.vel.vy*dt;

      // Nảy 4 cạnh biên (giữ đạn luôn ở trong chiến trường)
      if (nextX<6) {b.vel.vx=Math.abs(b.vel.vx);b.pos.vx=6;b.bounces++;SoundFX.bounce();}
      else if (nextX>curW-6) {b.vel.vx=-Math.abs(b.vel.vx);b.pos.vx=curW-6;b.bounces++;SoundFX.bounce();}
      else {b.pos.vx=nextX;}

      if (nextY<6) {b.vel.vy=Math.abs(b.vel.vy);b.pos.vy=6;b.bounces++;SoundFX.bounce();}
      else if (nextY>curH-6) {b.vel.vy=-Math.abs(b.vel.vy);b.pos.vy=curH-6;b.bounces++;SoundFX.bounce();}
      else {b.pos.vy=nextY;}

      // Nảy tường nội bộ (Continuous Collision Detection - chống đạn xuyên tường)
      if (b.type!=='WallPiercingBullet') {
        const segStart={vx:oldX,vy:oldY}, segEnd={vx:b.pos.vx,vy:b.pos.vy};
        for (const w of internalWalls) {
          const hit=segmentIntersection(segStart,segEnd,w.wallStart,w.wallEnd);
          const closeDist=pointWallDistance(b.pos,w);
          if (hit || closeDist<7) {
            const isHoriz=Math.abs(w.wallEnd.vx-w.wallStart.vx)>=Math.abs(w.wallEnd.vy-w.wallStart.vy);
            if (isHoriz) {
              b.vel.vy*=-1;
              b.pos.vy=oldY<w.wallStart.vy?w.wallStart.vy-5:w.wallStart.vy+5;
            } else {
              b.vel.vx*=-1;
              b.pos.vx=oldX<w.wallStart.vx?w.wallStart.vx-5:w.wallStart.vx+5;
            }
            b.bounces++;
            SoundFX.bounce();
            break;
          }
        }
      }
      if (b.owner===player.tankId) {
        for (const bot of g.tanks.slice(1)) if (bot.tankAlive && distance(bot.tankPos,b.pos)<TANK_RADIUS+5) {
          bot.tankAlive=false;bot._respawn=2.3;player.tankKills++;player.tankScore++;g.kills++;g.score+=100;b.life=0;
          SoundFX.explosion();
          addFeed(`${player.tankId} hạ ${bot.tankId}!`,'warn');break;
        }
      } else if (player.tankAlive && distance(player.tankPos,b.pos)<TANK_RADIUS+5) {
        b.life=0;g.lives--;
        SoundFX.explosion();
        addFeed(`${b.owner} bắn trúng bạn. Còn ${g.lives} mạng!`,'warn');
        if(g.lives<=0){g.gameOver=true;showOverlay('XE TĂNG BỊ HẠ','Bạn đã hết mạng. Hãy thử lại và dùng tường để che chắn.','CHƠI LẠI',()=>{hideOverlay();startOffline();});}
        else {player.tankPos=getRandomSpawnPoint(maze, g.tanks);}
      }
    });
    g.bullets=g.bullets.filter(b=>b.life>0&&b.bounces<=5);
    if (g.tanks.slice(1).every(t=>!t.tankAlive)) g.wave += dt;
  }

  function localShoot(tank, angle, type) {
    if (!localGame) return;
    SoundFX.shoot(type);
    const dir = { vx: Math.cos(angle), vy: Math.sin(angle) };
    const pStart = { ...tank.tankPos };
    const maxOffset = 18;
    const pEnd = { vx: pStart.vx + dir.vx * maxOffset, vy: pStart.vy + dir.vy * maxOffset };

    // Kiểm tra an toàn: nếu xe tăng đứng tì sát tường, chặn đạn không spawn qua bên kia tường
    const allWalls = (maze && maze.mazeWalls) ? maze.mazeWalls : [];
    let earliestHit = null;
    let hitWall = null;

    for (const w of allWalls) {
      const hit = segmentIntersection(pStart, pEnd, w.wallStart, w.wallEnd);
      if (hit && (!earliestHit || hit.t < earliestHit.t)) {
        earliestHit = hit;
        hitWall = w;
      }
    }

    let origin = pEnd;
    let initialBounced = false;
    let initialVelScale = { vx: 1, vy: 1 };

    if (earliestHit && hitWall) {
      const safeT = Math.max(0.05, earliestHit.t - 0.15);
      origin = {
        vx: pStart.vx + dir.vx * maxOffset * safeT,
        vy: pStart.vy + dir.vy * maxOffset * safeT
      };
      if (type !== 'WallPiercingBullet') {
        const isHoriz = Math.abs(hitWall.wallEnd.vx - hitWall.wallStart.vx) >= Math.abs(hitWall.wallEnd.vy - hitWall.wallStart.vy);
        if (isHoriz) initialVelScale.vy = -1;
        else initialVelScale.vx = -1;
        initialBounced = true;
        SoundFX.bounce();
      }
    }

    const add = (a, speed = 390) => {
      const vx = Math.cos(a) * speed * initialVelScale.vx;
      const vy = Math.sin(a) * speed * initialVelScale.vy;
      localGame.bullets.push({
        pos: { ...origin },
        vel: { vx, vy },
        type,
        owner: tank.tankId,
        life: 4,
        bounces: initialBounced ? 1 : 0
      });
    };

    if (type === 'ShotgunBullet') { add(angle - 0.22, 340); add(angle, 365); add(angle + 0.22, 340); }
    else if (type === 'GatlingBullet') { add(angle, 410); add(angle + 0.04, 410); }
    else if (type === 'LaserBullet') { add(angle, 570); }
    else if (type === 'WallPiercingBullet') { add(angle, 350); }
    else add(angle, 400);
  }

  function segmentIntersection(p1, p2, p3, p4) {
    const d = (p2.vx - p1.vx) * (p4.vy - p3.vy) - (p2.vy - p1.vy) * (p4.vx - p3.vx);
    if (Math.abs(d) < 1e-7) return null;
    const t = ((p3.vx - p1.vx) * (p4.vy - p3.vy) - (p3.vy - p1.vy) * (p4.vx - p3.vx)) / d;
    const u = ((p3.vx - p1.vx) * (p2.vy - p1.vy) - (p3.vy - p1.vy) * (p2.vx - p1.vx)) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { t, pt: { vx: p1.vx + t * (p2.vx - p1.vx), vy: p1.vy + t * (p2.vy - p1.vy) } };
    }
    return null;
  }

  function hitsWall(pos, radius, includeInner, customWalls) {
    if (pos.vx < radius || pos.vx > WORLD_W - radius || pos.vy < radius || pos.vy > WORLD_H - radius) return true;
    const allW = customWalls || (maze && maze.mazeWalls ? maze.mazeWalls : []);
    const walls = includeInner ? allW.slice(4) : [];
    return walls.some(w => pointWallDistance(pos, w) < radius + 3);
  }

  function circleIntersectsRect(pos, radius, rect) {
    const x = clamp(pos.vx, rect.x, rect.x + rect.width);
    const y = clamp(pos.vy, rect.y, rect.y + rect.height);
    return (pos.vx - x) ** 2 + (pos.vy - y) ** 2 < radius ** 2;
  }

  function pickOpenLocalPoint(radius) {
    for (let attempt = 0; attempt < 160; attempt++) {
      const point = { vx: 190 + Math.random() * (localMap.width - 380), vy: 190 + Math.random() * (localMap.height - 380) };
      if (!collidesLocalMap(point, radius)) return point;
    }
    return { ...getLocalSpawns(localMap)[0] };
  }

  function updateLocalCamera(pos, delta) {
    if (!localMap) return;
    const view = localViewSize();
    const targetX = clamp(pos.vx - view.width / 2, 0, localMap.width - view.width);
    const targetY = clamp(pos.vy - view.height / 2, 0, localMap.height - view.height);
    const blend = Math.min(1, delta * 8);
    camera.x += (targetX - camera.x) * blend;
    camera.y += (targetY - camera.y) * blend;
  }

  function localViewSize() {
    if (!localMap) return { width: WORLD_W, height: WORLD_H };
    const targetWidth = WORLD_W / LOCAL_CAMERA_ZOOM;
    const width = Math.min(targetWidth, localMap.width, localMap.height * WORLD_W / WORLD_H);
    return { width, height: width * WORLD_H / WORLD_W };
  }

  function localWorldScale() { return WORLD_W / localViewSize().width; }
  function localToScreen(pos) {
    const scale = localWorldScale();
    return { x: (pos.vx - camera.x) * scale, y: (pos.vy - camera.y) * scale };
  }
  function screenToLocalWorld(x, y) {
    const scale = localWorldScale();
    return { vx: camera.x + x / scale, vy: camera.y + y / scale };
  }
  function distance(a, b) { return Math.hypot(a.vx - b.vx, a.vy - b.vy); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ---------------------------------------------------------------- render loop

  function startRenderLoop() {
    if (animationId !== null) return;
    lastFrameTime = performance.now();
    const frame = (time) => {
      animationId = requestAnimationFrame(frame);
      const dt = Math.min(.04, Math.max(0, (time - lastFrameTime) / 1000)); lastFrameTime = time;
      if (screenName !== 'game') { removeCountdownOverlay(); return; }
      fpsFrameCount++;
      if (time - fpsLast >= 1000) { $('fps-label').textContent = `${fpsFrameCount} FPS CLIENT`; fpsFrameCount = 0; fpsLast = time; }
      if (mode === 'offline') {
        updateOffline(dt);
        latestSnapshot = localSnapshot();
      }
      if (time - lastHudUpdate > 100) {
        lastHudUpdate = time;
        if (mode === 'offline') { updateMatchHeader(latestSnapshot); updateWeaponPanel(latestSnapshot); updateScoreboard(latestSnapshot); }
        updateRoundScore();
        updateGameplayHud(latestSnapshot);
      }
      renderSnapshot(latestSnapshot);
    };
    animationId = requestAnimationFrame(frame);
  }
  function stopRenderLoop() { if (animationId !== null) { cancelAnimationFrame(animationId); animationId = null; } }

  function renderSnapshot(snapshot) {
    resizeCanvasBacking();
    ctx.save();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const world=readField(snapshot,'wsMaze')||maze;
    const width=Number(readField(world,'mazeWidth')||WORLD_W),height=Number(readField(world,'mazeHeight')||WORLD_H);
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    ctx.scale(scaleX, scaleY);
    drawGround(width, height);
    drawWalls(readField(world,'mazeWalls')||(maze && maze.mazeWalls),width,height);
    const boxes=readField(snapshot,'wsMysteryBoxes')||[];
    boxes.forEach(box=>{if(readField(box,'mbActive')!==false)drawBox(readField(box,'mbPos'),height);});
    (readField(snapshot,'wsLasers')||[]).forEach(laser=>drawLaser(readField(laser,'lsStart'),readField(laser,'lsEnd'),height));
    (readField(snapshot,'wsBullets')||[]).forEach(b=>drawBullet(b,height));
    (readField(snapshot,'wsTanks')||[]).forEach(t=>drawTank(t,height));
    drawVignette(width, height);
    if(mode==='offline'&&localGame){drawOfflineHud(localGame);}
    ctx.restore();
  }

  function drawGround(w = WORLD_W, h = WORLD_H){
    ctx.fillStyle='#1d3020';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(126,163,100,.04)';
    const tileSize = 32;
    for(let y=0;y<h;y+=tileSize){
      for(let x=0;x<w;x+=tileSize){
        if(((Math.floor(x/tileSize)+Math.floor(y/tileSize))%2)===0)ctx.fillRect(x,y,tileSize,tileSize);
      }
    }
    ctx.strokeStyle='rgba(167,205,137,.08)';ctx.lineWidth=1;
    for(let x=0;x<=w;x+=tileSize){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<=h;y+=tileSize){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    // Subtle worn ground flecks
    const dotCount = Math.floor((w * h) / 10000);
    for(let i=0;i<dotCount;i++){
      const x=(i*157+33)%w,y=(i*97+19)%h;
      ctx.fillStyle='rgba(182,208,143,.045)';ctx.fillRect(x,y,2,2);
    }
  }

  function drawWalls(walls,width,height){
    ctx.save();ctx.lineCap='square';
    (walls||[]).forEach((wall,index)=>{
      const a=readField(wall,'wallStart'),b=readField(wall,'wallEnd');if(!a||!b)return;
      const x1=Number(readField(a,'vx')||0),y1=height-Number(readField(a,'vy')||0);
      const x2=Number(readField(b,'vx')||0),y2=height-Number(readField(b,'vy')||0);
      ctx.strokeStyle='rgba(5,11,7,.55)';ctx.lineWidth=index<4?15:12;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.strokeStyle=index<4?'#68815b':'#58704d';ctx.lineWidth=index<4?10:8;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.strokeStyle='rgba(207,232,171,.18)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x1+(x2-x1)*.04,y1+(y2-y1)*.04-1);ctx.lineTo(x2-(x2-x1)*.04,y2-(y2-y1)*.04-1);ctx.stroke();
      // Small rivets on straight wall runs.
      const len = Math.hypot(x2 - x1, y2 - y1), n = Math.floor(len / 24);
      for (let j = 1; j < n; j++) { const x = x1 + (x2 - x1) * j / n, y = y1 + (y2 - y1) * j / n; ctx.fillStyle = '#344633'; ctx.fillRect(x - 1, y - 1, 2, 2); }
    });
    ctx.restore();
  }

  function drawTank(tank, height) {
    if (readField(tank, 'tankAlive') === false) return;
    const pos = readField(tank, 'tankPos'); if (!pos) return;
    const x = Number(readField(pos, 'vx') || 0), y = height - Number(readField(pos, 'vy') || 0);
    const colorName = readField(tank, 'tankColor') || 'TankGreen';
    const color = COLORS[colorName] || '#8ae65e';
    const bodyAngle = Number(readField(tank, 'tankBodyAngle') || 0), turretAngle = Number(readField(tank, 'tankTurretAngle') || 0);
    ctx.save(); ctx.translate(x, y);
    const invulnOnline = Number(readField(tank, 'tankInvulnerabilityLeft') || 0);
    if (invulnOnline > 0) drawShield(26);
    ctx.strokeStyle = color; ctx.globalAlpha = .6; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    // Shadow then the reused project sprite. If images fail, draw a vector tank instead.
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(2, 4, 15, 19, 0, 0, Math.PI * 2); ctx.fill();
    const sprites = spritesFor(readField(tank, 'tankId'));
    const hull = sprites.hull;
    if (hull && hull.complete && hull.naturalWidth) {
      ctx.save(); ctx.rotate(Math.PI / 2 - bodyAngle); drawTinted(hull, color, -11, -18, 22, 36); ctx.restore();
    } else drawVectorHull(color, bodyAngle);
    const gun = sprites.gun;
    if (gun && gun.complete && gun.naturalWidth) { ctx.save(); ctx.rotate(Math.PI / 2 - turretAngle); drawTinted(gun, color, -7, -18, 14, 36); ctx.restore(); }
    else { ctx.save(); ctx.rotate(-turretAngle); ctx.fillStyle = color; ctx.fillRect(-3, -22, 6, 24); ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.restore();
    const onlineName = String(readField(tank, 'tankId') || '');
    drawNameTag(x, y - 26, onlineName, isMe(onlineName) ? '#f9df8b' : '#e8f0df');
  }

  function drawTinted(img, color, x, y, w, h) {
    // Keep the supplied sprite intact; color overlays created opaque rectangles.
    ctx.drawImage(img, x, y, w, h);
  }
  function drawVectorHull(color, angle) { ctx.save(); ctx.rotate(Math.PI / 2 - angle); ctx.fillStyle = '#1c2921'; ctx.fillRect(-10, -17, 20, 34); ctx.fillStyle = color; ctx.fillRect(-7, -15, 14, 30); ctx.fillStyle = '#101811'; ctx.fillRect(-3, -11, 6, 20); ctx.restore(); }

  function drawBullet(b, height) {
    const pos = readField(b, 'bulPos'); if (!pos) return; const type = readField(b, 'bulType') || 'NormalBullet';
    const x = Number(readField(pos, 'vx') || 0), y = height - Number(readField(pos, 'vy') || 0);
    const color = bulletColor(type);
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 9; ctx.fillStyle = color;
    if (type === 'LaserBullet') { ctx.fillRect(x - 2, y - 6, 4, 12); } else { ctx.beginPath(); ctx.arc(x, y, type === 'ShotgunBullet' ? 3.5 : 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function drawBox(pos, height = WORLD_H){
    if(!pos)return;const x=Number(readField(pos,'vx')||0),y=height-Number(readField(pos,'vy')||0);
    const im=images.box;
    ctx.save();ctx.shadowColor='#e8c95a';ctx.shadowBlur=12;
    if(im&&im.complete&&im.naturalWidth){ctx.drawImage(im,x-13,y-13,26,26);}else{ctx.fillStyle='#d3aa42';ctx.fillRect(x-11,y-11,22,22);ctx.fillStyle='#1c281b';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText('?',x,y+6);}
    ctx.restore();
  }
  function drawLaser(a,b,height){if(!a||!b)return;const x1=Number(readField(a,'vx')||0),y1=height-Number(readField(a,'vy')||0),x2=Number(readField(b,'vx')||0),y2=height-Number(readField(b,'vy')||0);ctx.save();ctx.strokeStyle='#89faff';ctx.shadowColor='#89faff';ctx.shadowBlur=12;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();}
  function drawVignette(w = WORLD_W, h = WORLD_H){const grad=ctx.createRadialGradient(w/2,h/2,80,w/2,h/2,Math.max(w,h)*.75);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(4,10,5,.33)');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);}
  function drawOfflineHud(g){ctx.save();ctx.fillStyle='rgba(7,13,8,.74)';ctx.fillRect(14,14,144,45);ctx.strokeStyle='rgba(199,243,107,.4)';ctx.strokeRect(14,14,144,45);ctx.fillStyle='#9caf94';ctx.font='8px "IBM Plex Mono",monospace';ctx.fillText('MẠNG CÒN LẠI',25,29);ctx.fillStyle='#c7f36b';ctx.font='bold 20px "Barlow Condensed",sans-serif';ctx.fillText('♥ '.repeat(Math.max(0,g.lives))+' '.repeat(Math.max(0,5-g.lives)),25,49);ctx.restore();}

  function updateMatchHeader(snapshot){
    if(!snapshot)return;
    const tanks=readField(snapshot,'wsTanks')||[];
    const mine=tanks.find(t=>readField(t,'tankId')===username)||tanks.find(t=>readField(t,'tankId')===displayName)||tanks[0];
    $('match-player-count').textContent=String(tanks.length||1);
    $('match-score').textContent=String(mine?(Number(readField(mine,'tankKills')||0) || Number(readField(mine,'tankScore')||0)):0);
    if(mode==='online'&&activeRoom)$('match-room').textContent=readField(activeRoom,'riRoomId')||'ONLINE';
    if(mode==='offline')$('match-score').textContent=String(localGame?localGame.score:0);
  }
  function updateScoreboard(snapshot){
    const root=$('scoreboard');root.innerHTML='';if(!snapshot)return;
    const tanks=readField(snapshot,'wsTanks')||[];const scorePairs=readField(snapshot,'wsScores')||[];
    const entries=tanks.map(t=>({name:readField(t,'tankId')||'PLAYER',color:readField(t,'tankColor')||'TankGreen',score:Number(readField(t,'tankKills')||0),alive:readField(t,'tankAlive')!==false}));
    scorePairs.forEach(pair=>{if(!Array.isArray(pair))return;let item=entries.find(e=>e.name===pair[0]);if(!item){item={name:pair[0],color:'TankBlue',score:0,alive:true};entries.push(item);}item.score=Math.max(item.score,Number(pair[1]||0));});
    entries.sort((a,b)=>b.score-a.score);
    if(!entries.length){root.innerHTML='<div class="feed-item muted">Đang đợi dữ liệu người chơi…</div>';return;}
    entries.forEach(e=>{const row=document.createElement('div');row.className='score-row';const dot=document.createElement('span');dot.className='score-dot';dot.style.background=COLORS[e.color]||'#c7f36b';const name=document.createElement('span');name.className='score-name';name.textContent=e.name+(e.alive?'':' · OUT');const score=document.createElement('strong');score.className='score-value';score.textContent=String(e.score);row.append(dot,name,score);root.append(row);});
  }
  function updateWeaponPanel(snapshot){
    if(!snapshot||!$('weapon-name'))return;const tanks=readField(snapshot,'wsTanks')||[];
    const mine=tanks.find(t=>readField(t,'tankId')===username)||tanks.find(t=>readField(t,'tankId')===displayName)||tanks[0];if(!mine)return;
    const weapon=readField(mine,'tankWeapon')||{};const type=readField(weapon,'wsCurrentWeapon')||'NormalBullet';
    const buff=Number(readField(weapon,'wsBuffTimeLeft')||0);const cooldown=readField(weapon,'wsCooldownState');
    if($('weapon-name')) $('weapon-name').textContent=weaponName(type).toUpperCase();
    if($('weapon-symbol')) $('weapon-symbol').textContent=weaponSymbol(type);
    if($('weapon-timer')) $('weapon-timer').textContent=buff>0?`BUFF CÒN ${buff.toFixed(1)}S`:cooldown==='Ready'||tagOf(cooldown)==='Ready'?'SẴN SÀNG':'ĐANG HỒI ĐẠN';
    let ratio=1;if(typeof cooldown==='object'&&cooldown){const tag=tagOf(cooldown);if(tag==='Reloading'){const v=Array.isArray(cooldown.contents)?cooldown.contents[0]:cooldown.contents;const maxCooldown=type==='NormalBullet'?0.5:1.0;ratio=1-clamp(Number(v||0)/maxCooldown,0,1);}else if(tag==='GatlingBurst'){ratio=.65;}}
    if($('cooldown-fill')) $('cooldown-fill').style.width=`${Math.round(ratio*100)}%`;
  }
  function weaponName(type){return ({NormalBullet:'Đạn thường',ShotgunBullet:'Đạn chùm',LaserBullet:'Tia laser',WallPiercingBullet:'Đạn xuyên tường',GatlingBullet:'Đạn liên thanh'})[type]||String(type||'Đạn thường').replace('Bullet','');}
  function weaponSymbol(type){return ({NormalBullet:'●',ShotgunBullet:'✹',LaserBullet:'ϟ',WallPiercingBullet:'↗',GatlingBullet:'»'})[type]||'●';}
  function addFeed(text,type=''){const root=$('event-feed');if(!root)return;const row=document.createElement('div');row.className=`feed-item ${type}`;const time=new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});row.textContent=`[${time}] ${text}`;root.prepend(row);while(root.children.length>8)root.lastElementChild.remove();}

  function showOverlay(title,text,buttonText,action){$('overlay-title').textContent=title;$('overlay-text').textContent=text;$('overlay-action').textContent=buttonText;roundOverlayAction=action;$('arena-overlay').hidden=false;}
  function hideOverlay(){$('arena-overlay').hidden=true;roundOverlayAction=null;}
  function updateCurrentInput(){
    if(mode!=='online'||!wsReady||!loggedIn||screenName!=='game')return;
    const snapshot=latestSnapshot;if(!snapshot)return;
    const tanks=readField(snapshot,'wsTanks')||[];const me=tanks.find(t=>readField(t,'tankId')===username)||tanks[0];if(!me)return;
    const pos=readField(me,'tankPos')||{vx:0,vy:0};
    const mouseWorldX=input.mouseX,mouseWorldY=WORLD_H-input.mouseY;
    const angle=Math.atan2(mouseWorldY-Number(readField(pos,'vy')||0),mouseWorldX-Number(readField(pos,'vx')||0));
    sendMessage('CPlayerInput',{piMoveUp:input.up,piMoveDown:input.down,piMoveLeft:input.left,piMoveRight:input.right,piMouseAngle:angle,piFire:input.fire});
  }
  function startInputSender(){stopInputSender();inputTimer=window.setInterval(updateCurrentInput,1000/30);}
  function stopInputSender(){if(inputTimer!==null){clearInterval(inputTimer);inputTimer=null;}}

  function setKey(key,pressed){const k=key.toLowerCase();if(['w','arrowup'].includes(k))input.up=pressed;else if(['s','arrowdown'].includes(k))input.down=pressed;else if(['a','arrowleft'].includes(k))input.left=pressed;else if(['d','arrowright'].includes(k))input.right=pressed;else if(k===' '||k==='space')input.fire=pressed;}
  document.addEventListener('keydown',e=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
    setKey(e.key,true);
    if(e.key==='Escape'&&screenName==='game'){
      e.preventDefault();
      togglePauseModal();
    }
  });
  document.addEventListener('keyup',e=>setKey(e.key,false));
  window.addEventListener('blur',()=>{input.up=input.down=input.left=input.right=input.fire=false;});
  function getCurrentWorldDimensions() {
    const world = (mode === 'online' && latestSnapshot) ? readField(latestSnapshot, 'wsMaze') : maze;
    const w = Number(readField(world, 'mazeWidth') || WORLD_W);
    const h = Number(readField(world, 'mazeHeight') || WORLD_H);
    return { w, h };
  }

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const dims = getCurrentWorldDimensions();
    input.mouseX = (e.clientX - rect.left) / rect.width * dims.w;
    input.mouseY = (e.clientY - rect.top) / rect.height * dims.h;
  });
  canvas.addEventListener('mousedown', e => { if (e.button === 0) { input.fire = true; } });
  window.addEventListener('mouseup', e => { if (e.button === 0) input.fire = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  let isPaused = false;
  function showPauseModal() {
    if (screenName !== 'game') return;
    const modal = $('pause-modal');
    if (!modal) return;
    isPaused = true;
    updatePauseSoundLabel();
    modal.hidden = false;
  }
  function hidePauseModal() {
    const modal = $('pause-modal');
    if (!modal) return;
    isPaused = false;
    modal.hidden = true;
  }
  function togglePauseModal() {
    if (screenName !== 'game') return;
    const modal = $('pause-modal');
    if (!modal) return;
    if (modal.hidden) showPauseModal();
    else hidePauseModal();
  }
  function updatePauseSoundLabel() {
    const label = $('pause-sound-label');
    if (label) label.textContent = soundEnabled ? 'BẬT' : 'TẮT';
  }
  function leaveCurrentMatch() {
    hidePauseModal();
    hideOverlay();
    if (mode === 'online') {
      if (activeRoom) sendMessage('CLeaveRoom');
      closeSocket(false);
      showScreen('lobby');
    } else {
      localGame = null;
      showScreen('home');
    }
  }

  $('online-button').addEventListener('click',connectOnline);
  $('player-name').addEventListener('keydown',e=>{if(e.key==='Enter')connectOnline();});
  $('server-url').addEventListener('keydown',e=>{if(e.key==='Enter')connectOnline();});
  $('practice-button').addEventListener('click',startOffline);
  $('brand-home').addEventListener('click',e=>{e.preventDefault();if(screenName==='game')togglePauseModal();else showScreen('home');});
  $('refresh-rooms').addEventListener('click',()=>{setError('lobby-error','');sendMessage('CListRooms');});
  $('create-button').addEventListener('click',createRoom);
  $('join-button').addEventListener('click',joinRoom);
  $('join-id').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);});
  $('join-id').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom();});
  $('start-button').addEventListener('click',()=>{setError('lobby-error','');if(!isHost){setError('lobby-error','Chỉ chủ phòng mới có thể bắt đầu.');return;}sendMessage('CStartGame');});
  $('leave-room').addEventListener('click',()=>{if(wsReady&&activeRoom)sendMessage('CLeaveRoom');else{activeRoom=null;showScreen('lobby');}});
  $('lobby-back').addEventListener('click',()=>{if(activeRoom)sendMessage('CLeaveRoom');else{closeSocket();showScreen('home');}});
  $('pause-open-btn')?.addEventListener('click',togglePauseModal);
  $('pause-resume-btn')?.addEventListener('click',hidePauseModal);
  $('pause-leave-btn')?.addEventListener('click',leaveCurrentMatch);
  $('pause-sound-btn')?.addEventListener('click',()=>{
    soundEnabled=!soundEnabled;
    $('sound-toggle').style.color=soundEnabled?'var(--lime)':'var(--muted)';
    if(soundEnabled){SoundFX.init();SoundFX.pickup();}
    updatePauseSoundLabel();
  });
  $('pause-fullscreen-btn')?.addEventListener('click',()=>{
    if(!document.fullscreenElement){document.documentElement.requestFullscreen().catch(()=>{});}
    else{document.exitFullscreen().catch(()=>{});}
  });
  $('exit-game')?.addEventListener('click',togglePauseModal);
  $('copy-room-code').addEventListener('click',async()=>{const code=$('room-code').textContent;try{await navigator.clipboard.writeText(code);$('copy-room-code').textContent='✓';setTimeout(()=>$('copy-room-code').textContent='⧉',900);}catch(_){$('join-id').value=code;}});
  $('overlay-action').addEventListener('click',()=>{const action=roundOverlayAction;hideOverlay();if(action)action();});
  $('sound-toggle').addEventListener('click',()=>{
    soundEnabled=!soundEnabled;
    $('sound-toggle').style.color=soundEnabled?'var(--lime)':'var(--muted)';
    if(soundEnabled){
      SoundFX.init();
      SoundFX.pickup();
    }
    updatePauseSoundLabel();
  });

  function pointerToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dims = getCurrentWorldDimensions();
    input.mouseX = (clientX - rect.left) / rect.width * dims.w;
    input.mouseY = (clientY - rect.top) / rect.height * dims.h;
  }
  canvas.addEventListener('mousemove', e => pointerToWorld(e.clientX, e.clientY));
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) { canvas.focus({ preventScroll: true }); input.fire = true; document.body.classList.add('mouse-pressed'); }
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) { input.fire = false; document.body.classList.remove('mouse-pressed'); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Start/stop the network input sender when the online game view is entered.
  const originalShowScreen=showScreen;
  showScreen=function(name){
    originalShowScreen(name);
    if(name==='game'){
      document.body.classList.add('in-game');
      hidePauseModal();
      resizeCanvasBacking();
      setTimeout(resizeCanvasBacking,50);
      setTimeout(resizeCanvasBacking,180);
      if(mode==='online')startInputSender();
    } else {
      document.body.classList.remove('in-game');
      hidePauseModal();
      stopInputSender();
      resizeCanvasBacking();
    }
  };

  // Keep layout responsive by dynamically sizing canvas backing buffer to screen resolution.
  function resizeCanvasBacking() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const dims = getCurrentWorldDimensions();
    const targetW = Math.max(dims.w, Math.round(rect.width * dpr));
    const targetH = Math.max(dims.h, Math.round(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }
  window.addEventListener('resize', resizeCanvasBacking);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvasBacking, 100));
  resizeCanvasBacking();

  // Fullscreen toggle support
  const fullscreenBtn = $('fullscreen-button');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
    document.addEventListener('fullscreenchange', () => {
      fullscreenBtn.textContent = document.fullscreenElement ? 'THU NHỎ 🗗' : '⛶ TOÀN MÀN HÌNH';
      setTimeout(resizeCanvasBacking, 60);
    });
  }

  // Touch screen support for responsive mobile/tablet play
  function handleTouch(e) {
    if (!e.touches.length) return;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const dims = getCurrentWorldDimensions();
    input.mouseX = (touch.clientX - rect.left) / rect.width * dims.w;
    input.mouseY = (touch.clientY - rect.top) / rect.height * dims.h;
  }
  canvas.addEventListener('touchstart', e => { e.preventDefault(); handleTouch(e); input.fire = true; }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); handleTouch(e); }, { passive: false });
  window.addEventListener('touchend', () => { input.fire = false; });

  // Expose a small protocol diagnostic through the console for coursework debugging.
  window.TankWarClient = { get mode() { return mode; }, get connected() { return wsReady; }, get room() { return activeRoom; }, send: sendMessage };
})();
