/* TankWar browser client. No frontend build step is required.
 * Online protocol mirrors Common.Protocol.hs (Aeson Generic tagged encoding).
 * The offline practice mode uses the same canvas renderer but a local simulator
 * driven by the JSON map layouts in assets/maps.
 */
(() => {
  'use strict';

  const WORLD_W = 1344;
  const WORLD_H = 704;
  const TEST_GAME = window.TankWarTestGame || {
    enabled: false, cameraZoom: 1, collisionRadius: 128,
    tankRenderScale: 1, enemyVisibilityRadius: Infinity, playerRespawnSeconds: 5,
    defaultMapId: 'forest', localBotNames: ['CPU-ALPHA', 'CPU-BRAVO', 'CPU-DELTA'], winKills: Infinity
  };
  // Game rules. Every number can be tuned from testgame.js; these are the defaults.
  const RULES = {
    respawnSeconds: Number(TEST_GAME.playerRespawnSeconds ?? 5),
    invulnerableSeconds: Number(TEST_GAME.respawnInvulnerableSeconds ?? 1.5),
    magazineSize: Number(TEST_GAME.magazineSize ?? 6),
    reloadSeconds: Number(TEST_GAME.reloadSeconds ?? 2.2),
    survivalPoints: Number(TEST_GAME.survivalPointsPerSecond ?? 3),
    killPoints: Number(TEST_GAME.killPoints ?? 10),
    shutdownBonus: Number(TEST_GAME.shutdownBonus ?? 20),
    streakStart: Number(TEST_GAME.streakStartKills ?? 3),
    multiKillWindow: Number(TEST_GAME.multiKillWindowSeconds ?? 10),
    rangeStuds: Number(TEST_GAME.rangeStuds ?? 4.5)
  };
  const MULTI_TITLES = { 1: 'SLAIN', 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUADRA KILL', 5: 'PENTAKILL' };
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
  let killAudioCtx = null;
  const killTracker = new Map();
  const lastKnownStreak = new Map();
  const shotVoices = {};

  const MAP_META = {
    forest: { label: 'FOREST', title: 'RỪNG RẬM', accent: '#b9d66a' },
    ruins: { label: 'RUINS', title: 'PHẾ TÍCH', accent: '#d6a77a' },
    depot: { label: 'DEPOT', title: 'KHO HÀNG', accent: '#d7ad65' }
  };
  const trainingMaps = new Map();
  const camera = { x: 0, y: 0 };
  // Online maze data always comes from the server snapshot (wsMaze); this is only a fallback.
  const maze = { mazeWidth: WORLD_W, mazeHeight: WORLD_H, mazeWalls: [] };

  const AUDIO_FILES = {
    menu: 'assets/audio/backgroundmenunew.mp3?v=1', endMenu: 'assets/audio/backgroundmenuend.mp3', game: 'assets/audio/musicongamenew.mp3?v=1',
    click: 'assets/audio/clickmouse.mp3', countdown: 'assets/audio/coutdown.mp3', pickup: 'assets/audio/claimitem.mp3',
    explosion: 'assets/audio/explosion.mp3', winner: 'assets/audio/gamewinner.mp3', gameover: 'assets/audio/gameover.mp3',
    rank: 'assets/audio/rank.mp3', move: 'assets/audio/tankmove.mp3', normalShot: 'assets/audio/sungshot.mp3',
    laserShot: 'assets/audio/laser.mp3', gatlingShot: 'assets/audio/tieulien.mp3', piercingShot: 'assets/audio/xuyentuong.mp3'
  };
  const musicTracks = {
    menu: createLoopingAudio(AUDIO_FILES.menu, .28),
    game: createLoopingAudio(AUDIO_FILES.game, 1.00),
    results: createLoopingAudio(AUDIO_FILES.endMenu, .30)
  };
  const movementTrack = createLoopingAudio(AUDIO_FILES.move, .13);

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

  // ---------------------------------------------------------------- audio

  function createLoopingAudio(src, volume) {
    const track = new Audio(src);
    track.preload = 'auto';
    track.loop = true;
    track._baseVolume = volume;
    track.volume = volume;
    return track;
  }

  function applyMusicVolume() {
    Object.values(musicTracks).forEach(track => { track.volume = Math.max(0, Math.min(1, track._baseVolume * musicScale)); });
  }

  // Long one-shot samples (laser, gatling, piercing) must never overlap or repeat.
  // One <audio> voice per sample: a new shot restarts it, and the tail is faded out
  // after a hard cap so a long file can no longer sound like a loop.
  const SHOT_MAX_MS = { laserShot: 850, gatlingShot: 700, piercingShot: 900 };

  function playShot(name, volume = .45) {
    if (!soundEnabled || !audioUnlocked || !AUDIO_FILES[name]) return;
    let voice = shotVoices[name];
    if (!voice) {
      const audio = new Audio(AUDIO_FILES[name]);
      audio.preload = 'auto';
      voice = shotVoices[name] = { audio, timer: 0, fade: 0 };
    }
    const audio = voice.audio;
    clearTimeout(voice.timer); clearInterval(voice.fade);
    audio.loop = false;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = volume;
    audio.play().catch(() => {});
    const maxMs = SHOT_MAX_MS[name] || 800;
    voice.timer = setTimeout(() => {
      let level = volume;
      voice.fade = setInterval(() => {
        level -= volume / 6;
        if (level <= .02) { clearInterval(voice.fade); audio.pause(); audio.currentTime = 0; }
        else audio.volume = level;
      }, 25);
    }, Math.max(100, maxMs - 150));
  }

  function stopShotSounds() {
    Object.values(shotVoices).forEach(voice => {
      clearTimeout(voice.timer); clearInterval(voice.fade);
      voice.audio.pause(); voice.audio.currentTime = 0;
    });
  }

  // Small synthesised sting for kills: more notes for a higher multi-kill, falling tone for a shutdown.
  function playKillSting(level = 1, shutdown = false) {
    if (!soundEnabled || !audioUnlocked) return;
    try {
      killAudioCtx = killAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (killAudioCtx.state === 'suspended') killAudioCtx.resume();
      const notes = shutdown && level < 2 ? [392, 330, 262] : [523, 587, 659, 784, 1047].slice(0, Math.max(1, Math.min(5, level)));
      notes.forEach((freq, i) => {
        const t = killAudioCtx.currentTime + i * .085;
        const osc = killAudioCtx.createOscillator(), gain = killAudioCtx.createGain();
        osc.type = shutdown && level < 2 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(.0001, t);
        gain.gain.exponentialRampToValueAtTime(.16, t + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, t + (i === notes.length - 1 ? .42 : .14));
        osc.connect(gain); gain.connect(killAudioCtx.destination);
        osc.start(t); osc.stop(t + .45);
      });
    } catch (_) {}
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
    if (name !== 'game') document.body.classList.remove('mouse-pressed');
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
        if (countdownSecond > 0 && countdownSecond !== lastCountdownSecond) playSfx('countdown', .46);
        lastCountdownSecond = countdownSecond;
        $('countdown-banner').hidden = false;
        $('countdown-banner').textContent = `TRẬN ĐẤU BẮT ĐẦU SAU ${countdownSecond}…`;
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
        playSfx('rank', .48);
        showOverlay('KẾT THÚC HIỆP', `${winner} thắng hiệp này. Chuẩn bị cho vòng tiếp theo.`, 'TIẾP TỤC', () => hideOverlay());
        addFeed(`${winner} thắng hiệp đấu.`); break;
      }
      case 'SMatchOver': {
        const values = Array.isArray(data) ? data : [];
        const winner = values[0] || 'Chưa xác định';
        const scores = Array.isArray(values[1]) ? values[1] : [];
        const mineTank = latestSnapshot ? findMyTank(latestSnapshot) : null;
        const mineStats = mineTank ? tankStats(mineTank) : null;
        const pointBoard = latestSnapshot ? scoreboardEntries(latestSnapshot).map(e => [e.id, e.points]) : [];
        showPostMatch({
          title: winner === username ? 'CHIẾN THẮNG' : 'TRẬN ĐẤU KẾT THÚC',
          summary: `${winner} là người chiến thắng chung cuộc.`,
          kills: mineStats ? mineStats.kills : 0, score: mineStats ? mineStats.points : 0, map: 'ONLINE',
          scores: pointBoard.length ? pointBoard : scores
        });
        playSfx(winner === username ? 'winner' : 'gameover', .62);
        addFeed(`Chiến thắng chung cuộc: ${winner}`, 'warn'); break;
      }
      case 'SKillEvent': {
        // Current protocol: [killer, victim]. Optional extra fields from a newer backend:
        // [killer, victim, multiKillLevel (1-5 or "DoubleKill"...), shutdown (bool)].
        playSfx('explosion', .38);
        handleOnlineKillEvent(Array.isArray(data) ? data : []);
        break;
      }
      case 'SMysteryBoxPickup': {
        const pair = Array.isArray(data) ? data : [];
        playSfx('pickup', .52);
        addFeed(`${pair[0] || 'Người chơi'} nhặt hộp: ${weaponName(pair[1])}.`); break;
      }
      case 'SLeaderboard':
        addFeed('Đã nhận bảng xếp hạng.'); break;
      case 'SPong': break;
      case 'SError': addFeed(stringPayload(data) || 'Lỗi server.', 'warn'); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- results

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
      ? 'Phòng thử ghép cùng 3 bot. Map thử mặc định chỉ nằm trong testgame.js; map online vẫn do server ngẫu nhiên.'
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
      startOffline(selectedMapId || TEST_GAME.defaultMapId || 'forest');
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
      leaveGameplayFullscreen();
      showScreen('map');
      setError('map-error', `Không thể khởi tạo map ${String(mapId).toUpperCase()}. ${mapLoadError || 'Kiểm tra static server.'}`);
      return;
    }
    hideOverlay();
    hidePauseModal();
    closeSocket(false);
    mode = 'offline'; activeRoom = null; isHost = false;
    selectedMapId = mapId;
    localMap = chosenMap;
    localGame = createLocalGame(username || 'TankPilot');
    latestSnapshot = localSnapshot();
    resetMatchUi();
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

  function getLocalSpawns(map) {
    const preferred = (map.spawns || []).map(point => ({ ...point }));
    const fallbacks = [
      { vx: map.width - 288, vy: 288 }, { vx: 288, vy: map.height - 288 },
      { vx: map.width - 288, vy: map.height - 288 }
    ];
    return preferred.concat(fallbacks).filter((point, index, points) =>
      !points.slice(0, index).some(other => other.vx === point.vx && other.vy === point.vy)
    ).slice(0, 4);
  }

  function createLocalGame(name) {
    const spawns = getLocalSpawns(localMap);
    const colors = [selectedTankColor].concat(['TankRed', 'TankBlue', 'TankGreen', 'TankYellow'].filter(color => color !== selectedTankColor));
    const names = [name].concat(TEST_GAME.localBotNames);
    const tanks = names.map((n, i) => ({
      tankId: n,
      tankPos: { ...spawns[i] }, tankVel: { vx: 0, vy: 0 }, tankBodyAngle: 0,
      tankTurretAngle: Math.PI, tankColor: colors[i],
      tankWeapon: { wsCurrentWeapon: 'NormalBullet', wsBuffTimeLeft: 0, wsCooldownState: 'Ready' },
      tankAlive: true, tankScore: 0, tankKills: 0, tankDeaths: 0, tankAssists: 0, tankPoints: 0,
      tankKillStreak: 0, tankRespawnTimer: 0, tankInvulnerabilityLeft: 0,
      tankAmmo: RULES.magazineSize, tankMaxAmmo: RULES.magazineSize, tankReloadTimer: 0,
      _spawn: { ...spawns[i] }, _survival: 0, _multi: { count: 0, last: -999 },
      _bot: i > 0, _cooldown: .8 + i * .45, _dirTimer: 0, _direction: Math.random() * Math.PI * 2
    }));
    const view = localViewSize();
    camera.x = clamp(spawns[0].vx - view.width / 2, 0, localMap.width - view.width);
    camera.y = clamp(spawns[0].vy - view.height / 2, 0, localMap.height - view.height);
    return {
      name, tanks, bullets: [], boxes: [], lasers: [], time: 0, boxTimer: 10,
      fireCooldown: 0, gameOver: false, spectatorTankId: ''
    };
  }

  // The snapshot exposes the same Tank fields the Haskell server sends, so the HUD code is shared.
  function publicTank(t) {
    return {
      tankId: t.tankId, tankPos: t.tankPos, tankVel: t.tankVel, tankBodyAngle: t.tankBodyAngle, tankTurretAngle: t.tankTurretAngle,
      tankColor: t.tankColor, tankWeapon: t.tankWeapon, tankAlive: t.tankAlive, tankScore: t.tankScore,
      tankKills: t.tankKills, tankDeaths: t.tankDeaths, tankAssists: t.tankAssists, tankPoints: t.tankPoints,
      tankKillStreak: t.tankKillStreak, tankRespawnTimer: t.tankRespawnTimer, tankInvulnerabilityLeft: t.tankInvulnerabilityLeft,
      tankAmmo: t.tankAmmo, tankMaxAmmo: t.tankMaxAmmo, tankReloadTimer: t.tankReloadTimer
    };
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

  function visionRadius() {
    return RULES.rangeStuds * (localMap ? localMap.cellSize : 352);
  }

  // Per-tank timers: survival points (alive only), respawn countdown, invulnerability and magazine reload.
  function tickLocalTank(tank, dt) {
    if (tank.tankAlive) {
      tank.tankInvulnerabilityLeft = Math.max(0, tank.tankInvulnerabilityLeft - dt);
      tank._survival += dt;
      const whole = Math.floor(tank._survival);
      if (whole > 0) { tank.tankPoints += whole * RULES.survivalPoints; tank._survival -= whole; }
    } else {
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
    if (tank === g.tanks[0]) {
      g.spectatorTankId = '';
      g.fireCooldown = 0;
      updateLocalCamera(tank.tankPos, 1);
      addFeed(`Bạn đã hồi sinh. Bất tử ${RULES.invulnerableSeconds} giây, đạn đầy ${tank.tankMaxAmmo}/${tank.tankMaxAmmo}.`);
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
    victim.tankRespawnTimer = RULES.respawnSeconds; victim.tankInvulnerabilityLeft = 0;
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
      playSfx('explosion', .62);
    } else {
      playSfx('explosion', .47);
    }
    announceKill({ killer: killer.tankId, victim: victim.tankId, tier: Math.min(multi.count, 5), shutdown, points });
  }

  function updateOffline(dt) {
    if (!localGame || localGame.gameOver || isPaused) return;
    const g = localGame; g.time += dt; g.fireCooldown = Math.max(0, g.fireCooldown - dt);
    const player = g.tanks[0];
    const weapon = player.tankWeapon;
    g.tanks.forEach(tank => tickLocalTank(tank, dt));
    if (input.reloadRequest) { input.reloadRequest = false; startLocalReload(player); }
    if (player.tankAlive) {
      const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0), dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        const mx = dx / len * 150 * LOCAL_SPEED_SCALE * dt, my = dy / len * 150 * LOCAL_SPEED_SCALE * dt;
        moveLocalTank(player, mx, my);
        player.tankBodyAngle = Math.atan2(dy, dx);
      }
      setMovementSound(!!(dx || dy));
      updateLocalCamera(player.tankPos, dt);
      const pointer = screenToLocalWorld(input.mouseX, input.mouseY);
      player.tankTurretAngle = Math.atan2(pointer.vy - player.tankPos.vy, pointer.vx - player.tankPos.vx);
    } else {
      input.fire = false;
      setMovementSound(false);
      const killer = g.tanks.find(tank => tank.tankId === g.spectatorTankId && tank.tankAlive)
        || g.tanks.slice(1).find(tank => tank.tankAlive);
      if (killer) updateLocalCamera(killer.tankPos, dt);
    }
    weapon.wsBuffTimeLeft = Math.max(0, weapon.wsBuffTimeLeft - dt);
    if (weapon.wsBuffTimeLeft <= 0 && weapon.wsCurrentWeapon !== 'NormalBullet') weapon.wsCurrentWeapon = 'NormalBullet';
    if (player.tankAlive && input.fire && g.fireCooldown <= 0 && player.tankReloadTimer <= 0 && player.tankAmmo > 0) {
      localShoot(player, player.tankTurretAngle, weapon.wsCurrentWeapon);
      g.fireCooldown = weapon.wsCurrentWeapon === 'NormalBullet' ? 0.5 : 1.0;
      player.tankAmmo--;
      if (player.tankAmmo === 0) startLocalReload(player);
    }
    weapon.wsCooldownState = g.fireCooldown > 0 || player.tankReloadTimer > 0
      ? { tag: 'Reloading', contents: Math.max(g.fireCooldown, player.tankReloadTimer) }
      : 'Ready';

    g.boxTimer -= dt;
    if (g.boxTimer <= 0 && g.boxes.length === 0) {
      const pt = pickOpenLocalPoint(26);
      g.boxes.push({ pos: { ...pt }, life: 12 }); g.boxTimer = 22 + Math.random() * 8;
    }
    g.boxes.forEach(box => box.life -= dt); g.boxes = g.boxes.filter(b => b.life > 0);
    if (player.tankAlive && g.boxes.some(b => distance(b.pos, player.tankPos) < LOCAL_TANK_RADIUS + 28)) {
      g.boxes = [];
      const special = ['ShotgunBullet', 'LaserBullet', 'WallPiercingBullet', 'GatlingBullet'][Math.floor(Math.random() * 4)];
      weapon.wsCurrentWeapon = special; weapon.wsBuffTimeLeft = 15;
      playSfx('pickup', .58);
      addFeed(`Nhặt Mystery Box: ${weaponName(special)} trong 15 giây!`);
    }

    g.tanks.slice(1).forEach(bot => {
      if (!bot.tankAlive) return;
      bot._cooldown -= dt; bot._dirTimer -= dt;
      const toX = player.tankPos.vx - bot.tankPos.vx, toY = player.tankPos.vy - bot.tankPos.vy;
      const dist = Math.hypot(toX, toY) || 1;
      const speed = 78 * LOCAL_SPEED_SCALE * dt;
      // Chase the player; when blocked by a wall, wander in a random direction for a moment.
      const heading = bot._dirTimer > 0 ? bot._direction : Math.atan2(toY, toX);
      const before = { ...bot.tankPos };
      moveLocalTank(bot, Math.cos(heading) * speed, Math.sin(heading) * speed);
      if (bot._dirTimer <= 0 && distance(before, bot.tankPos) < .01) {
        bot._direction = Math.random() * Math.PI * 2;
        bot._dirTimer = .8 + Math.random() * 1.5;
      }
      bot.tankBodyAngle = heading; bot.tankTurretAngle = Math.atan2(toY, toX);
      if (bot._cooldown <= 0 && player.tankAlive && dist < visionRadius()) {
        localShoot(bot, bot.tankTurretAngle, 'NormalBullet');
        bot._cooldown = 1.6 + Math.random() * .8;
      }
    });

    g.bullets.forEach(b => {
      b.life -= dt; const nx = b.pos.vx + b.vel.vx * dt, ny = b.pos.vy + b.vel.vy * dt;
      if (nx < 12 || nx > localMap.width - 12) { b.vel.vx *= -1; b.bounces++; b.pos.vx = clamp(nx, 12, localMap.width - 12); } else b.pos.vx = nx;
      if (ny < 12 || ny > localMap.height - 12) { b.vel.vy *= -1; b.bounces++; b.pos.vy = clamp(ny, 12, localMap.height - 12); } else b.pos.vy = ny;
      if (b.type !== 'WallPiercingBullet' && collidesLocalMap(b.pos, 12)) b.life = 0;
      if (b.life <= 0) return;
      if (b.owner === player.tankId) {
        for (const bot of g.tanks.slice(1)) {
          // Shots pass through a tank that is still in its post-respawn invulnerability window.
          if (bot.tankAlive && bot.tankInvulnerabilityLeft <= 0 && distance(bot.tankPos, b.pos) < LOCAL_TANK_RADIUS + 14) {
            b.life = 0; killLocalTank(player, bot);
            break;
          }
        }
      } else if (player.tankAlive && player.tankInvulnerabilityLeft <= 0 && distance(player.tankPos, b.pos) < LOCAL_TANK_RADIUS + 14) {
        const shooter = g.tanks.find(t => t.tankId === b.owner) || g.tanks[1];
        b.life = 0; killLocalTank(shooter, player);
      }
    });
    g.bullets = g.bullets.filter(b => b.life > 0 && b.bounces <= 4);
    if (!g.gameOver && player.tankKills >= TEST_GAME.winKills) {
      g.gameOver = true;
      setMovementSound(false);
      stopShotSounds();
      playSfx('winner', .66);
      showPostMatch({ title: 'NHIỆM VỤ HOÀN TẤT', summary: `Bạn đã hạ ${player.tankKills} bot và ghi ${player.tankPoints} điểm.`, kills: player.tankKills, score: player.tankPoints, map: localMap.label, scores: g.tanks.map(t => [t.tankId, t.tankPoints]) });
    }
  }

  function localShoot(tank, angle, type) {
    if (!localGame) return;
    const isPlayer = tank.tankId === localGame.name;
    const volume = isPlayer ? .43 : .16;
    // Laser / gatling / piercing use a single restartable voice so they never stack or loop.
    if (type === 'LaserBullet') playShot('laserShot', volume);
    else if (type === 'GatlingBullet') playShot('gatlingShot', volume);
    else if (type === 'WallPiercingBullet') playShot('piercingShot', volume);
    else playSfx('normalShot', volume);
    const muzzleOffset = LOCAL_TANK_SIZE * .44 * Number(TEST_GAME.tankRenderScale || .5);
    const origin = { vx: tank.tankPos.vx + Math.cos(angle) * muzzleOffset, vy: tank.tankPos.vy + Math.sin(angle) * muzzleOffset };
    const add = (a, speed = 390) => localGame.bullets.push({ pos: { ...origin }, vel: { vx: Math.cos(a) * speed * LOCAL_SPEED_SCALE, vy: Math.sin(a) * speed * LOCAL_SPEED_SCALE }, type, owner: tank.tankId, life: 4, bounces: 0 });
    if (type === 'ShotgunBullet') { add(angle - .22, 340); add(angle, 365); add(angle + .22, 340); }
    else if (type === 'GatlingBullet') { add(angle, 410); add(angle + .04, 410); }
    else if (type === 'LaserBullet') { add(angle, 570); }
    else if (type === 'WallPiercingBullet') { add(angle, 350); }
    else add(angle, 400);
  }

  function moveLocalTank(tank, deltaX, deltaY) {
    const pos = tank.tankPos;
    const nextX = { vx: pos.vx + deltaX, vy: pos.vy };
    const nextY = { vx: pos.vx, vy: pos.vy + deltaY };
    if (!collidesLocalMap(nextX, LOCAL_TANK_RADIUS)) pos.vx = nextX.vx;
    if (!collidesLocalMap(nextY, LOCAL_TANK_RADIUS)) pos.vy = nextY.vy;
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
  function distance(a, b) { return Math.hypot(a.vx - b.vx, a.vy - b.vy); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ---------------------------------------------------------------- render loop

  function startRenderLoop() {
    if (animationId !== null) return;
    lastFrameTime = performance.now();
    const frame = (time) => {
      animationId = requestAnimationFrame(frame);
      const dt = Math.min(.04, Math.max(0, (time - lastFrameTime) / 1000)); lastFrameTime = time;
      if (screenName !== 'game') return;
      fpsFrameCount++;
      if (time - fpsLast >= 1000) { $('fps-label').textContent = `${fpsFrameCount} FPS CLIENT`; fpsFrameCount = 0; fpsLast = time; }
      if (mode === 'offline') {
        updateOffline(dt);
        latestSnapshot = localSnapshot();
      }
      if (time - lastHudUpdate > 100) {
        lastHudUpdate = time;
        if (mode === 'offline') { updateMatchHeader(latestSnapshot); updateWeaponPanel(latestSnapshot); updateScoreboard(latestSnapshot); }
        updateGameplayHud(latestSnapshot);
      }
      renderSnapshot(latestSnapshot);
    };
    animationId = requestAnimationFrame(frame);
  }
  function stopRenderLoop() { if (animationId !== null) { cancelAnimationFrame(animationId); animationId = null; } }

  function renderSnapshot(snapshot) {
    if (!snapshot) return;
    resizeCanvasBacking();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (mode === 'offline' && localMap) {
      // The offline renderer draws in WORLD_W x WORLD_H units; scale to the real backing buffer.
      ctx.setTransform(canvas.width / WORLD_W, 0, 0, canvas.height / WORLD_H, 0, 0);
      renderOfflineSnapshot(snapshot);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    const world = readField(snapshot, 'wsMaze') || maze;
    const width = Number(readField(world, 'mazeWidth') || WORLD_W), height = Number(readField(world, 'mazeHeight') || WORLD_H);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    drawGround(width, height);
    drawWalls(readField(world, 'mazeWalls') || [], width, height);
    const boxes = readField(snapshot, 'wsMysteryBoxes') || [];
    boxes.forEach(box => { if (readField(box, 'mbActive') !== false) drawBox(readField(box, 'mbPos'), height); });
    (readField(snapshot, 'wsLasers') || []).forEach(laser => drawLaser(readField(laser, 'lsStart'), readField(laser, 'lsEnd'), height));
    (readField(snapshot, 'wsBullets') || []).forEach(b => drawBullet(b, height));
    (readField(snapshot, 'wsTanks') || []).forEach(t => drawTank(t, height));
    drawVignette(width, height);
    const mineTank = findMyTank(snapshot);
    if (mineTank) drawAmmoHud(tankStats(mineTank), height - 66);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    drawAmmoHud(tankStats(localGame.tanks[0]), WORLD_H - 66);
  }

  function isOfflineTankVisible(tank) {
    if (!localGame || readField(tank, 'tankAlive') === false) return false;
    const observer = getOfflineCameraTank();
    if (!observer || tank.tankId === observer.tankId) return true;
    const targetPos = readField(tank, 'tankPos');
    return !!targetPos && distance(observer.tankPos, targetPos) <= visionRadius();
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
    const radius = visionRadius() * localWorldScale();
    if (!Number.isFinite(radius)) return;
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
    const invuln = Number(readField(tank, 'tankInvulnerabilityLeft') || 0);
    if (invuln > 0) ctx.globalAlpha = Math.floor(performance.now() / 90) % 2 ? .5 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(8, 10, size * .33, size * .41, 0, 0, Math.PI * 2); ctx.fill();
    const hull = images.hull;
    if (hull && hull.complete && hull.naturalWidth) {
      ctx.save(); ctx.rotate(bodyAngle + Math.PI / 2); drawTinted(hull, color, -size / 2, -size / 2, size, size); ctx.restore();
    } else {
      ctx.fillStyle = color; ctx.fillRect(-size * .29, -size * .38, size * .58, size * .76);
    }
    const gun = images.gun;
    if (gun && gun.complete && gun.naturalWidth) {
      ctx.save(); ctx.rotate(turretAngle + Math.PI / 2); drawTinted(gun, color, -size / 2, -size / 2, size, size); ctx.restore();
    }
    if (invuln > 0) { ctx.globalAlpha = 1; drawShield(size * .5); }
    ctx.restore();
  }

  function drawShield(radius) {
    const pulse = .5 + .5 * Math.sin(performance.now() / 55);
    ctx.save();
    ctx.globalAlpha = .35 + .45 * pulse;
    ctx.strokeStyle = '#8be9ff'; ctx.fillStyle = 'rgba(120,225,255,.16)';
    ctx.shadowColor = '#8be9ff'; ctx.shadowBlur = 14; ctx.lineWidth = Math.max(2, radius * .06);
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function bulletColor(type) {
    return type === 'LaserBullet' ? '#82f9ff' : type === 'ShotgunBullet' ? '#ffca73' : type === 'WallPiercingBullet' ? '#c39aff' : type === 'GatlingBullet' ? '#ff9658' : '#e6efc4';
  }

  function drawOfflineBullet(bullet) {
    const pos = readField(bullet, 'bulPos'); if (!pos) return;
    const type = readField(bullet, 'bulType') || 'NormalBullet';
    const screen = localToScreen({ vx: Number(readField(pos, 'vx') || 0), vy: Number(readField(pos, 'vy') || 0) });
    const color = bulletColor(type);
    const radius = Math.max(2, (type === 'ShotgunBullet' ? 9 : 7) * localWorldScale());
    ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawOfflineBox(pos) {
    if (!pos) return;
    const screen = localToScreen({ vx: Number(readField(pos, 'vx') || 0), vy: Number(readField(pos, 'vy') || 0) });
    const x = screen.x, y = screen.y;
    const size = 56 * localWorldScale();
    const image = images.box;
    ctx.save(); ctx.shadowColor = '#f3d466'; ctx.shadowBlur = 18;
    if (image && image.complete && image.naturalWidth) ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    else { ctx.fillStyle = '#e1bc4e'; ctx.fillRect(x - size * .4, y - size * .4, size * .8, size * .8); ctx.fillStyle = '#132013'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', x, y + 4); }
    ctx.restore();
  }

  // Bottom-left ammo counter (digit sprites) or the reload spinner. Works for both modes.
  function drawAmmoHud(stats, y) {
    if (!stats || !stats.hasAmmo || !stats.alive) return;
    const x = 20;
    if (stats.reload > 0) {
      const frame = 1 + Math.floor(performance.now() / 83) % 8;
      const image = hudImages[`loading-${frame}`];
      if (image && image.complete && image.naturalWidth) ctx.drawImage(image, x, y, 56, 56);
      return;
    }
    String(Math.max(0, Math.floor(stats.ammo))).split('').forEach((digit, index) => {
      const image = hudImages[`digit-${digit}`];
      if (image && image.complete && image.naturalWidth) ctx.drawImage(image, x + index * 37, y, 34, 52);
    });
  }

  // Online renderer (server world, Y axis points up so every y is flipped with `height`).
  function drawGround(w = WORLD_W, h = WORLD_H) {
    ctx.fillStyle = '#1d3020'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(126,163,100,.04)';
    const tileSize = 32;
    for (let y = 0; y < h; y += tileSize) {
      for (let x = 0; x < w; x += tileSize) {
        if (((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2) === 0) ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
    ctx.strokeStyle = 'rgba(167,205,137,.08)'; ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += tileSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += tileSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // Subtle worn ground flecks
    const dotCount = Math.floor((w * h) / 10000);
    for (let i = 0; i < dotCount; i++) {
      const x = (i * 157 + 33) % w, y = (i * 97 + 19) % h;
      ctx.fillStyle = 'rgba(182,208,143,.045)'; ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawWalls(walls, width, height) {
    ctx.save(); ctx.lineCap = 'square';
    (walls || []).forEach((wall, index) => {
      const a = readField(wall, 'wallStart'), b = readField(wall, 'wallEnd'); if (!a || !b) return;
      const x1 = Number(readField(a, 'vx') || 0), y1 = height - Number(readField(a, 'vy') || 0);
      const x2 = Number(readField(b, 'vx') || 0), y2 = height - Number(readField(b, 'vy') || 0);
      ctx.strokeStyle = 'rgba(5,11,7,.55)'; ctx.lineWidth = index < 4 ? 15 : 12; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = index < 4 ? '#68815b' : '#58704d'; ctx.lineWidth = index < 4 ? 10 : 8; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(207,232,171,.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x1 + (x2 - x1) * .04, y1 + (y2 - y1) * .04 - 1); ctx.lineTo(x2 - (x2 - x1) * .04, y2 - (y2 - y1) * .04 - 1); ctx.stroke();
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
    const hull = images.hull;
    if (hull && hull.complete && hull.naturalWidth) {
      ctx.save(); ctx.rotate(Math.PI / 2 - bodyAngle); drawTinted(hull, color, -11, -18, 22, 36); ctx.restore();
    } else drawVectorHull(color, bodyAngle);
    const gun = images.gun;
    if (gun && gun.complete && gun.naturalWidth) { ctx.save(); ctx.rotate(Math.PI / 2 - turretAngle); drawTinted(gun, color, -7, -18, 14, 36); ctx.restore(); }
    else { ctx.save(); ctx.rotate(-turretAngle); ctx.fillStyle = color; ctx.fillRect(-3, -22, 6, 24); ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.restore();
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
  function drawBox(pos, height = WORLD_H) {
    if (!pos) return; const x = Number(readField(pos, 'vx') || 0), y = height - Number(readField(pos, 'vy') || 0);
    const im = images.box;
    ctx.save(); ctx.shadowColor = '#e8c95a'; ctx.shadowBlur = 12;
    if (im && im.complete && im.naturalWidth) { ctx.drawImage(im, x - 13, y - 13, 26, 26); } else { ctx.fillStyle = '#d3aa42'; ctx.fillRect(x - 11, y - 11, 22, 22); ctx.fillStyle = '#1c281b'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', x, y + 6); }
    ctx.restore();
  }
  function drawLaser(a, b, height) { if (!a || !b) return; const x1 = Number(readField(a, 'vx') || 0), y1 = height - Number(readField(a, 'vy') || 0), x2 = Number(readField(b, 'vx') || 0), y2 = height - Number(readField(b, 'vy') || 0); ctx.save(); ctx.strokeStyle = '#89faff'; ctx.shadowColor = '#89faff'; ctx.shadowBlur = 12; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore(); }
  function drawVignette(w = WORLD_W, h = WORLD_H) { const grad = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, Math.max(w, h) * .75); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(4,10,5,.33)'); ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h); }

  // ---------------------------------------------------------------- HUD

  function updateMatchHeader(snapshot) {
    if (!snapshot) return;
    const tanks = readField(snapshot, 'wsTanks') || [];
    const mine = tanks.find(t => readField(t, 'tankId') === username) || tanks.find(t => readField(t, 'tankId') === displayName) || tanks[0];
    $('match-player-count').textContent = String(tanks.length || 1);
    $('match-score').textContent = String(mine ? tankStats(mine).points : 0);
    if (mode === 'online' && activeRoom) $('match-room').textContent = readField(activeRoom, 'riRoomId') || 'ONLINE';
  }
  // Normalises a Tank (server snapshot or local simulation) into plain numbers for the HUD.
  function tankStats(tank) {
    const num = (key, fallback = 0) => { const v = Number(readField(tank, key)); return Number.isFinite(v) ? v : fallback; };
    const kills = num('tankKills');
    const hasPoints = readField(tank, 'tankPoints') !== undefined;
    return {
      id: String(readField(tank, 'tankId') || 'PLAYER'),
      color: readField(tank, 'tankColor') || 'TankGreen',
      alive: readField(tank, 'tankAlive') !== false,
      kills, deaths: num('tankDeaths'),
      points: hasPoints ? num('tankPoints') : kills,
      streak: num('tankKillStreak'),
      respawn: num('tankRespawnTimer'), respawnKnown: readField(tank, 'tankRespawnTimer') !== undefined,
      invuln: num('tankInvulnerabilityLeft'),
      hasAmmo: readField(tank, 'tankAmmo') !== undefined,
      ammo: num('tankAmmo'), maxAmmo: num('tankMaxAmmo', RULES.magazineSize), reload: num('tankReloadTimer')
    };
  }

  function findMyTank(snapshot) {
    const tanks = readField(snapshot, 'wsTanks') || [];
    return tanks.find(t => readField(t, 'tankId') === username) || tanks.find(t => readField(t, 'tankId') === displayName) || tanks[0] || null;
  }

  function isMe(name) { return !!name && (name === username || name === displayName); }

  function scoreboardEntries(snapshot) {
    const entries = (readField(snapshot, 'wsTanks') || []).map(tankStats);
    // Fallback rows (e.g. the round-end payload carries only name/score pairs).
    (readField(snapshot, 'wsScores') || []).forEach(pair => {
      if (!Array.isArray(pair) || entries.some(e => e.id === pair[0])) return;
      entries.push({ id: String(pair[0]), color: 'TankBlue', alive: true, kills: 0, deaths: 0, points: Number(pair[1] || 0), streak: 0, respawn: 0, invuln: 0 });
    });
    entries.sort((a, b) => b.points - a.points || b.kills - a.kills || a.deaths - b.deaths);
    return entries;
  }

  function updateScoreboard(snapshot) {
    const root = $('scoreboard'); root.innerHTML = ''; if (!snapshot) return;
    const entries = scoreboardEntries(snapshot);
    if (!entries.length) { root.innerHTML = '<div class="feed-item muted">Đang đợi dữ liệu người chơi…</div>'; return; }
    entries.forEach(e => {
      const row = document.createElement('div'); row.className = 'score-row';
      const dot = document.createElement('span'); dot.className = 'score-dot'; dot.style.background = COLORS[e.color] || '#c7f36b';
      const name = document.createElement('span'); name.className = 'score-name';
      name.textContent = `${e.id} · ${e.kills}/${e.deaths}${e.alive ? '' : ' · CHỜ'}`;
      const score = document.createElement('strong'); score.className = 'score-value'; score.textContent = String(e.points);
      row.append(dot, name, score); root.append(row);
    });
  }

  function updateWeaponPanel(snapshot) {
    if (!snapshot || !$('weapon-name')) return; const tanks = readField(snapshot, 'wsTanks') || [];
    const mine = tanks.find(t => readField(t, 'tankId') === username) || tanks.find(t => readField(t, 'tankId') === displayName) || tanks[0]; if (!mine) return;
    const weapon = readField(mine, 'tankWeapon') || {}; const type = readField(weapon, 'wsCurrentWeapon') || 'NormalBullet';
    const buff = Number(readField(weapon, 'wsBuffTimeLeft') || 0); const cooldown = readField(weapon, 'wsCooldownState');
    if ($('weapon-name')) $('weapon-name').textContent = weaponName(type).toUpperCase();
    if ($('weapon-symbol')) $('weapon-symbol').textContent = weaponSymbol(type);
    if ($('weapon-timer')) $('weapon-timer').textContent = buff > 0 ? `BUFF CÒN ${buff.toFixed(1)}S` : cooldown === 'Ready' || tagOf(cooldown) === 'Ready' ? 'SẴN SÀNG' : 'ĐANG HỒI ĐẠN';
    let ratio = 1; if (typeof cooldown === 'object' && cooldown) { const tag = tagOf(cooldown); if (tag === 'Reloading') { const v = Array.isArray(cooldown.contents) ? cooldown.contents[0] : cooldown.contents; const maxCooldown = type === 'NormalBullet' ? 0.5 : 1.0; ratio = 1 - clamp(Number(v || 0) / maxCooldown, 0, 1); } else if (tag === 'GatlingBurst') { ratio = .65; } }
    const st = tankStats(mine);
    if (st.hasAmmo && st.reload > 0) {
      ratio = 1 - clamp(st.reload / RULES.reloadSeconds, 0, 1);
      if ($('weapon-timer')) $('weapon-timer').textContent = `ĐANG NẠP ĐẠN ${st.reload.toFixed(1)}S`;
    }
    if ($('cooldown-fill')) $('cooldown-fill').style.width = `${Math.round(ratio * 100)}%`;
  }
  function weaponName(type) { return ({ NormalBullet: 'Đạn thường', ShotgunBullet: 'Đạn chùm', LaserBullet: 'Tia laser', WallPiercingBullet: 'Đạn xuyên tường', GatlingBullet: 'Đạn liên thanh' })[type] || String(type || 'Đạn thường').replace('Bullet', ''); }
  function weaponSymbol(type) { return ({ NormalBullet: '●', ShotgunBullet: '✹', LaserBullet: 'ϟ', WallPiercingBullet: '↗', GatlingBullet: '»' })[type] || '●'; }
  function addFeed(text, type = '') { const root = $('event-feed'); if (!root) return; const row = document.createElement('div'); row.className = `feed-item ${type}`; const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); row.textContent = `[${time}] ${text}`; root.prepend(row); while (root.children.length > 8) root.lastElementChild.remove(); }

  // ---------------------------------------------------------------- gameplay HUD (K/D, score, kill feed, banners)

  function setText(id, value) {
    const el = $(id);
    const text = String(value);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function matchSeconds() {
    if (mode === 'offline') return localGame ? localGame.time : 0;
    return matchClockStart ? (performance.now() - matchClockStart) / 1000 : 0;
  }

  function resetMatchUi() {
    killTracker.clear(); lastKnownStreak.clear();
    lastKillerOfMe = ''; myDeathAt = 0; myWasAlive = true;
    matchClockStart = performance.now();
    const feed = $('kill-feed'); if (feed) feed.innerHTML = '';
    clearTimeout(bannerTimer);
    ['kill-banner', 'respawn-banner', 'shield-chip'].forEach(id => { const el = $(id); if (el) el.hidden = true; });
    showTabScoreboard(false);
    stopShotSounds();
  }

  // Online only: remember who was alive with which streak, and when we died (client-side respawn fallback).
  function trackSnapshot(snapshot) {
    if (!snapshot) return;
    (readField(snapshot, 'wsTanks') || []).forEach(tank => {
      const st = tankStats(tank);
      if (st.alive) lastKnownStreak.set(st.id, st.streak);
      if (isMe(st.id)) {
        if (myWasAlive && !st.alive) myDeathAt = performance.now();
        myWasAlive = st.alive;
      }
    });
  }

  function updateGameplayHud(snapshot) {
    if (!snapshot) return;
    const me = findMyTank(snapshot); if (!me) return;
    const st = tankStats(me);
    setText('kda-kills', st.kills);
    setText('kda-deaths', st.deaths);
    setText('kda-points', `SCORE: ${st.points}`);
    const streak = $('kda-streak');
    if (streak) { streak.hidden = st.streak < 1; setText('kda-streak', `CHUỖI: ${st.streak}`); }
    setText('match-clock', formatClock(matchSeconds()));

    const respawnBanner = $('respawn-banner');
    if (respawnBanner) {
      let remaining = 0;
      if (!st.alive) remaining = st.respawnKnown ? st.respawn : Math.max(0, RULES.respawnSeconds - (performance.now() - myDeathAt) / 1000);
      respawnBanner.hidden = !(!st.alive && remaining > 0);
      if (!respawnBanner.hidden) {
        setText('respawn-by', lastKillerOfMe ? `${lastKillerOfMe} đã hạ bạn` : 'BẠN ĐÃ BỊ HẠ');
        setText('respawn-count', remaining.toFixed(1));
      }
    }
    const chip = $('shield-chip');
    if (chip) {
      chip.hidden = !(st.alive && st.invuln > 0);
      if (!chip.hidden) setText('shield-time', `${st.invuln.toFixed(1)}s`);
    }
    if (tabHeld) renderTabScoreboard(snapshot);
  }

  function colorOfTank(name) {
    const tanks = latestSnapshot ? (readField(latestSnapshot, 'wsTanks') || []) : [];
    const tank = tanks.find(t => readField(t, 'tankId') === name);
    return COLORS[tank ? readField(tank, 'tankColor') : ''] || '#e8f0df';
  }

  function parseTier(value) {
    if (typeof value === 'number') return clamp(Math.floor(value), 0, 5);
    const text = String(tagOf(value) || value || '').toLowerCase();
    if (text.includes('penta')) return 5;
    if (text.includes('quadra')) return 4;
    if (text.includes('triple')) return 3;
    if (text.includes('double')) return 2;
    if (text.includes('slain') || text.includes('single')) return 1;
    return 0;
  }

  function handleOnlineKillEvent(values) {
    const killer = String(values[0] || 'Ai đó'), victim = String(values[1] || 'đối thủ');
    const now = performance.now();
    const hasTier = values[2] !== undefined && values[2] !== null;
    let tier = hasTier ? Math.max(1, parseTier(values[2])) : 0;
    if (!tier) {
      // Backend did not send a multi-kill level: count kills inside the time window here.
      const record = killTracker.get(killer);
      const count = record && now - record.last <= RULES.multiKillWindow * 1000 ? record.count + 1 : 1;
      killTracker.set(killer, { count, last: now });
      tier = Math.min(count, 5);
    }
    const shutdown = values[3] !== undefined && values[3] !== null
      ? (values[3] === true || Number(values[3]) > 0)
      : (lastKnownStreak.get(victim) || 0) >= RULES.streakStart;
    killTracker.delete(victim);
    lastKnownStreak.set(victim, 0);
    announceKill({ killer, victim, tier, shutdown, points: RULES.killPoints + (shutdown ? RULES.shutdownBonus : 0) });
  }

  // One entry point for a kill, used by the local simulation and by SKillEvent.
  function announceKill({ killer, victim, tier = 1, shutdown = false, points = RULES.killPoints }) {
    const mineKiller = isMe(killer), mineVictim = isMe(victim);
    if (mineVictim) lastKillerOfMe = killer;
    pushKillFeed({ killer, victim, tier, shutdown, points, mine: mineKiller || mineVictim });
    addFeed(`${killer} hạ ${victim}${tier >= 2 ? ` · ${MULTI_TITLES[tier]}` : ''}${shutdown ? ` · SHUTDOWN +${RULES.shutdownBonus}` : ''}`, 'warn');
    const who = mineKiller ? 'Bạn' : killer;
    const bonus = shutdown ? ` · chấm dứt chuỗi +${RULES.shutdownBonus}` : '';
    if (tier >= 2) {
      showKillBanner(MULTI_TITLES[tier], `${who} đã hạ ${victim}${bonus}`, `multi-${tier}`, 'MULTI KILL', tier >= 5 ? 3600 : 2800);
      playKillSting(tier);
    } else if (shutdown) {
      showKillBanner('SHUTDOWN', `${who} đã chấm dứt chuỗi của ${victim} · +${RULES.shutdownBonus}`, 'shutdown', 'SHUTDOWN', 2800);
      playKillSting(1, true);
    } else if (mineKiller) {
      showKillBanner('SLAIN', `Bạn đã hạ ${victim} · +${RULES.killPoints}`, 'slain', 'ELIMINATION', 2000);
      playKillSting(1);
    } else if (mineVictim) {
      showKillBanner('BẠN BỊ HẠ', `${killer} đã hạ bạn`, 'death', 'ELIMINATED', 2200);
    }
  }

  function pushKillFeed({ killer, victim, tier, shutdown, points, mine }) {
    const root = $('kill-feed'); if (!root) return;
    const row = document.createElement('div');
    row.className = `kf-item${mine ? ' mine' : ''}`;
    const killerEl = document.createElement('span'); killerEl.className = 'kf-name'; killerEl.textContent = killer; killerEl.style.color = colorOfTank(killer);
    const icon = document.createElement('span'); icon.className = 'kf-icon'; icon.textContent = '⚔';
    const victimEl = document.createElement('span'); victimEl.className = 'kf-name'; victimEl.textContent = victim; victimEl.style.color = colorOfTank(victim);
    row.append(killerEl, icon, victimEl);
    if (tier >= 2) { const tag = document.createElement('em'); tag.className = 'kf-tag'; tag.textContent = MULTI_TITLES[tier]; row.append(tag); }
    if (shutdown) { const tag = document.createElement('em'); tag.className = 'kf-tag shutdown'; tag.textContent = 'SHUTDOWN'; row.append(tag); }
    const pts = document.createElement('span'); pts.className = 'kf-points'; pts.textContent = `+${points}`; row.append(pts);
    root.append(row);
    while (root.children.length > 5) root.firstElementChild.remove();
    setTimeout(() => row.remove(), 7000);
  }

  function showKillBanner(title, subtitle, cls, kicker = 'ELIMINATION', ms = 2600) {
    const el = $('kill-banner'); if (!el) return;
    setText('kill-banner-title', title);
    setText('kill-banner-subtitle', subtitle);
    const kickerEl = el.querySelector('.kill-banner-kicker'); if (kickerEl) kickerEl.textContent = kicker;
    el.className = `kill-banner ${cls}`;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('kill-banner-pop');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  function showTabScoreboard(show) {
    tabHeld = show;
    const el = $('tab-scoreboard'); if (!el) return;
    el.hidden = !show;
    if (show && latestSnapshot) renderTabScoreboard(latestSnapshot);
  }

  function renderTabScoreboard(snapshot) {
    const body = $('tab-scoreboard-body'); if (!body) return;
    const entries = scoreboardEntries(snapshot);
    body.innerHTML = '';
    if (!entries.length) { body.innerHTML = '<tr><td colspan="6">Đang chờ dữ liệu…</td></tr>'; return; }
    entries.forEach(e => {
      const tr = document.createElement('tr'); if (isMe(e.id)) tr.className = 'me';
      const nameCell = document.createElement('td');
      const dot = document.createElement('span'); dot.className = 'tab-score-dot'; dot.style.color = COLORS[e.color] || '#c7f36b'; dot.style.background = 'currentColor';
      nameCell.append(dot, document.createTextNode(e.id + (isMe(e.id) ? ' (BẠN)' : '')));
      const status = !e.alive ? `HỒI SINH ${e.respawn > 0 ? e.respawn.toFixed(1) + 's' : ''}`.trim() : e.invuln > 0 ? 'BẤT TỬ' : 'SỐNG';
      [e.kills, e.deaths, e.points, e.streak, status].forEach(value => {
        const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
      });
      tr.prepend(nameCell);
      body.append(tr);
    });
  }

  function showOverlay(title, text, buttonText, action) { $('overlay-title').textContent = title; $('overlay-text').textContent = text; $('overlay-action').textContent = buttonText; roundOverlayAction = action; $('arena-overlay').hidden = false; }
  function hideOverlay() { $('arena-overlay').hidden = true; roundOverlayAction = null; }

  // ---------------------------------------------------------------- input

  function getCurrentWorldDimensions() {
    if (mode === 'online' && latestSnapshot) {
      const world = readField(latestSnapshot, 'wsMaze');
      if (world) return { w: Number(readField(world, 'mazeWidth') || WORLD_W), h: Number(readField(world, 'mazeHeight') || WORLD_H) };
    }
    return { w: WORLD_W, h: WORLD_H };
  }

  function updateCurrentInput() {
    if (mode !== 'online' || !wsReady || !loggedIn || screenName !== 'game') return;
    const snapshot = latestSnapshot; if (!snapshot) return;
    setMovementSound(input.up || input.down || input.left || input.right);
    const tanks = readField(snapshot, 'wsTanks') || []; const me = tanks.find(t => readField(t, 'tankId') === username) || tanks[0]; if (!me) return;
    const pos = readField(me, 'tankPos') || { vx: 0, vy: 0 };
    const dims = getCurrentWorldDimensions();
    const mouseWorldX = input.mouseX, mouseWorldY = dims.h - input.mouseY;
    const angle = Math.atan2(mouseWorldY - Number(readField(pos, 'vy') || 0), mouseWorldX - Number(readField(pos, 'vx') || 0));
    sendMessage('CPlayerInput', { piMoveUp: input.up, piMoveDown: input.down, piMoveLeft: input.left, piMoveRight: input.right, piMouseAngle: angle, piFire: input.fire, piReload: input.reloadPulse });
    input.reloadPulse = false;
  }
  function startInputSender() { stopInputSender(); inputTimer = window.setInterval(updateCurrentInput, 1000 / 30); }
  function stopInputSender() { if (inputTimer !== null) { clearInterval(inputTimer); inputTimer = null; } }

  function setKey(key, pressed) {
    const k = key.toLowerCase();
    if (['w', 'arrowup'].includes(k)) input.up = pressed;
    else if (['s', 'arrowdown'].includes(k)) input.down = pressed;
    else if (['a', 'arrowleft'].includes(k)) input.left = pressed;
    else if (['d', 'arrowright'].includes(k)) input.right = pressed;
    else if (k === ' ' || k === 'space') input.fire = pressed;
  }
  function resetInput() {
    input.up = input.down = input.left = input.right = input.fire = false;
    input.reloadRequest = false;
    document.body.classList.remove('mouse-pressed');
    setMovementSound(false);
  }

  // R: reload the 6-round magazine. Offline uses the local simulator; online sends piReload to the server.
  function requestReload() {
    if (mode === 'offline') input.reloadRequest = true;
    else if (mode === 'online') input.reloadPulse = true;
  }

  document.addEventListener('keydown', e => {
    if (screenName !== 'game') return;
    if (e.key === 'Tab') { e.preventDefault(); if (!e.repeat) showTabScoreboard(true); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'Escape') { e.preventDefault(); togglePauseModal(); return; }
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) { if (!e.repeat && !isPaused) requestReload(); return; }
    setKey(e.key, true);
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'Tab') { showTabScoreboard(false); return; }
    setKey(e.key, false);
  });
  window.addEventListener('blur', () => { resetInput(); showTabScoreboard(false); });

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

  // Touch screen support for responsive mobile/tablet play
  function handleTouch(e) {
    if (!e.touches.length) return;
    pointerToWorld(e.touches[0].clientX, e.touches[0].clientY);
  }
  canvas.addEventListener('touchstart', e => { e.preventDefault(); handleTouch(e); input.fire = true; }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); handleTouch(e); }, { passive: false });
  window.addEventListener('touchend', () => { input.fire = false; });

  // ---------------------------------------------------------------- pause / leave

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
    isPaused = false;
    if (modal) modal.hidden = true;
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
      // SRoomLeft from the server moves the player back to the lobby.
      if (activeRoom) sendMessage('CLeaveRoom');
      else showScreen('lobby');
    } else {
      setMovementSound(false);
      leaveGameplayFullscreen();
      localGame = null;
      localMap = null;
      mode = 'none';
      showScreen('home');
    }
  }

  function quitGame() {
    window.close();
    window.setTimeout(() => { if (!window.closed) window.location.replace('about:blank'); }, 120);
  }

  // ---------------------------------------------------------------- canvas sizing

  // Keep layout responsive by sizing the canvas backing buffer to the screen resolution.
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

  // ---------------------------------------------------------------- event wiring (each handler registered once)

  $('online-button').addEventListener('click', () => openTankSelect('connect'));
  $('practice-button').addEventListener('click', () => openTankSelect('offline'));
  $('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') openTankSelect('connect'); });
  $('server-url').addEventListener('keydown', e => { if (e.key === 'Enter') openTankSelect('connect'); });
  $('main-exit').addEventListener('click', quitGame);
  $('map-back').addEventListener('click', () => showScreen('home'));
  document.querySelectorAll('[data-map]').forEach(button => button.addEventListener('click', () => chooseOfflineMap(button.dataset.map)));
  $('tank-select-back').addEventListener('click', closeTankSelect);
  $('tank-confirm').addEventListener('click', confirmTankSelection);
  document.querySelectorAll('[data-hull]').forEach(button => button.addEventListener('click', () => {
    selectedHullId = button.dataset.hull || '05';
    refreshTankAssembly();
  }));
  document.querySelectorAll('[data-gun]').forEach(button => button.addEventListener('click', () => {
    selectedGunId = button.dataset.gun || '05';
    refreshTankAssembly();
  }));
  $('results-exit').addEventListener('click', exitResultsToHome);
  $('brand-home').addEventListener('click', e => { e.preventDefault(); if (screenName === 'game') togglePauseModal(); else showScreen('home'); });
  $('refresh-rooms').addEventListener('click', () => { setError('lobby-error', ''); sendMessage('CListRooms'); });
  $('create-button').addEventListener('click', createRoom);
  $('create-test-button').addEventListener('click', () => openTankSelect('offline'));
  $('join-button').addEventListener('click', joinRoom);
  $('join-id').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  $('join-id').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  $('start-button').addEventListener('click', () => {
    unlockAudio(); setError('lobby-error', '');
    if (!isHost) { setError('lobby-error', 'Chỉ chủ phòng mới có thể bắt đầu.'); return; }
    enterGameplayFullscreen();
    sendMessage('CStartGame');
  });
  $('leave-room').addEventListener('click', () => { if (wsReady && activeRoom) sendMessage('CLeaveRoom'); else { activeRoom = null; showScreen('lobby'); } });
  $('lobby-back').addEventListener('click', () => { if (activeRoom) sendMessage('CLeaveRoom'); else { closeSocket(); showScreen('home'); } });
  $('copy-room-code').addEventListener('click', async () => {
    const code = $('room-code').textContent;
    try { await navigator.clipboard.writeText(code); $('copy-room-code').textContent = '✓'; setTimeout(() => $('copy-room-code').textContent = '⧉', 900); }
    catch (_) { $('join-id').value = code; }
  });
  $('overlay-action').addEventListener('click', () => { const action = roundOverlayAction; hideOverlay(); if (action) action(); });
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('click', event => { if (event.target.closest('button') && event.target.closest('#sound-toggle') === null) playSfx('click', .24); });
  $('sound-toggle').addEventListener('click', toggleSound);
  $('pause-open-btn')?.addEventListener('click', togglePauseModal);
  $('pause-resume-btn')?.addEventListener('click', hidePauseModal);
  $('pause-leave-btn')?.addEventListener('click', leaveCurrentMatch);
  $('pause-sound-btn')?.addEventListener('click', toggleSound);
  $('pause-fullscreen-btn')?.addEventListener('click', () => {
    if (!document.fullscreenElement) enterGameplayFullscreen(); else leaveGameplayFullscreen();
  });
  $('exit-game')?.addEventListener('click', togglePauseModal);

  const fullscreenBtn = $('fullscreen-button');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) enterGameplayFullscreen(); else leaveGameplayFullscreen();
    });
    document.addEventListener('fullscreenchange', () => {
      fullscreenBtn.textContent = document.fullscreenElement ? 'THU NHỎ 🗗' : '⛶ TOÀN MÀN HÌNH';
      setTimeout(resizeCanvasBacking, 60);
    });
  }

  const volumeSlider = $('pause-volume');
  if (volumeSlider) {
    const saved = Number(localStorage.getItem('tankwar-music-volume'));
    if (Number.isFinite(saved) && localStorage.getItem('tankwar-music-volume') !== null) volumeSlider.value = String(clamp(saved, 0, 100));
    const applyVolume = () => {
      musicScale = Number(volumeSlider.value) / 100;
      setText('pause-volume-value', `${volumeSlider.value}%`);
      applyMusicVolume();
      localStorage.setItem('tankwar-music-volume', volumeSlider.value);
    };
    volumeSlider.addEventListener('input', applyVolume);
    applyVolume();
  }

  // Small defaults are remembered locally for the next session.
  $('player-name').value = localStorage.getItem('tankwar-name') || '';
  $('server-url').value = localStorage.getItem('tankwar-server') || 'ws://localhost:8080';
  refreshTankAssembly();
  refreshSoundToggle();
  resizeCanvasBacking();

  // Expose a small protocol diagnostic through the console for coursework debugging.
  window.TankWarClient = { get mode() { return mode; }, get connected() { return wsReady; }, get room() { return activeRoom; }, send: sendMessage };
})();
