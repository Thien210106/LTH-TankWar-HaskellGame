/* TankWar browser client. No frontend build step is required.
 * Online protocol mirrors Common.Protocol.hs (Aeson Generic tagged encoding).
 * The offline practice mode uses the same canvas renderer but a local simulator.
 */
(() => {
  'use strict';

  let WORLD_W = 1344;
  let WORLD_H = 704;
  const TANK_RADIUS = 15;
  const TEST_GAME = window.TankWarTestGame || {
    enabled: false, cameraZoom: 1, collisionRadius: 128,
    tankRenderScale: 1, enemyVisibilityRadius: Infinity, playerRespawnSeconds: 5,
    defaultMapId: 'forest', localBotNames: ['CPU-ALPHA', 'CPU-BRAVO', 'CPU-DELTA'], winKills: Infinity
  };
  const LOCAL_WORLD_SIZE = 4096;
  const LOCAL_TANK_SIZE = 256;
  const LOCAL_TANK_RADIUS = TEST_GAME.collisionRadius;
  const LOCAL_CAMERA_ZOOM = TEST_GAME.cameraZoom;
  const LOCAL_WALL_THICKNESS = 88;
  const LOCAL_SPEED_SCALE = LOCAL_WORLD_SIZE / WORLD_W;
  const COLORS = {
    TankRed: '#ff655d', TankBlue: '#5ca9ff', TankGreen: '#8ae65e', TankYellow: '#ffd45d',
    red: '#ff655d', blue: '#5ca9ff', green: '#8ae65e', yellow: '#ffd45d'
  };
  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $('home-screen'), map: $('map-screen'), tankSelect: $('tank-select-screen'), lobby: $('lobby-screen'), room: $('room-screen'), game: $('game-screen'), results: $('results-screen')
  };
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const input = { up: false, down: false, left: false, right: false, fire: false, mouseX: WORLD_W / 2, mouseY: WORLD_H / 2 };
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

  const MAP_META = {
    forest: { label: 'FOREST', title: 'RỪNG RẬM', accent: '#b9d66a' },
    ruins: { label: 'RUINS', title: 'PHẾ TÍCH', accent: '#d6a77a' },
    depot: { label: 'DEPOT', title: 'KHO HÀNG', accent: '#d7ad65' }
  };
  const trainingMaps = new Map();
  const camera = { x: 0, y: 0 };
  const AUDIO_FILES = {
    menu: 'assets/audio/backgroundmenu.mp3', endMenu: 'assets/audio/backgroundmenuend.mp3', game: 'assets/audio/musicongame.mp3',
    click: 'assets/audio/clickmouse.mp3', countdown: 'assets/audio/coutdown.mp3', pickup: 'assets/audio/claimitem.mp3',
    explosion: 'assets/audio/explosion.mp3', winner: 'assets/audio/gamewinner.mp3', gameover: 'assets/audio/gameover.mp3',
    rank: 'assets/audio/rank.mp3', move: 'assets/audio/tankmove.mp3', normalShot: 'assets/audio/sungshot.mp3',
    laserShot: 'assets/audio/laser.mp3', gatlingShot: 'assets/audio/tieulien.mp3', piercingShot: 'assets/audio/xuyentuong.mp3'
  };
  const musicTracks = {
    menu: createLoopingAudio(AUDIO_FILES.menu, .28),
    game: createLoopingAudio(AUDIO_FILES.game, .23),
    results: createLoopingAudio(AUDIO_FILES.endMenu, .30)
  };
  const movementTrack = createLoopingAudio(AUDIO_FILES.move, .13);

  const mazeWalls = buildMazeWalls();
  const maze = {
    mazeWidth: WORLD_W,
    mazeHeight: WORLD_H,
    mazeWalls,
    mazeSpawnPts: [{ vx: 96, vy: 96 }, { vx: 736, vy: 480 }, { vx: 736, vy: 96 }, { vx: 96, vy: 480 }],
    mazeBoxSpawnPts: [{ vx: 256, vy: 288 }, { vx: 576, vy: 288 }, { vx: 416, vy: 128 }, { vx: 416, vy: 448 }, { vx: 416, vy: 288 }]
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

  const mapLoadPromise = loadTrainingMaps().catch(error => {
    mapLoadError = error && error.message ? error.message : 'Không đọc được dữ liệu map.';
    return null;
  });

  async function loadTrainingMaps() {
    const ids = Object.keys(MAP_META);
    await Promise.all(ids.map(async id => {
      const response = await fetch(`assets/maps/${id}_layout.json`, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Không tải được layout ${id.toUpperCase()} (${response.status}).`);
      const source = await response.json();
      const image = new Image();
      image.src = `assets/maps/${id}_maze_4096.png`;
      trainingMaps.set(id, normaliseTrainingMap(id, source, image));
    }));
  }

  function normaliseTrainingMap(id, source, background) {
    const number = value => Number(value || 0);
    const width = number(source.width) || LOCAL_WORLD_SIZE;
    const height = number(source.height) || LOCAL_WORLD_SIZE;
    const cellSize = number(source.cell_size) || 352;
    const gridOffset = number(source.grid_offset) || 112;
    const wallRects = (source.wall_rectangles || []).map(rect => ({
      x: number(rect.x), y: number(rect.y), width: number(rect.width), height: number(rect.height), kind: 'wall'
    }));
    const blockedRects = (source.blocked_cells || []).map(cell => {
      const col = number(cell[0]), row = number(cell[1]);
      return { x: gridOffset + col * cellSize, y: gridOffset + row * cellSize, width: cellSize, height: cellSize, kind: 'blocked' };
    });
    const spawns = (source.spawn_centres || []).map(point => ({ vx: number(point[0]), vy: number(point[1]) }));
    return {
      id, label: MAP_META[id].label, title: MAP_META[id].title, accent: MAP_META[id].accent,
      width, height, cellSize, gridOffset,
      tankSize: number(source.tank_reference_size) || LOCAL_TANK_SIZE,
      tankScale: number(source.tank_render_scale) || 1,
      wallThickness: number(source.wall_thickness) || LOCAL_WALL_THICKNESS,
      wallRects, blockedRects, collisionRects: wallRects.concat(blockedRects), spawns, background
    };
  }

  function createLoopingAudio(src, volume) {
    const track = new Audio(src);
    track.preload = 'auto';
    track.loop = true;
    track.volume = volume;
    return track;
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    syncMusicForScreen();
  }

  function playSfx(name, volume = .55) {
    if (!soundEnabled || !audioUnlocked || !AUDIO_FILES[name]) return;
    const sound = new Audio(AUDIO_FILES[name]);
    sound.preload = 'auto';
    sound.volume = volume;
    sound.play().catch(() => {});
  }

  function setMovementSound(isMoving) {
    if (!soundEnabled || !audioUnlocked || !isMoving) {
      movementTrack.pause();
      movementTrack.currentTime = 0;
      return;
    }
    movementTrack.play().catch(() => {});
  }

  function syncMusicForScreen() {
    const wanted = screenName === 'game' ? 'game' : screenName === 'results' ? 'results' : 'menu';
    Object.entries(musicTracks).forEach(([name, track]) => {
      if (!soundEnabled || !audioUnlocked || name !== wanted) {
        track.pause();
        if (name !== wanted) track.currentTime = 0;
      }
    });
    if (soundEnabled && audioUnlocked && currentMusic !== wanted) {
      currentMusic = wanted;
      musicTracks[wanted].play().catch(() => {});
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

  function showScreen(name) {
    screenName = name;
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    document.body.classList.toggle('in-game', name === 'game');
    if (name !== 'game') document.body.classList.remove('mouse-pressed');
    if (name === 'game') startRenderLoop();
    else stopRenderLoop();
    syncMusicForScreen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    let data = contentsOf(msg);
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
        if (countdownSecond > 0 && countdownSecond !== lastCountdownSecond) playSfx('countdown', .46);
        lastCountdownSecond = countdownSecond;
        $('countdown-banner').hidden = false;
        $('countdown-banner').textContent = `TRẬN ĐẤU BẮT ĐẦU SAU ${countdownSecond}…`;
        $('countdown-banner').textContent = `TRẬN ĐẤU BẮT ĐẦU SAU ${Math.max(0, Math.ceil(seconds || 0))}…`;
        SoundFX.countdown(seconds);
        break;
      }
      case 'SGameSnapshot': {
        latestSnapshot = unwrapOne(data);
        if (mode === 'online') {
          const phase = tagOf(readField(latestSnapshot, 'wsPhase'));
          if (phase === 'CountdownPhase') {
            $('phase-label').textContent = 'CHUẨN BỊ';
          } else if (phase === 'InGamePhase') {
            $('phase-label').textContent = 'ĐANG GIAO TRANH';
          } else if (phase === 'RoundEndPhase') {
            $('phase-label').textContent = 'KẾT THÚC HIỆP';
          } else if (phase === 'MatchOverPhase') {
            $('phase-label').textContent = 'KẾT THÚC TRẬN';
          }
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
        playSfx('rank', .48);
        showOverlay('KẾT THÚC HIỆP', `${winner} thắng hiệp này. Chuẩn bị cho vòng tiếp theo.`, 'TIẾP TỤC', () => hideOverlay());
        addFeed(`${winner} thắng hiệp đấu.`); break;
      }
      case 'SMatchOver': {
        const values = Array.isArray(data) ? data : [];
        const winner = values[0] || 'Chưa xác định';
        const scores = Array.isArray(values[1]) ? values[1] : [];
        showPostMatch({
          title: winner === username ? 'CHIẾN THẮNG' : 'TRẬN ĐẤU KẾT THÚC',
          summary: `${winner} là người chiến thắng chung cuộc.`,
          kills: 0, score: 0, map: 'ONLINE', scores
        });
        playSfx(winner === username ? 'winner' : 'gameover', .62);
        addFeed(`Chiến thắng chung cuộc: ${winner}`, 'warn'); break;
      }
      case 'SKillEvent': {
        const pair = Array.isArray(data) ? data : [];
        playSfx('explosion', .38);
        addFeed(`${pair[0] || 'Ai đó'} hạ ${pair[1] || 'đối thủ'}!`, 'warn'); break;
      }
      case 'SMysteryBoxPickup': {
        const pair = Array.isArray(data) ? data : [];
        playSfx('pickup', .52);
        addFeed(`${pair[0] || 'Người chơi'} nhặt hộp: ${weaponName(pair[1])}.`); break;
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

  function stringPayload(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data) && typeof data[0] === 'string') return data[0];
    if (data && typeof data === 'object') return data.message || data.error || data.contents || '';
    return '';
  }

  function showPostMatch({ title, summary, kills = 0, score = 0, map = 'FOREST', scores = [] }) {
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
    entries.slice(0, 4).forEach(([name, points], index) => {
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
    showScreen('results');
    playSfx('rank', .48);
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
      ? 'Phòng thử ghép cùng 3 bot. Map thử mặc định chỉ nằm trong testgame.js; map online vẫn do server ngẫu nhiên.'
      : roomId
        ? 'Mã phòng đã được cấp. Map và trạng thái trận online vẫn do server quyết định.'
        : 'Sau khi xác nhận, bạn sẽ kết nối để tìm hoặc tạo phòng. Map online do server chọn ngẫu nhiên.';
    refreshTankAssembly();
    showScreen('tankSelect');
  }

  function closeTankSelect() {
    if (tankSelectReturn === 'offline' || tankSelectReturn === 'connect') showScreen('home');
    else if (tankSelectReturn === 'room') showScreen('lobby');
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
      startOffline(TEST_GAME.defaultMapId || 'forest');
      return;
    }
    if (tankSelectReturn === 'connect') {
      // connectOnline keeps the existing WebSocket protocol and reads this
      // hidden compatibility field; all editable naming remains in the garage.
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
      info.append(h3,p,tags);
      const button = document.createElement('button'); button.className = 'join-room-button'; button.type = 'button'; button.textContent = 'THAM GIA →';
      button.disabled = phase !== 'LobbyPhase' || current >= max;
      button.addEventListener('click', () => { $('join-id').value = id; joinRoom(); });
      card.append(info,button); root.append(card);
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
    while (list.length < Math.max(1, Math.min(current, max))) list.push({ name: `CHIẾN BINH ${String(list.length + 1).padStart(2,'0')}`, color: ['TankBlue','TankGreen','TankYellow'][list.length % 3], waiting: true });
    list.forEach((player,index) => {
      const row = document.createElement('div'); row.className = 'player-row';
      const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.style.color = COLORS[player.color] || '#c7f36b'; avatar.textContent = (player.name || '?').slice(0,1).toUpperCase();
      const titleWrap = document.createElement('div');
      const title = document.createElement('div'); title.className = 'player-name'; title.textContent = player.name;
      const sub = document.createElement('div'); sub.className = 'player-sub'; sub.textContent = player.waiting ? 'ĐÃ KẾT NỐI · ĐANG ĐỒNG BỘ' : player.self ? 'BẠN · ĐÃ KẾT NỐI' : 'ĐÃ KẾT NỐI';
      titleWrap.append(title,sub); row.append(avatar,titleWrap);
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

  function renderRoomPlayersOnlineFallback() {
    if (!activeRoom) return;
    roomPlayerNames = [{ name: username || displayName || 'Bạn', color: isHost ? 'TankRed' : 'TankBlue', self: true, host: isHost }];
    renderRoomPlayers();
  }

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

  function chooseOfflineMap(mapId) {
    unlockAudio();
    selectedMapId = mapId;
    openTankSelect('offline');
  }

  async function startOffline(mapId = TEST_GAME.defaultMapId || 'forest') {
    unlockAudio();
    enterGameplayFullscreen();
    await mapLoadPromise;
    const chosenMap = trainingMaps.get(mapId);
    if (!chosenMap) {
      setError('map-error', `Không thể khởi tạo map ${String(mapId).toUpperCase()}. ${mapLoadError || 'Kiểm tra static server.'}`);
      return;
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
    localGame = createLocalGame(username);
    latestSnapshot = localSnapshot();
    $('match-mode').textContent = 'OFFLINE PRACTICE';
    $('match-room').textContent = chosenMap.label;
    $('phase-label').textContent = 'ĐANG THỰC HÀNH';
    $('match-player-count').textContent = '4';
    setError('home-error', '');
    statusPill('idle', 'CHẾ ĐỘ OFFLINE');
    updateMatchHeader(latestSnapshot); updateScoreboard(latestSnapshot); updateWeaponPanel(latestSnapshot);
    showScreen('game');
    addFeed(`Bắt đầu thực hành tại ${chosenMap.label}.`);
  }

  function createLocalGame(name) {
    const spawns = getLocalSpawns(localMap);
    const colors = [selectedTankColor].concat(['TankRed','TankBlue','TankGreen','TankYellow'].filter(color => color !== selectedTankColor));
    const names = [name].concat(TEST_GAME.localBotNames);
    const tanks = names.map((n,i) => ({
      tankId: n,
      tankPos: { ...spawns[i] }, tankVel: { vx: 0, vy: 0 }, tankBodyAngle: 0,
      tankTurretAngle: Math.PI, tankColor: colors[i],
      tankWeapon: { wsCurrentWeapon: 'NormalBullet', wsBuffTimeLeft: 0, wsCooldownState: 'Ready' },
      tankAlive: true, tankScore: 0, tankKills: 0,
      _bot: i > 0, _cooldown: .8 + i * .45, _respawn: 0, _dirTimer: 0, _direction: Math.random() * Math.PI * 2
    }));
    const view = localViewSize();
    camera.x = clamp(spawns[0].vx - view.width / 2, 0, localMap.width - view.width);
    camera.y = clamp(spawns[0].vy - view.height / 2, 0, localMap.height - view.height);
    const magazineSize = Number(TEST_GAME.magazineSize || 6);
    return {
      name, tanks, bullets: [], boxes: [], lasers: [], time: 0, boxTimer: 10,
      fireCooldown: 0, lives: 5, score: 0, gameOver: false, kills: 0, wave: 1,
      ammo: magazineSize, maxAmmo: magazineSize,
      reloadTimer: 0, reloadSeconds: Number(TEST_GAME.reloadSeconds || 2.2),
      respawnTimer: 0, spectatorTankId: ''
    };
  }

  function getLocalSpawns(map) {
    const preferred = (map.spawns || []).map(point => ({ ...point }));
    const fallbacks = [
      { vx: map.width - 288, vy: 288 }, { vx: 288, vy: map.height - 288 },
      { vx: map.width - 288, vy: map.height - 288 }
    ];
    return preferred.concat(fallbacks).filter((point, index, points) =>
      !points.slice(0, index).some(other => other.vx === point.vx && other.vy === point.vy)
    ).slice(0, 4);
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
      wsTanks: localGame.tanks.map(t => ({ tankId:t.tankId,tankPos:t.tankPos,tankVel:t.tankVel,tankBodyAngle:t.tankBodyAngle,tankTurretAngle:t.tankTurretAngle,tankColor:t.tankColor,tankWeapon:t.tankWeapon,tankAlive:t.tankAlive,tankScore:t.tankScore,tankKills:t.tankKills })),
      wsBullets: localGame.bullets.map(b => ({ bulPos:b.pos,bulVel:b.vel,bulType:b.type,bulOwnerId:b.owner,bulBounces:b.bounces,bulLifetime:b.life })),
      wsLasers: localGame.lasers,
      wsMysteryBoxes: localGame.boxes.map(b => ({ mbPos:b.pos,mbActive:true,mbRespawnIn:0 })),
      wsMaze: maze,
      wsPhase: localGame.gameOver ? { tag:'MatchOverPhase', contents:localGame.name } : { tag:'InGamePhase' },
      wsScores: localGame.tanks.map(t => [t.tankId,t.tankScore])
    };
  }

  function updateOffline(dt) {
    if (!localGame || localGame.gameOver || isPaused) return;
    const g = localGame; g.time += dt; g.fireCooldown = Math.max(0,g.fireCooldown-dt);
    if (g.reloadTimer > 0) {
      g.reloadTimer = Math.max(0, g.reloadTimer - dt);
      if (g.reloadTimer === 0) g.ammo = g.maxAmmo;
    }
    const player = g.tanks[0];
    const weapon = player.tankWeapon;
    if (player.tankAlive) {
      const dx = (input.right?1:0)-(input.left?1:0), dy = (input.down?1:0)-(input.up?1:0);
      if (dx || dy) {
        const len = Math.hypot(dx,dy); const mx=dx/len*150*LOCAL_SPEED_SCALE*dt, my=dy/len*150*LOCAL_SPEED_SCALE*dt;
        moveLocalTank(player, mx, my);
        player.tankBodyAngle = Math.atan2(dy,dx);
      }
      setMovementSound(!!(dx || dy));
      updateLocalCamera(player.tankPos, dt);
      const pointer = screenToLocalWorld(input.mouseX, input.mouseY);
      player.tankTurretAngle=Math.atan2(pointer.vy-player.tankPos.vy,pointer.vx-player.tankPos.vx);
    } else {
      input.fire = false;
      setMovementSound(false);
      g.respawnTimer = Math.max(0, g.respawnTimer - dt);
      const killer = g.tanks.find(tank => tank.tankId === g.spectatorTankId && tank.tankAlive)
        || g.tanks.slice(1).find(tank => tank.tankAlive);
      if (killer) updateLocalCamera(killer.tankPos, dt);
      if (g.respawnTimer === 0) {
        player.tankPos = { ...getLocalSpawns(localMap)[0] };
        player.tankVel = { vx: 0, vy: 0 };
        player.tankAlive = true;
        g.spectatorTankId = '';
        updateLocalCamera(player.tankPos, dt);
        addFeed('Bạn đã hồi sinh sau 5 giây.');
      }
    }
    weapon.wsBuffTimeLeft=Math.max(0,weapon.wsBuffTimeLeft-dt);
    if (weapon.wsBuffTimeLeft<=0 && weapon.wsCurrentWeapon!=='NormalBullet') weapon.wsCurrentWeapon='NormalBullet';
    if (player.tankAlive && input.fire && g.fireCooldown<=0 && g.ammo > 0) {
      localShoot(player,player.tankTurretAngle,weapon.wsCurrentWeapon);
      g.fireCooldown=weapon.wsCurrentWeapon==='NormalBullet'?1:2;
      g.ammo--;
      if (g.ammo === 0) g.reloadTimer = g.reloadSeconds;
      g.fireCooldown=weapon.wsCurrentWeapon==='NormalBullet'?0.5:1.0;
    }
    weapon.wsCooldownState = g.fireCooldown > 0 || g.reloadTimer > 0
      ? { tag: 'Reloading', contents: Math.max(g.fireCooldown, g.reloadTimer) }
      : 'Ready';
    g.boxTimer -= dt;
    if (g.boxTimer<=0 && g.boxes.length===0) {
      const pt = pickOpenLocalPoint(26);
      g.boxes.push({pos:{...pt},life:12}); g.boxTimer=22+Math.random()*8;
    }
    g.boxes.forEach(box=>box.life-=dt); g.boxes=g.boxes.filter(b=>b.life>0);
    if (player.tankAlive && g.boxes.some(b=>distance(b.pos,player.tankPos)<LOCAL_TANK_RADIUS+28)) {
      g.boxes=[]; const special=['ShotgunBullet','LaserBullet','WallPiercingBullet','GatlingBullet'][Math.floor(Math.random()*4)];
      weapon.wsCurrentWeapon=special; weapon.wsBuffTimeLeft=15;
      playSfx('pickup', .58);
      addFeed(`Nhặt Mystery Box: ${weaponName(special)} trong 15 giây!`);
    }

    g.tanks.slice(1).forEach((bot,idx)=>{
      if (!bot.tankAlive) { bot._respawn-=dt; if (bot._respawn<=0) { const sp=getLocalSpawns(localMap)[idx+1]; bot.tankPos={...sp}; bot.tankAlive=true; bot._cooldown=1.2; } return; }
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
      const speed = 78 * LOCAL_SPEED_SCALE * dt;
      const moveX = toX / dist * speed, moveY = toY / dist * speed;
      const before = { ...bot.tankPos };
      moveLocalTank(bot, moveX, moveY);
      if (distance(before, bot.tankPos) < .01 && bot._dirTimer<=0) {bot._direction=Math.random()*Math.PI*2;bot._dirTimer=.8+Math.random()*1.5;}
      else if (bot._dirTimer<=0) {bot._direction=Math.random()*Math.PI*2;bot._dirTimer=.8+Math.random()*1.5;}
      bot.tankBodyAngle=Math.atan2(toY,toX); bot.tankTurretAngle=bot.tankBodyAngle;
      if (bot._cooldown<=0 && dist<530*LOCAL_SPEED_SCALE) {localShoot(bot,Math.atan2(toY,toX),'NormalBullet');bot._cooldown=1.6+Math.random()*.8;}
    });

    g.bullets.forEach(b=>{
      b.life-=dt; const nx=b.pos.vx+b.vel.vx*dt, ny=b.pos.vy+b.vel.vy*dt;
      if (nx<12||nx>localMap.width-12) {b.vel.vx*=-1;b.bounces++;b.pos.vx=clamp(nx,12,localMap.width-12);} else b.pos.vx=nx;
      if (ny<12||ny>localMap.height-12) {b.vel.vy*=-1;b.bounces++;b.pos.vy=clamp(ny,12,localMap.height-12);} else b.pos.vy=ny;
      if (b.type!=='WallPiercingBullet' && collidesLocalMap(b.pos,12)) b.life=0;
      if (b.owner===player.tankId) {
        for (const bot of g.tanks.slice(1)) if (bot.tankAlive && distance(bot.tankPos,b.pos)<LOCAL_TANK_RADIUS+14) {
          bot.tankAlive=false;bot._respawn=2.3;player.tankKills++;player.tankScore++;g.kills++;g.score+=100;b.life=0;playSfx('explosion', .47);addFeed(`${player.tankId} hạ ${bot.tankId}!`,'warn');break;
        }
      } else if (player.tankAlive && distance(player.tankPos,b.pos)<LOCAL_TANK_RADIUS+14) {
        b.life=0;g.lives--;playSfx('explosion', .62);addFeed(`${b.owner} bắn trúng bạn. Còn ${g.lives} mạng!`,'warn');
        if(g.lives<=0){
          g.gameOver=true;
          setMovementSound(false);
          playSfx('gameover', .66);
          showPostMatch({ title:'XE TĂNG BỊ HẠ', summary:'Bạn đã dùng hết mạng trong bài thực hành.', kills:g.kills, score:g.score, map:localMap.label, scores:g.tanks.map(t=>[t.tankId,t.tankScore]) });
        } else {
          player.tankAlive = false;
          g.spectatorTankId = b.owner;
          g.respawnTimer = Number(TEST_GAME.playerRespawnSeconds || 5);
          addFeed(`Bạn bị hạ. Đang theo dõi ${b.owner} trong 5 giây.`, 'warn');
        }
      }
    });
    g.bullets=g.bullets.filter(b=>b.life>0&&b.bounces<=4);
    if (!g.gameOver && g.kills >= TEST_GAME.winKills) {
      g.gameOver = true;
      setMovementSound(false);
      playSfx('winner', .66);
      showPostMatch({ title:'NHIỆM VỤ HOÀN TẤT', summary:`Bạn đã hạ ${g.kills} bot trong phòng thử.`, kills:g.kills, score:g.score, map:localMap.label, scores:g.tanks.map(t=>[t.tankId,t.tankScore]) });
      return;
    }
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
    const sound = type === 'LaserBullet' ? 'laserShot' : type === 'GatlingBullet' ? 'gatlingShot' : type === 'WallPiercingBullet' ? 'piercingShot' : 'normalShot';
    playSfx(sound, tank.tankId === localGame.name ? .43 : .16);
    const muzzleOffset = LOCAL_TANK_SIZE * .44 * Number(TEST_GAME.tankRenderScale || .5);
    const origin={vx:tank.tankPos.vx+Math.cos(angle)*muzzleOffset,vy:tank.tankPos.vy+Math.sin(angle)*muzzleOffset};
    const add=(a,speed=390)=>localGame.bullets.push({pos:{...origin},vel:{vx:Math.cos(a)*speed*LOCAL_SPEED_SCALE,vy:Math.sin(a)*speed*LOCAL_SPEED_SCALE},type,owner:tank.tankId,life:4,bounces:0});
    if(type==='ShotgunBullet'){add(angle-.22,340);add(angle,365);add(angle+.22,340);}
    else if(type==='GatlingBullet'){add(angle,410);add(angle+.04,410);}
    else if(type==='LaserBullet'){add(angle,570);}
    else if(type==='WallPiercingBullet'){add(angle,350);}
    else add(angle,400);
  }

  function moveLocalTank(tank, deltaX, deltaY) {
    const pos = tank.tankPos;
    const nextX = { vx: pos.vx + deltaX, vy: pos.vy };
    const nextY = { vx: pos.vx, vy: pos.vy + deltaY };
    if (!collidesLocalMap(nextX, LOCAL_TANK_RADIUS)) pos.vx = nextX.vx;
    if (!collidesLocalMap(nextY, LOCAL_TANK_RADIUS)) pos.vy = nextY.vy;
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

  function collidesLocalMap(pos, radius) {
    if (!localMap || pos.vx < radius || pos.vx > localMap.width - radius || pos.vy < radius || pos.vy > localMap.height - radius) return true;
    return localMap.collisionRects.some(rect => circleIntersectsRect(pos, radius, rect));
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
  function distance(a,b){return Math.hypot(a.vx-b.vx,a.vy-b.vy)}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}

  function startRenderLoop() {
    if (animationId !== null) return;
    lastFrameTime = performance.now();
    const frame = (time) => {
      animationId = requestAnimationFrame(frame);
      const dt = Math.min(.04, Math.max(0,(time-lastFrameTime)/1000)); lastFrameTime=time;
      if (screenName !== 'game') return;
      fpsFrameCount++;
      if (time-fpsLast>=1000){$('fps-label').textContent=`${fpsFrameCount} FPS CLIENT`;fpsFrameCount=0;fpsLast=time;}
      if (mode==='offline') {updateOffline(dt);latestSnapshot=localSnapshot();updateMatchHeader(latestSnapshot);updateWeaponPanel(latestSnapshot);updateScoreboard(latestSnapshot);}
      renderSnapshot(latestSnapshot);
    };
    animationId=requestAnimationFrame(frame);
  }
  function stopRenderLoop(){if(animationId!==null){cancelAnimationFrame(animationId);animationId=null;} }

  function renderSnapshot(snapshot) {
    if (!snapshot) return;
    ctx.clearRect(0,0,WORLD_W,WORLD_H);
    if (mode === 'offline' && localMap) {
      renderOfflineSnapshot(snapshot);
      return;
    }
    drawGround();
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

  function renderOfflineSnapshot(snapshot) {
    const map = localMap;
    const background = map.background;
    const view = localViewSize();
    if (background.complete && background.naturalWidth) {
      ctx.drawImage(background, camera.x, camera.y, view.width, view.height, 0, 0, WORLD_W, WORLD_H);
    } else {
      ctx.fillStyle = '#172017';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    const boxes = readField(snapshot, 'wsMysteryBoxes') || [];
    boxes.forEach(box => { if (readField(box, 'mbActive') !== false) drawOfflineBox(readField(box, 'mbPos')); });
    (readField(snapshot, 'wsBullets') || []).forEach(drawOfflineBullet);
    (readField(snapshot, 'wsTanks') || []).filter(isOfflineTankVisible).forEach(drawOfflineTank);
    drawFogOfWar();
    drawOfflineHud(localGame);
  }

  function isOfflineTankVisible(tank) {
    if (!localGame || readField(tank, 'tankAlive') === false) return false;
    const observer = getOfflineCameraTank();
    if (!observer || tank.tankId === observer.tankId) return true;
    const targetPos = readField(tank, 'tankPos');
    return !!targetPos && distance(observer.tankPos, targetPos) <= Number(TEST_GAME.enemyVisibilityRadius || 1120);
  }

  function getOfflineCameraTank() {
    if (!localGame) return null;
    const player = localGame.tanks[0];
    if (player && player.tankAlive) return player;
    return localGame.tanks.find(tank => tank.tankId === localGame.spectatorTankId && tank.tankAlive)
      || localGame.tanks.slice(1).find(tank => tank.tankAlive)
      || null;
  }

  function drawFogOfWar() {
    const observer = getOfflineCameraTank();
    if (!observer) return;
    const screen = localToScreen(observer.tankPos);
    const radius = Number(TEST_GAME.enemyVisibilityRadius || 1120) * localWorldScale();
    const fogRadius = radius * 1.35;
    const fog = ctx.createRadialGradient(screen.x, screen.y, radius * .88, screen.x, screen.y, fogRadius);
    fog.addColorStop(0, 'rgba(4,9,5,0)');
    fog.addColorStop(.20, 'rgba(4,9,5,0)');
    fog.addColorStop(.64, 'rgba(4,9,5,.20)');
    // The last stop keeps terrain readable while clearly fogging the outer map.
    fog.addColorStop(1, 'rgba(4,9,5,.58)');
    ctx.save();
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.strokeStyle = 'rgba(224,244,193,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawOfflineTank(tank) {
    if (readField(tank, 'tankAlive') === false) return;
    const pos = readField(tank, 'tankPos'); if (!pos) return;
    const screen = localToScreen({ vx: Number(readField(pos, 'vx') || 0), vy: Number(readField(pos, 'vy') || 0) });
    const x = screen.x, y = screen.y;
    const color = COLORS[readField(tank, 'tankColor')] || '#8ae65e';
    const bodyAngle = Number(readField(tank, 'tankBodyAngle') || 0);
    const turretAngle = Number(readField(tank, 'tankTurretAngle') || 0);
    const size = localMap.tankSize * localMap.tankScale * Number(TEST_GAME.tankRenderScale || .5) * localWorldScale();
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(8, 10, size*.33, size*.41, 0, 0, Math.PI*2); ctx.fill();
    const hull = images.hull;
    if (hull && hull.complete && hull.naturalWidth) {
      ctx.save(); ctx.rotate(bodyAngle + Math.PI / 2); drawTinted(hull, color, -size/2, -size/2, size, size); ctx.restore();
    } else {
      ctx.fillStyle = color; ctx.fillRect(-size*.29, -size*.38, size*.58, size*.76);
    }
    const gun = images.gun;
    if (gun && gun.complete && gun.naturalWidth) {
      ctx.save(); ctx.rotate(turretAngle + Math.PI / 2); drawTinted(gun, color, -size/2, -size/2, size, size); ctx.restore();
    }
    ctx.restore();
  }

  function drawOfflineBullet(bullet) {
    const pos = readField(bullet, 'bulPos'); if (!pos) return;
    const type = readField(bullet, 'bulType') || 'NormalBullet';
    const screen = localToScreen({ vx: Number(readField(pos, 'vx') || 0), vy: Number(readField(pos, 'vy') || 0) });
    const x = screen.x, y = screen.y;
    const color = type === 'LaserBullet' ? '#82f9ff' : type === 'ShotgunBullet' ? '#ffca73' : type === 'WallPiercingBullet' ? '#c39aff' : type === 'GatlingBullet' ? '#ff9658' : '#e6efc4';
    const radius = Math.max(2, (type === 'ShotgunBullet' ? 9 : 7) * localWorldScale());
    ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI*2); ctx.fill(); ctx.restore();
  }

  function drawOfflineBox(pos) {
    if (!pos) return;
    const screen = localToScreen({ vx: Number(readField(pos, 'vx') || 0), vy: Number(readField(pos, 'vy') || 0) });
    const x = screen.x, y = screen.y;
    const size = 56 * localWorldScale();
    const image = images.box;
    ctx.save(); ctx.shadowColor = '#f3d466'; ctx.shadowBlur = 18;
    if (image && image.complete && image.naturalWidth) ctx.drawImage(image, x-size/2, y-size/2, size, size);
    else { ctx.fillStyle = '#e1bc4e'; ctx.fillRect(x-size*.4, y-size*.4, size*.8, size*.8); ctx.fillStyle='#132013';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText('?',x,y+4); }
    ctx.restore();
  }

  function drawGround(){
    ctx.fillStyle='#1d3020';ctx.fillRect(0,0,WORLD_W,WORLD_H);
    ctx.fillStyle='rgba(126,163,100,.035)';
    for(let y=0;y<WORLD_H;y+=32)for(let x=0;x<WORLD_W;x+=32)if(((x/32+y/32)%2)===0)ctx.fillRect(x,y,32,32);
    ctx.strokeStyle='rgba(167,205,137,.075)';ctx.lineWidth=1;
    for(let x=0;x<=WORLD_W;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD_H);ctx.stroke();}
    for(let y=0;y<=WORLD_H;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD_W,y);ctx.stroke();}
    // Subtle worn ground flecks make the map less like an empty grid.
    for(let i=0;i<55;i++){const x=(i*137+33)%WORLD_W,y=(i*79+19)%WORLD_H;ctx.fillStyle='rgba(182,208,143,.045)';ctx.fillRect(x,y,2,2);}
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
      const len=Math.hypot(x2-x1,y2-y1),n=Math.floor(len/24);
      for(let j=1;j<n;j++){const x=x1+(x2-x1)*j/n,y=y1+(y2-y1)*j/n;ctx.fillStyle='#344633';ctx.fillRect(x-1,y-1,2,2);}
    });ctx.restore();
  }

  function drawTank(tank,height){
    if(readField(tank,'tankAlive')===false)return;
    const pos=readField(tank,'tankPos');if(!pos)return;
    const x=Number(readField(pos,'vx')||0),y=height-Number(readField(pos,'vy')||0);
    const colorName=readField(tank,'tankColor')||'TankGreen';
    const color=COLORS[colorName]||'#8ae65e';
    const bodyAngle=Number(readField(tank,'tankBodyAngle')||0),turretAngle=Number(readField(tank,'tankTurretAngle')||0);
    ctx.save();ctx.translate(x,y);
    ctx.strokeStyle=color;ctx.globalAlpha=.6;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,21,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    // Shadows then the reused project sprite. If images fail, draw a vector tank instead.
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(2,4,15,19,0,0,Math.PI*2);ctx.fill();
    const hull=images.hull;
    if(hull&&hull.complete&&hull.naturalWidth){
      ctx.save();ctx.rotate(Math.PI/2-bodyAngle);drawTinted(hull,color,-11,-18,22,36);ctx.restore();
    } else drawVectorHull(color,bodyAngle);
    const gun=images.gun;
    if(gun&&gun.complete&&gun.naturalWidth){ctx.save();ctx.rotate(Math.PI/2-turretAngle);drawTinted(gun,color,-7,-18,14,36);ctx.restore();}
    else {ctx.save();ctx.rotate(-turretAngle);ctx.fillStyle=color;ctx.fillRect(-3,-22,6,24);ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();ctx.restore();}
    ctx.restore();
  }

  function drawTinted(img,color,x,y,w,h){
    // Keep the supplied sprite intact; color overlays created opaque rectangles.
    ctx.drawImage(img,x,y,w,h);
  }
  function drawVectorHull(color,angle){ctx.save();ctx.rotate(Math.PI/2-angle);ctx.fillStyle='#1c2921';ctx.fillRect(-10,-17,20,34);ctx.fillStyle=color;ctx.fillRect(-7,-15,14,30);ctx.fillStyle='#101811';ctx.fillRect(-3,-11,6,20);ctx.restore();}

  function drawBullet(b,height){
    const pos=readField(b,'bulPos');if(!pos)return;const type=readField(b,'bulType')||'NormalBullet';
    const x=Number(readField(pos,'vx')||0),y=height-Number(readField(pos,'vy')||0);
    const color=type==='LaserBullet'?'#82f9ff':type==='ShotgunBullet'?'#ffca73':type==='WallPiercingBullet'?'#c39aff':type==='GatlingBullet'?'#ff9658':'#e6efc4';
    ctx.save();ctx.shadowColor=color;ctx.shadowBlur=9;ctx.fillStyle=color;
    if(type==='LaserBullet'){ctx.fillRect(x-2,y-6,4,12);}else{ctx.beginPath();ctx.arc(x,y,type==='ShotgunBullet'?3.5:3,0,Math.PI*2);ctx.fill();}
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
  function drawVignette(){const grad=ctx.createRadialGradient(WORLD_W/2,WORLD_H/2,80,WORLD_W/2,WORLD_H/2,Math.max(WORLD_W,WORLD_H)*.75);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(4,10,5,.33)');ctx.fillStyle=grad;ctx.fillRect(0,0,WORLD_W,WORLD_H);}
  function drawOfflineHud(g){
    const x = 20, y = WORLD_H - 66;
    if (g.reloadTimer > 0) {
      const frame = 1 + Math.floor(g.time * 12) % 8;
      const image = hudImages[`loading-${frame}`];
      if (image && image.complete && image.naturalWidth) ctx.drawImage(image, x, y, 56, 56);
      return;
    }
    String(Math.max(0, Math.floor(g.ammo))).split('').forEach((digit, index) => {
      const image = hudImages[`digit-${digit}`];
      if (image && image.complete && image.naturalWidth) ctx.drawImage(image, x + index * 37, y, 34, 52);
    });
  }
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
    setMovementSound(input.up || input.down || input.left || input.right);
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
    if(e.key==='Escape'&&screenName==='game') e.preventDefault();
  });
  document.addEventListener('keyup',e=>setKey(e.key,false));
  window.addEventListener('blur',()=>{input.up=input.down=input.left=input.right=input.fire=false;document.body.classList.remove('mouse-pressed');setMovementSound(false);});
  canvas.addEventListener('mousemove',e=>{const rect=canvas.getBoundingClientRect();input.mouseX=(e.clientX-rect.left)/rect.width*WORLD_W;input.mouseY=(e.clientY-rect.top)/rect.height*WORLD_H;});
  canvas.addEventListener('mousedown',e=>{if(e.button===0){canvas.focus({ preventScroll: true });input.fire=true;document.body.classList.add('mouse-pressed');}});
  window.addEventListener('mouseup',e=>{if(e.button===0){input.fire=false;document.body.classList.remove('mouse-pressed');}});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  function quitGame(){
    window.close();
    window.setTimeout(()=>{ if (!window.closed) window.location.replace('about:blank'); }, 120);
  }

  $('online-button').addEventListener('click',()=>openTankSelect('connect'));
  $('practice-button').addEventListener('click',()=>openTankSelect('offline'));
  $('main-exit').addEventListener('click',quitGame);
  $('map-back').addEventListener('click',()=>showScreen('home'));
  document.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',()=>chooseOfflineMap(button.dataset.map)));
  $('tank-select-back').addEventListener('click',closeTankSelect);
  $('tank-confirm').addEventListener('click',confirmTankSelection);
  document.querySelectorAll('[data-hull]').forEach(button=>button.addEventListener('click',()=>{
    selectedHullId = button.dataset.hull || '05';
    refreshTankAssembly();
  }));
  document.querySelectorAll('[data-gun]').forEach(button=>button.addEventListener('click',()=>{
    selectedGunId = button.dataset.gun || '05';
    refreshTankAssembly();
  }));
  $('results-exit').addEventListener('click',exitResultsToHome);
  $('brand-home').addEventListener('click',e=>{e.preventDefault();if(screenName!=='game')showScreen('home');});
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
  $('create-test-button').addEventListener('click',()=>openTankSelect('offline'));
  $('join-button').addEventListener('click',joinRoom);
  $('join-id').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);});
  $('join-id').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom();});
  $('start-button').addEventListener('click',()=>{unlockAudio();setError('lobby-error','');if(!isHost){setError('lobby-error','Chỉ chủ phòng mới có thể bắt đầu.');return;}enterGameplayFullscreen();sendMessage('CStartGame');});
  $('leave-room').addEventListener('click',()=>{if(wsReady&&activeRoom)sendMessage('CLeaveRoom');else{activeRoom=null;showScreen('lobby');}});
  $('lobby-back').addEventListener('click',()=>{if(activeRoom)sendMessage('CLeaveRoom');else{closeSocket();showScreen('home');}});
  $('copy-room-code').addEventListener('click',async()=>{const code=$('room-code').textContent;try{await navigator.clipboard.writeText(code);$('copy-room-code').textContent='✓';setTimeout(()=>$('copy-room-code').textContent='⧉',900);}catch(_){$('join-id').value=code;}});
  $('overlay-action').addEventListener('click',()=>{if(roundOverlayAction)roundOverlayAction();});
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('click',event=>{if(event.target.closest('button') && event.target.closest('#sound-toggle')===null)playSfx('click',.24);});
  $('sound-toggle').addEventListener('click',()=>{soundEnabled=!soundEnabled;refreshSoundToggle();setMovementSound(false);syncMusicForScreen();if(soundEnabled)playSfx('click',.3);});
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

  // Small defaults are remembered locally for the next session.
  $('player-name').value=localStorage.getItem('tankwar-name')||'';
  $('server-url').value=localStorage.getItem('tankwar-server')||'ws://localhost:8080';
  refreshTankAssembly();
  refreshSoundToggle();
  setTimeout(()=>{if(screenName==='game'&&mode==='online')startInputSender();},0);

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
  window.TankWarClient={get mode(){return mode;},get connected(){return wsReady;},get room(){return activeRoom;},send:sendMessage};
})();
