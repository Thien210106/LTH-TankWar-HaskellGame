/* TankWar browser client. No frontend build step is required.
 * Online protocol mirrors Common.Protocol.hs (Aeson Generic tagged encoding).
 * The offline practice mode uses the same canvas renderer but a local simulator.
 */
(() => {
  'use strict';

  const WORLD_W = 832;
  const WORLD_H = 576;
  const TANK_RADIUS = 15;
  const COLORS = {
    TankRed: '#ff655d', TankBlue: '#5ca9ff', TankGreen: '#8ae65e', TankYellow: '#ffd45d',
    red: '#ff655d', blue: '#5ca9ff', green: '#8ae65e', yellow: '#ffd45d'
  };
  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $('home-screen'), lobby: $('lobby-screen'), room: $('room-screen'), game: $('game-screen')
  };
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const input = { up: false, down: false, left: false, right: false, fire: false, mouseX: WORLD_W / 2, mouseY: WORLD_H / 2 };
  const imageFiles = {
    hull: 'assets/img/tank-hull.png', gun: 'assets/img/tank-gun.png',
    shotgun: 'assets/img/bullet-shotgun.png', laser: 'assets/img/bullet-laser.png',
    gatling: 'assets/img/bullet-gatling.png', piercing: 'assets/img/bullet-piercing.png',
    box: 'assets/img/mystery-box.png', explosion: 'assets/img/explosion.png'
  };
  const images = {};
  const tintedImages = new Map();
  Object.entries(imageFiles).forEach(([name, src]) => {
    const im = new Image();
    im.src = src;
    images[name] = im;
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
  let soundEnabled = false;
  let audioContext = null;
  let roundOverlayAction = null;
  let localGame = null;
  let lastOnlineUiUpdate = 0;

  const mazeWalls = buildMazeWalls();
  const maze = {
    mazeWidth: WORLD_W,
    mazeHeight: WORLD_H,
    mazeWalls,
    mazeSpawnPts: [{ vx: 96, vy: 96 }, { vx: 736, vy: 480 }, { vx: 736, vy: 96 }, { vx: 96, vy: 480 }],
    mazeBoxSpawnPts: [{ vx: 256, vy: 288 }, { vx: 576, vy: 288 }, { vx: 416, vy: 128 }, { vx: 416, vy: 448 }, { vx: 416, vy: 288 }]
  };

  function buildMazeWalls() {
    const cs = 64, w = WORLD_W, h = WORLD_H;
    const vec = (x, y) => ({ vx: x, vy: y });
    const wall = (x1, y1, x2, y2) => ({ wallStart: vec(x1, y1), wallEnd: vec(x2, y2) });
    return [
      wall(0, 0, w, 0), wall(w, 0, w, h), wall(w, h, 0, h), wall(0, h, 0, 0),
      wall(2*cs, 3*cs, 4*cs, 3*cs), wall(5*cs, 3*cs, 7*cs, 3*cs),
      wall(6*cs, 6*cs, 8*cs, 6*cs), wall(9*cs, 3*cs, 11*cs, 3*cs),
      wall(3*cs, 2*cs, 5*cs, 2*cs), wall(8*cs, 2*cs, 10*cs, 2*cs),
      wall(3*cs, 7*cs, 5*cs, 7*cs), wall(8*cs, 7*cs, 10*cs, 7*cs),
      wall(2*cs, 1*cs, 2*cs, 3*cs), wall(11*cs, 1*cs, 11*cs, 3*cs),
      wall(2*cs, 6*cs, 2*cs, 8*cs), wall(11*cs, 6*cs, 11*cs, 8*cs),
      wall(6*cs, 4*cs, 6*cs, 5*cs), wall(7*cs, 4*cs, 7*cs, 5*cs),
      wall(5*cs, 4.5*cs, 6*cs, 4.5*cs), wall(7*cs, 4.5*cs, 8*cs, 4.5*cs)
    ];
  }

  function showScreen(name) {
    screenName = name;
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    if (name === 'game') startRenderLoop();
    else stopRenderLoop();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    return undefined;
  }

  function unwrapOne(value) {
    return Array.isArray(value) && value.length === 1 ? value[0] : value;
  }

  function sendMessage(tag, contents) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    const message = { tag };
    if (contents !== undefined) message.contents = contents;
    try { ws.send(JSON.stringify(message)); return true; }
    catch (error) { addFeed(`Không gửi được gói tin: ${error.message}`, 'warn'); return false; }
  }

  function connectOnline() {
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
    $('online-button').innerHTML = '<span>⌁</span> ĐANG KẾT NỐI…';
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
    $('online-button').innerHTML = '<span>⌁</span> KẾT NỐI ONLINE <b>↗</b>';
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
        $('countdown-banner').hidden = false;
        $('countdown-banner').textContent = `TRẬN ĐẤU BẮT ĐẦU SAU ${Math.max(0, Math.ceil(seconds || 0))}…`;
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
        showOverlay('KẾT THÚC HIỆP', `${winner} thắng hiệp này. Chuẩn bị cho vòng tiếp theo.`, 'TIẾP TỤC', () => hideOverlay());
        addFeed(`${winner} thắng hiệp đấu.`); break;
      }
      case 'SMatchOver': {
        const values = Array.isArray(data) ? data : [];
        const winner = values[0] || 'Chưa xác định';
        showOverlay('TRẬN ĐẤU KẾT THÚC', `${winner} là người chiến thắng chung cuộc.`, 'VỀ PHÒNG CHỜ', () => { hideOverlay(); if (mode === 'online' && activeRoom) sendMessage('CLeaveRoom'); else { showScreen('lobby'); sendMessage('CListRooms'); } });
        addFeed(`Chiến thắng chung cuộc: ${winner}`, 'warn'); break;
      }
      case 'SKillEvent': {
        const pair = Array.isArray(data) ? data : [];
        addFeed(`${pair[0] || 'Ai đó'} hạ ${pair[1] || 'đối thủ'}!`, 'warn'); break;
      }
      case 'SMysteryBoxPickup': {
        const pair = Array.isArray(data) ? data : [];
        addFeed(`${pair[0] || 'Người chơi'} nhặt hộp: ${weaponName(pair[1])}.`); break;
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

  function onRoomReady() {
    setError('lobby-error', '');
    roomPlayerNames = [{ name: username || displayName || 'Bạn', color: isHost ? 'TankRed' : 'TankBlue', self: true, host: isHost }];
    $('room-title').textContent = (readField(activeRoom, 'riRoomName') || 'PHÒNG CHIẾN ĐẤU').toString().toUpperCase();
    $('room-code').textContent = readField(activeRoom, 'riRoomId') || '------';
    $('room-caption').textContent = isHost ? 'Bạn là chủ phòng. Chờ bạn bè tham gia.' : 'Bạn đã tham gia phòng. Chờ chủ phòng bắt đầu.';
    $('countdown-banner').hidden = true;
    setError('room-error', '');
    renderRoomPlayers();
    showScreen('room');
    addFeed(isHost ? 'Đã tạo phòng mới.' : 'Đã tham gia phòng.');
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
    setError('lobby-error', '');
    const roomName = $('room-name').value.trim() || `${displayName || username}’s Arena`;
    const max = Number($('max-players').value || 4);
    const password = $('create-password').value;
    if (!wsReady || !loggedIn) { setError('lobby-error', 'Chưa đăng nhập vào server.'); return; }
    sendMessage('CCreateRoom', { ccrRoomName: roomName, ccrMaxPlayers: max, ccrPassword: password ? password : null });
  }

  function joinRoom() {
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

  function startOffline() {
    const enteredName = $('player-name').value.trim();
    username = enteredName || localStorage.getItem('tankwar-name') || 'TankPilot';
    displayName = username;
    $('player-name').value = username;
    localStorage.setItem('tankwar-name', username);
    closeSocket(false);
    mode = 'offline'; activeRoom = null; isHost = false;
    localGame = createLocalGame(username);
    latestSnapshot = localSnapshot();
    $('match-mode').textContent = 'OFFLINE PRACTICE';
    $('match-room').textContent = 'TRAINING';
    $('phase-label').textContent = 'ĐANG THỰC HÀNH';
    $('match-player-count').textContent = '4';
    setError('home-error', '');
    statusPill('idle', 'CHẾ ĐỘ OFFLINE');
    updateMatchHeader(latestSnapshot); updateScoreboard(latestSnapshot); updateWeaponPanel(latestSnapshot);
    showScreen('game');
    addFeed('Bắt đầu chế độ thực hành offline.');
  }

  function createLocalGame(name) {
    const spawns = maze.mazeSpawnPts;
    const colors = ['TankRed','TankBlue','TankGreen','TankYellow'];
    const names = [name, 'CPU-ALPHA', 'CPU-BRAVO', 'CPU-DELTA'];
    const tanks = names.map((n,i) => ({
      tankId: n,
      tankPos: { ...spawns[i] }, tankVel: { vx: 0, vy: 0 }, tankBodyAngle: 0,
      tankTurretAngle: Math.PI, tankColor: colors[i],
      tankWeapon: { wsCurrentWeapon: 'NormalBullet', wsBuffTimeLeft: 0, wsCooldownState: 'Ready' },
      tankAlive: true, tankScore: 0, tankKills: 0,
      _bot: i > 0, _cooldown: .8 + i * .45, _respawn: 0, _dirTimer: 0, _direction: Math.random() * Math.PI * 2
    }));
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
    if (!localGame || localGame.gameOver) return;
    const g = localGame; g.time += dt; g.fireCooldown = Math.max(0,g.fireCooldown-dt);
    const player = g.tanks[0];
    if (!player.tankAlive) return;
    const dx = (input.right?1:0)-(input.left?1:0), dy = (input.up?1:0)-(input.down?1:0);
    if (dx || dy) {
      const len = Math.hypot(dx,dy); const mx=dx/len*150*dt, my=dy/len*150*dt;
      const old = player.tankPos; const nextX={vx:old.vx+mx,vy:old.vy}; const nextY={vx:old.vx,vy:old.vy+my};
      if (!hitsWall(nextX,TANK_RADIUS,true)) old.vx=clamp(nextX.vx,TANK_RADIUS,WORLD_W-TANK_RADIUS);
      if (!hitsWall(nextY,TANK_RADIUS,true)) old.vy=clamp(nextY.vy,TANK_RADIUS,WORLD_H-TANK_RADIUS);
      player.tankBodyAngle = Math.atan2(dy,dx);
    }
    const aimX=input.mouseX, aimY=WORLD_H-input.mouseY;
    player.tankTurretAngle=Math.atan2(aimY-player.tankPos.vy,aimX-player.tankPos.vx);
    const weapon = player.tankWeapon;
    weapon.wsBuffTimeLeft=Math.max(0,weapon.wsBuffTimeLeft-dt);
    if (weapon.wsBuffTimeLeft<=0 && weapon.wsCurrentWeapon!=='NormalBullet') weapon.wsCurrentWeapon='NormalBullet';
    if (input.fire && g.fireCooldown<=0) {
      localShoot(player,player.tankTurretAngle,weapon.wsCurrentWeapon);
      g.fireCooldown=weapon.wsCurrentWeapon==='NormalBullet'?1:2;
    }
    weapon.wsCooldownState = g.fireCooldown > 0 ? { tag: 'Reloading', contents: g.fireCooldown } : 'Ready';
    g.boxTimer -= dt;
    if (g.boxTimer<=0 && g.boxes.length===0) {
      const pt=maze.mazeBoxSpawnPts[Math.floor(Math.random()*maze.mazeBoxSpawnPts.length)];
      g.boxes.push({pos:{...pt},life:12}); g.boxTimer=22+Math.random()*8;
    }
    g.boxes.forEach(box=>box.life-=dt); g.boxes=g.boxes.filter(b=>b.life>0);
    if (g.boxes.some(b=>distance(b.pos,player.tankPos)<23)) {
      g.boxes=[]; const special=['ShotgunBullet','LaserBullet','WallPiercingBullet','GatlingBullet'][Math.floor(Math.random()*4)];
      weapon.wsCurrentWeapon=special; weapon.wsBuffTimeLeft=15;
      addFeed(`Nhặt Mystery Box: ${weaponName(special)} trong 15 giây!`);
    }

    g.tanks.slice(1).forEach((bot,idx)=>{
      if (!bot.tankAlive) { bot._respawn-=dt; if (bot._respawn<=0) { const sp=maze.mazeSpawnPts[idx+1]; bot.tankPos={...sp}; bot.tankAlive=true; bot._cooldown=1.2; } return; }
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

    const internalWalls=mazeWalls.slice(4);
    g.bullets.forEach(b=>{
      b.life-=dt; const nx=b.pos.vx+b.vel.vx*dt, ny=b.pos.vy+b.vel.vy*dt;
      if (nx<5||nx>WORLD_W-5) {b.vel.vx*=-1;b.bounces++;b.pos.vx=clamp(nx,5,WORLD_W-5);} else b.pos.vx=nx;
      if (ny<5||ny>WORLD_H-5) {b.vel.vy*=-1;b.bounces++;b.pos.vy=clamp(ny,5,WORLD_H-5);} else b.pos.vy=ny;
      if (b.type!=='WallPiercingBullet' && internalWalls.some(w=>pointWallDistance(b.pos,w)<7)) b.life=0;
      if (b.owner===player.tankId) {
        for (const bot of g.tanks.slice(1)) if (bot.tankAlive && distance(bot.tankPos,b.pos)<TANK_RADIUS+5) {
          bot.tankAlive=false;bot._respawn=2.3;player.tankKills++;player.tankScore++;g.kills++;g.score+=100;b.life=0;addFeed(`${player.tankId} hạ ${bot.tankId}!`,'warn');break;
        }
      } else if (player.tankAlive && distance(player.tankPos,b.pos)<TANK_RADIUS+5) {
        b.life=0;g.lives--;addFeed(`${b.owner} bắn trúng bạn. Còn ${g.lives} mạng!`,'warn');
        if(g.lives<=0){g.gameOver=true;showOverlay('XE TĂNG BỊ HẠ','Bạn đã hết mạng. Hãy thử lại và dùng tường để che chắn.','CHƠI LẠI',()=>startOffline());}
        else {player.tankPos={...maze.mazeSpawnPts[0]};}
      }
    });
    g.bullets=g.bullets.filter(b=>b.life>0&&b.bounces<=4);
    if (g.tanks.slice(1).every(t=>!t.tankAlive)) g.wave += dt;
  }

  function localShoot(tank, angle, type) {
    if (!localGame) return;
    const origin={vx:tank.tankPos.vx+Math.cos(angle)*24,vy:tank.tankPos.vy+Math.sin(angle)*24};
    const add=(a,speed=390)=>localGame.bullets.push({pos:{...origin},vel:{vx:Math.cos(a)*speed,vy:Math.sin(a)*speed},type,owner:tank.tankId,life:4,bounces:0});
    if(type==='ShotgunBullet'){add(angle-.22,340);add(angle,365);add(angle+.22,340);}
    else if(type==='GatlingBullet'){add(angle,410);add(angle+.04,410);}
    else if(type==='LaserBullet'){add(angle,570);}
    else if(type==='WallPiercingBullet'){add(angle,350);}
    else add(angle,400);
  }

  function hitsWall(pos,radius,includeInner) {
    if(pos.vx<radius||pos.vx>WORLD_W-radius||pos.vy<radius||pos.vy>WORLD_H-radius)return true;
    const walls=includeInner?mazeWalls.slice(4):[];
    return walls.some(w=>pointWallDistance(pos,w)<radius+3);
  }
  function pointWallDistance(pos,wall) {
    const a=wall.wallStart,b=wall.wallEnd,px=pos.vx,py=pos.vy;
    const vx=b.vx-a.vx,vy=b.vy-a.vy,den=vx*vx+vy*vy;
    const t=den?clamp(((px-a.vx)*vx+(py-a.vy)*vy)/den,0,1):0;
    return Math.hypot(px-(a.vx+t*vx),py-(a.vy+t*vy));
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
    ctx.clearRect(0,0,WORLD_W,WORLD_H);
    drawGround();
    const world=readField(snapshot,'wsMaze')||maze;
    const width=Number(readField(world,'mazeWidth')||WORLD_W),height=Number(readField(world,'mazeHeight')||WORLD_H);
    drawWalls(readField(world,'mazeWalls')||mazeWalls,width,height);
    const boxes=readField(snapshot,'wsMysteryBoxes')||[];
    boxes.forEach(box=>{if(readField(box,'mbActive')!==false)drawBox(readField(box,'mbPos'));});
    (readField(snapshot,'wsLasers')||[]).forEach(laser=>drawLaser(readField(laser,'lsStart'),readField(laser,'lsEnd'),height));
    (readField(snapshot,'wsBullets')||[]).forEach(b=>drawBullet(b,height));
    (readField(snapshot,'wsTanks')||[]).forEach(t=>drawTank(t,height));
    drawVignette();
    if(mode==='offline'&&localGame){drawOfflineHud(localGame);}
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
    const id=readField(tank,'tankId')||'PLAYER',colorName=readField(tank,'tankColor')||'TankGreen';
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
    ctx.fillStyle='#e8f3e0';ctx.font='9px "IBM Plex Mono",monospace';ctx.textAlign='center';ctx.shadowColor='#0a100b';ctx.shadowBlur=4;ctx.fillText(String(id).slice(0,18),0,-29);ctx.shadowBlur=0;
    ctx.restore();
  }

  function drawTinted(img,color,x,y,w,h){
    // Draw the source art as-is and place a restrained colored marker; avoid washing out sprite details.
    ctx.drawImage(img,x,y,w,h);
    ctx.save();ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=.24;ctx.fillStyle=color;ctx.fillRect(x,y,w,h);ctx.restore();
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
  function drawBox(pos){
    if(!pos)return;const x=Number(readField(pos,'vx')||0),y=WORLD_H-Number(readField(pos,'vy')||0);
    const im=images.box;
    ctx.save();ctx.shadowColor='#e8c95a';ctx.shadowBlur=12;
    if(im&&im.complete&&im.naturalWidth){ctx.drawImage(im,x-13,y-13,26,26);}else{ctx.fillStyle='#d3aa42';ctx.fillRect(x-11,y-11,22,22);ctx.fillStyle='#1c281b';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText('?',x,y+6);}
    ctx.restore();
  }
  function drawLaser(a,b,height){if(!a||!b)return;const x1=Number(readField(a,'vx')||0),y1=height-Number(readField(a,'vy')||0),x2=Number(readField(b,'vx')||0),y2=height-Number(readField(b,'vy')||0);ctx.save();ctx.strokeStyle='#89faff';ctx.shadowColor='#89faff';ctx.shadowBlur=12;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();}
  function drawVignette(){const grad=ctx.createRadialGradient(WORLD_W/2,WORLD_H/2,80,WORLD_W/2,WORLD_H/2,Math.max(WORLD_W,WORLD_H)*.75);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(4,10,5,.33)');ctx.fillStyle=grad;ctx.fillRect(0,0,WORLD_W,WORLD_H);}
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
    if(!snapshot)return;const tanks=readField(snapshot,'wsTanks')||[];
    const mine=tanks.find(t=>readField(t,'tankId')===username)||tanks.find(t=>readField(t,'tankId')===displayName)||tanks[0];if(!mine)return;
    const weapon=readField(mine,'tankWeapon')||{};const type=readField(weapon,'wsCurrentWeapon')||'NormalBullet';
    const buff=Number(readField(weapon,'wsBuffTimeLeft')||0);const cooldown=readField(weapon,'wsCooldownState');
    $('weapon-name').textContent=weaponName(type).toUpperCase();$('weapon-symbol').textContent=weaponSymbol(type);
    $('weapon-timer').textContent=buff>0?`BUFF CÒN ${buff.toFixed(1)}S`:cooldown==='Ready'||tagOf(cooldown)==='Ready'?'SẴN SÀNG':'ĐANG HỒI ĐẠN';
    let ratio=1;if(typeof cooldown==='object'&&cooldown){const tag=tagOf(cooldown);if(tag==='Reloading'){const v=Array.isArray(cooldown.contents)?cooldown.contents[0]:cooldown.contents;ratio=1-clamp(Number(v||0)/2,0,1);}else if(tag==='GatlingBurst'){ratio=.65;}}
    $('cooldown-fill').style.width=`${Math.round(ratio*100)}%`;
  }
  function weaponName(type){return ({NormalBullet:'Đạn thường',ShotgunBullet:'Đạn chùm',LaserBullet:'Tia laser',WallPiercingBullet:'Đạn xuyên tường',GatlingBullet:'Đạn liên thanh'})[type]||String(type||'Đạn thường').replace('Bullet','');}
  function weaponSymbol(type){return ({NormalBullet:'●',ShotgunBullet:'✹',LaserBullet:'ϟ',WallPiercingBullet:'↗',GatlingBullet:'»'})[type]||'●';}
  function addFeed(text,type=''){const root=$('event-feed');const row=document.createElement('div');row.className=`feed-item ${type}`;const time=new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});row.textContent=`[${time}] ${text}`;root.prepend(row);while(root.children.length>8)root.lastElementChild.remove();}

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
    if(e.key==='Escape'&&screenName==='game')confirmExitGame();
  });
  document.addEventListener('keyup',e=>setKey(e.key,false));
  window.addEventListener('blur',()=>{input.up=input.down=input.left=input.right=input.fire=false;});
  canvas.addEventListener('mousemove',e=>{const rect=canvas.getBoundingClientRect();input.mouseX=(e.clientX-rect.left)/rect.width*WORLD_W;input.mouseY=(e.clientY-rect.top)/rect.height*WORLD_H;});
  canvas.addEventListener('mousedown',e=>{if(e.button===0){input.fire=true;}});
  window.addEventListener('mouseup',e=>{if(e.button===0)input.fire=false;});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  function confirmExitGame(){showOverlay('RỜI TRẬN?',mode==='online'?'Bạn sẽ rời phòng online hiện tại.':'Bạn sẽ kết thúc lượt thực hành này.','RỜI TRẬN',()=>{hideOverlay();if(mode==='online'){sendMessage('CLeaveRoom');}else{localGame=null;showScreen('home');}});}

  $('online-button').addEventListener('click',connectOnline);
  $('practice-button').addEventListener('click',startOffline);
  $('brand-home').addEventListener('click',e=>{e.preventDefault();if(screenName==='game')confirmExitGame();else showScreen('home');});
  $('refresh-rooms').addEventListener('click',()=>{setError('lobby-error','');sendMessage('CListRooms');});
  $('create-button').addEventListener('click',createRoom);
  $('join-button').addEventListener('click',joinRoom);
  $('join-id').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);});
  $('join-id').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom();});
  $('start-button').addEventListener('click',()=>{setError('lobby-error','');if(!isHost){setError('lobby-error','Chỉ chủ phòng mới có thể bắt đầu.');return;}sendMessage('CStartGame');});
  $('leave-room').addEventListener('click',()=>{if(wsReady&&activeRoom)sendMessage('CLeaveRoom');else{activeRoom=null;showScreen('lobby');}});
  $('lobby-back').addEventListener('click',()=>{if(activeRoom)sendMessage('CLeaveRoom');else{closeSocket();showScreen('home');}});
  $('exit-game').addEventListener('click',confirmExitGame);
  $('copy-room-code').addEventListener('click',async()=>{const code=$('room-code').textContent;try{await navigator.clipboard.writeText(code);$('copy-room-code').textContent='✓';setTimeout(()=>$('copy-room-code').textContent='⧉',900);}catch(_){$('join-id').value=code;}});
  $('overlay-action').addEventListener('click',()=>{if(roundOverlayAction)roundOverlayAction();});
  $('sound-toggle').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('sound-toggle').style.color=soundEnabled?'var(--lime)':'var(--muted)';if(soundEnabled){try{audioContext=audioContext||new(window.AudioContext||window.webkitAudioContext)();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.frequency.value=660;gain.gain.value=.025;osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.08);}catch(_){}}});

  // Small defaults are remembered locally for the next session.
  $('player-name').value=localStorage.getItem('tankwar-name')||'';
  $('server-url').value=localStorage.getItem('tankwar-server')||'ws://localhost:8080';
  setTimeout(()=>{if(screenName==='game'&&mode==='online')startInputSender();},0);

  // Start/stop the network input sender when the online game view is entered.
  const originalShowScreen=showScreen;
  showScreen=function(name){originalShowScreen(name);if(name==='game'&&mode==='online')startInputSender();else stopInputSender();};

  // Keep layout responsive by reserving the expected client logical canvas size.
  function resizeCanvasBacking(){if(canvas.width!==WORLD_W)canvas.width=WORLD_W;if(canvas.height!==WORLD_H)canvas.height=WORLD_H;}
  resizeCanvasBacking();

  // Expose a small protocol diagnostic through the console for coursework debugging.
  window.TankWarClient={get mode(){return mode;},get connected(){return wsReady;},get room(){return activeRoom;},send:sendMessage};
})();
