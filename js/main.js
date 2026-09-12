// Главный модуль: цикл, вход, камера, открытый мир, коллизии, HUD
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    canvas.width = innerWidth * DPR;
    canvas.height = innerHeight * DPR;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
  }
  resize();
  addEventListener('resize', resize);

  const state = {
    player: null,
    enemies: [],
    bullets: [],
    doomBullets: [],
    grenades: [],
    vehicle: null,
    grenadeCd: 0,
    mapW: 0,
    mapH: 0,
    mapMargin: 8,
    camX: 0, camY: 0,
    shake: 0,
    input: { keys: {}, mouseDown: false, grenadePressed: false, reloadPressed: false, enterPressed: false, mx: 0, my: 0 },
    worldX: 0,
    worldY: 0,
    thirst: 100,   // вода
    food: 100,     // еда
    rad: 0,        // радиация (пока не работает)
    inventory: [], // подобранные припасы (строки-типы)
    items: [],     // припасы на текущей карте
    cellItems: {}, // припасы по ячейкам мира: key -> массив предметов
    invOpen: false,
    shop: null,    // магазин на спавне {x, y, hw, hh}
    shopOpen: false,
    spawnTp: 0,    // отсчёт возврата на спавн (сек), 0 = выкл
    deathTimer: 0, // авто-возрождение после смерти
    spawnCd: 1.2,
    score: 0,
    kills: 0,
    time: 0,
    gameState: 'loading'
  };

  // Припасы мира: тип -> имя, спрайт, что восстанавливает
  const ITEM_DEFS = {
    water:      { name: 'WATER',         tier: 'thirst', amount: 45, scale: 0.5 },
    sgushchenka:{ name: 'CONDENSED MILK',tier: 'food',   amount: 32, scale: 1 },
    goroh:      { name: 'PEAS',          tier: 'food',   amount: 26, scale: 1 },
    konserva:   { name: 'CANNED FOOD',   tier: 'food',   amount: 40, scale: 1 }
  };
  const ITEM_POOL = ['water', 'sgushchenka', 'goroh', 'konserva']; // вода чаще всех

  const DOM = {
    hud: document.getElementById('hud'),
    menu: document.getElementById('menu'),
    gameover: document.getElementById('gameover'),
    pause: document.getElementById('pause'),
    loading: document.getElementById('loading'),
    hpfill: document.getElementById('hpfill'),
    hpnum: document.getElementById('hpnum'),
    timenum: document.getElementById('timenum'),
    killnum: document.getElementById('killnum'),
    ammonum: document.getElementById('ammonum'),
    zoneid: document.getElementById('zoneid'),
    sf: {
      hp: document.getElementById('sf-hpnum'),
      thirst: document.getElementById('sf-thirstnum'),
      thirstfill: document.getElementById('thirstfill'),
      food: document.getElementById('sf-foodnum'),
      foodfill: document.getElementById('foodfill'),
      rad: document.getElementById('sf-radnum'),
      radfill: document.getElementById('radfill')
    },
    reloadtip: document.getElementById('reloadtip'),
    bossbarWrap: document.getElementById('bossbar-wrap'),
    bossfill: document.getElementById('bossfill'),
    carhint: document.getElementById('carhint'),
    pickuphint: document.getElementById('pickuphint'),
    invwrap: document.getElementById('invwrap'),
    invskin: document.getElementById('inv-skin-canvas'),
    invslots: document.getElementById('invslots'),
    spawnbtn: document.getElementById('spawnbtn'),
    shopwrap: document.getElementById('shopwrap'),
    shopX: document.getElementById('shop-x'),
    shopTraderImg: document.getElementById('shop-trader-img'),
    shopBody: document.getElementById('shop-body'),
    buildhint: document.getElementById('buildhint'),
    pvolMinus: document.getElementById('pvol-minus'),
    pvolPlus: document.getElementById('pvol-plus'),
    pvolNum: document.getElementById('pvol-num'),
    pmute: document.getElementById('pmute'),
    presume: document.getElementById('presume'),
    volhint: document.getElementById('volhint'),
    volnum: document.getElementById('volnum'),
    volicon: document.getElementById('volicon'),
    goKills: document.getElementById('go-kills'),
    goTime: document.getElementById('go-time'),
    guide: document.getElementById('guide'),
    guideClose: document.getElementById('guide-close')
  };

  // ---- ВХОД ----
  // Используем e.code — работает при любой раскладке (WASD это физические клавиши)
  const keys = state.input.keys;
  addEventListener('keydown', function (e) {
    const c = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
    keys[c] = true;
    if (c === 'KeyR') state.input.reloadPressed = true;
    if (c === 'KeyE') {
      // Открыт магазин — E закрывает его (не переоткрывая)
      if (state.shopOpen) closeShop();
      else state.input.enterPressed = true;
    }
    if (c === 'Escape' || c === 'KeyP') {
      if (state.shopOpen) closeShop();
      else if (state.invOpen) toggleInventory();
      else togglePause();
    }
    if (c === 'Tab' || c === 'KeyQ') toggleInventory();
    if (c === 'KeyF' && state.gameState === 'playing') {
      state.buildMode = !state.buildMode;
      if (state.buildMode) Game.audio.buildSound();
    }
    if (state.buildMode) {
      if (c === 'Digit1') state.buildMaterial = 'board';
      if (c === 'Digit2') state.buildMaterial = 'stone';
      if (c === 'Digit3') state.buildMaterial = 'door';
    }
    if (c === 'KeyM') { Game.audio.setMuted(!Game.audio.isMuted()); refreshPause(); }
    if (c === 'KeyH') toggleGuide();
    if (c === 'Equal' || c === 'NumpadAdd') { changeVolume(0.05); refreshPause(); }
    if (c === 'Minus' || c === 'NumpadSubtract') { changeVolume(-0.05); refreshPause(); }
  });
  addEventListener('keyup', function (e) {
    keys[e.code] = false;
  });
  canvas.addEventListener('mousemove', function (e) {
    state.input.mx = e.clientX + state.camX;
    state.input.my = e.clientY + state.camY;
  });
  canvas.addEventListener('mousedown', function (e) {
    const driving = state.vehicle && state.vehicle.driving;
    if (e.button === 0) {
      // В режиме стройки ЛКМ ставит стену, а не стреляет
      if (state.buildMode && state.gameState === 'playing' && !driving) {
        state.buildResult = Game.buildings.place(state, state.buildMaterial, state.input.mx, state.input.my, state.mapW, state.mapH);
        return;
      }
      state.input.mouseDown = true;
    }
    if (e.button === 2) {
      if (state.buildMode && state.gameState === 'playing' && !driving) {
        Game.buildings.remove(state, state.input.mx, state.input.my);
        return;
      }
      if (state.gameState === 'playing') state.input.grenadePressed = true;
    }
  });
  addEventListener('mouseup', function (e) {
    if (e.button === 0) state.input.mouseDown = false;
  });
  addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function togglePause() {
    if (state.gameState === 'playing') {
      state.gameState = 'paused';
      DOM.pause.classList.remove('hidden');
      refreshPause();
    } else if (state.gameState === 'paused') {
      state.gameState = 'playing';
      DOM.pause.classList.add('hidden');
    }
  }

  // Значения звука в панели паузы
  function refreshPause() {
    if (!DOM.pvolNum) return;
    const pct = Math.round(Game.audio.getVolume() / 0.9 * 100);
    DOM.pvolNum.textContent = pct;
    DOM.pmute.textContent = Game.audio.isMuted() || pct === 0 ? 'SOUND OFF' : 'SOUND ON';
  }
  DOM.pvolMinus.addEventListener('click', function () { changeVolume(-0.05); refreshPause(); });
  DOM.pvolPlus.addEventListener('click', function () { changeVolume(0.05); refreshPause(); });
  DOM.pmute.addEventListener('click', function () { Game.audio.setMuted(!Game.audio.isMuted()); refreshPause(); });
  DOM.presume.addEventListener('click', function () {
    if (state.gameState === 'paused') togglePause();
  });
  DOM.spawnbtn.addEventListener('click', toggleSpawnCountdown);
  DOM.shopX.addEventListener('click', closeShop);
  DOM.guideClose.addEventListener('click', function () {
    DOM.guide.classList.add('hidden');
  });
  // Гайд управления: показывается при старте игры, H — показать/скрыть
  function toggleGuide() {
    if (state.gameState === 'playing') DOM.guide.classList.toggle('hidden');
  }
  // Вкладки магазина: КУПИТЬ / ПРОДАТЬ / ОБМЕНЯТЬ
  const shopTabs = document.querySelectorAll('.shop-tab');
  for (const b of shopTabs) {
    b.addEventListener('click', function (e) {
      setShopTab(this.dataset.tab);
    });
  }

  // ---- ГРОМКОСТЬ ----
  let volHintT = 0;
  function changeVolume(step) {
    Game.audio.changeVolume(step);
    showVolHint();
  }
  function showVolHint() {
    const pct = Math.round(Game.audio.getVolume() / 0.9 * 100);
    DOM.volnum.textContent = pct;
    DOM.volicon.textContent = Game.audio.isMuted() || pct === 0 ? '♪×' : '♪';
    DOM.volhint.classList.remove('hidden');
    volHintT = 1.1;
  }

  // Камера "трясётся" при выстрелах и уроне
  Game.shake = function (d) { state.shake += d; };

  // ---- ЖИЗНЕННЫЙ ЦИКЛ ИГРЫ ----
  function newGame() {
    // Начинаем с основной карты, чистые зоны (сбрасываем кляксы крови)
    state.worldX = 0;
    state.worldY = 0;
    Game.assets.enterCell(0, 0);
    Game.assets.resetWorldCaches();
    state.mapW = Game.assets.mapW;
    state.mapH = Game.assets.mapH;
    if (!state.mapW) { state.mapW = state.mapH = 1500; }
    console.log('[GAME] start cell map', state.mapW + 'x' + state.mapH,
      'worldImgs:', Object.keys(Game.assets._worldImgs || {}).length);

    state.player = new Game.Player(state.mapW / 2, state.mapH / 2);
    state.enemies = [];
    state.bullets = [];
    state.doomBullets = [];
    state.grenades = [];
    state.vehicle = Game.vehicleCreate(state.player.x, state.player.y, state.mapW, state.mapH);
    state.vehicle.cell = Game.assets._curKey;
    Game.buildings.init(state);
    state.grenadeCd = 0;
    state.thirst = 100;
    state.food = 100;
    state.rad = 0;
    state.inventory = [];
    state.cellItems = {};
    state.items = [];
    state.invOpen = false;
    state.shopOpen = false;
    state.spawnTp = 0;
    DOM.invwrap.classList.add('hidden');
    DOM.shopwrap.classList.add('hidden');
    updateSpawnBtn();
    // Магазин стоит на спавн-карте (первая), чуть в сторону от центра
    state.shop = {
      x: state.mapW * 0.78,
      y: state.mapH * 0.26,
      hw: 200,
      hh: 200
    };
    ensureCellItems();
    state.spawnCd = 1.2;
    state.score = 0;
    state.kills = 0;
    state.time = 0;
    state.input.mouseDown = false;
    // Прицел по умолчанию — по центру карты
    state.input.mx = state.player.x;
    state.input.my = state.player.y;
    state.camX = state.player.x - innerWidth / 2;
    state.camY = state.player.y - innerHeight / 2;
    state.gameState = 'playing';

    DOM.hud.classList.remove('hidden');
    DOM.gameover.classList.add('hidden');
    DOM.guide.classList.remove('hidden');
    DOM.menu.classList.add('hidden');
    DOM.pause.classList.add('hidden');
    Game.audio.playMusic();
  }

  // В открытом мире враги появляются сами в случайных местах карты:
  // сперва зомби, потом бегуны, думгаи, бруты, а боссы заходят «иногда»
  function pickSpawnType(minutes) {
    const r = Math.random();
    if (minutes > 0.4 && r < 0.022) return 'boss';
    if (minutes > 0.15 && r < 0.14) return 'doom';
    if (minutes > 1.4 && r < 0.1) return 'brute';
    if (minutes > 0.5 && r < 0.13) return 'runner';
    return 'walker';
  }

  function spawnEnemy(type) {
    const p = state.player;
    // Случайная точка по всей карте, но не вплотную к игроку
    const m = state.mapMargin + 60;
    let x, y, tries = 0;
    do {
      x = rand(m, state.mapW - m);
      y = rand(m, state.mapH - m);
      tries++;
    } while (tries < 60 && dist2(x, y, p.x, p.y) < 280 * 280);
    // Если точка упёрлась в стены игрока — выйти наружу
    for (let i = 0; i < 24 && Game.buildings.solidAt(state, x, y); i++) {
      const wa = rand(0, Math.PI * 2);
      x = clamp(x + Math.cos(wa) * 48, 50, state.mapW - 50);
      y = clamp(y + Math.sin(wa) * 48, 50, state.mapH - 50);
    }
    const spr = type === 'brute' ? 26 : (type === 'boss' ? 30 : 17);
    const r = Game.buildings.resolve(x, y, spr * 1.55, state);
    // Сила врагов растёт с прожитым временем (чуть больше скорости и HP)
    const power = Math.min(state.time / 60 * 0.07, 0.6);
    const en = new Game.Enemy(type, r.x, r.y, power);
    state.enemies.push(en);
    Game.effects.blood(r.x, r.y, Math.random() * Math.PI * 2, 6);
  }

  // Переход в соседнюю ячейку мира (за границей карты начинается новая)
  function enterNeighbor(dx, dy) {
    state.worldX += dx;
    state.worldY += dy;
    Game.assets.enterCell(state.worldX, state.worldY);
    state.mapW = Game.assets.mapW;
    state.mapH = Game.assets.mapH;
    // Свежая зона: своя толпа врагов, свои эффекты
    state.enemies = [];
    state.bullets = [];
    state.doomBullets = [];
    state.grenades = [];
    Game.effects.resetEffects();
    const pl = state.player;
    // Машину забираем с собой только если едем за рулём
    if (state.vehicle) {
      if (state.vehicle.driving) {
        state.vehicle.cell = Game.assets._curKey;
        state.vehicle.x = pl.x;
        state.vehicle.y = pl.y;
      } else if (state.vehicle.cell !== Game.assets._curKey) {
        state.vehicle.x = -9999;
      }
    }
    state.camX = pl.x - innerWidth / 2;
    state.camY = pl.y - innerHeight / 2;
    // Припасы новой зоны — свои
    ensureCellItems();
    // Сбрасываем разовый ввод, чтобы на новой карте ничего не "залипло"
    state.input.mouseDown = false;
    state.input.enterPressed = false;
    state.input.grenadePressed = false;
    state.input.reloadPressed = false;
    Game.audio.doorClick();
  }

  // ---- ПРИПАСЫ ----
  // Для каждой ячейки мира припасы генерируются один раз и помнятся.
  // Раскладка случайная: «иногда немного», подальше от входа.
  function ensureCellItems() {
    const key = Game.assets._curKey;
    if (state.cellItems[key]) {
      state.items = state.cellItems[key];
      return;
    }
    const list = [];
    const p = state.player;
    const m = state.mapMargin + 80;
    // 2–5 предметов на карту, но не всё сразу у входа
    const count = 2 + Math.floor(Math.random() * 4);
    let tries = 0;
    while (list.length < count && tries < 400) {
      tries++;
      const x = rand(m, state.mapW - m);
      const y = rand(m, state.mapH - m);
      if (p && dist2(x, y, p.x, p.y) < 380 * 380) continue;
      // На стенах ничего не лежит
      if (Game.buildings.solidAt(state, x, y)) continue;
      // Предметы слишком близко друг к другу — раскидываем
      let far = true;
      for (const it of list) {
        if (dist2(x, y, it.x, it.y) < 130 * 130) { far = false; break; }
      }
      if (!far) continue;
      list.push({
        x: x, y: y,
        type: ITEM_POOL[Math.floor(Math.random() * ITEM_POOL.length)],
        taken: false
      });
    }
    state.cellItems[key] = list;
    state.items = list;
  }

  // Ближайший припас рядом с персонажем (для подбора на E и подсказки)
  function nearItem() {
    const pl = state.player;
    if (!pl || !pl.alive || state.invOpen) return null;
    let best = null, bestD = 62 * 62;
    for (const it of state.items) {
      if (it.taken) continue;
      const d = dist2(it.x, it.y, pl.x, pl.y);
      if (d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  function takeItem(it) {
    it.taken = true;
    if (state.inventory.length >= 8) return;
    state.inventory.push(it.type);
    Game.audio.doorClick();
    renderInventory();
  }

  function useItem(slotIndex) {
    const t = state.inventory[slotIndex];
    if (!t) return;
    const def = ITEM_DEFS[t];
    if (def.tier === 'thirst') {
      state.thirst = Math.min(100, state.thirst + def.amount);
      Game.effects.pool.spawn({
        x: state.player.x, y: state.player.y - 30, vx: 0, vy: -20,
        life: 0.9, maxLife: 0.9, friction: 0.9,
        size: 3, color: '#6ecdf5', alpha: 0.9
      });
    } else {
      state.food = Math.min(100, state.food + def.amount);
      Game.effects.pool.spawn({
        x: state.player.x, y: state.player.y - 30, vx: 0, vy: -20,
        life: 0.9, maxLife: 0.9, friction: 0.9,
        size: 3, color: '#f5c65e', alpha: 0.9
      });
    }
    // Еда и вода ещё и лечат: +5 HP
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 5);
    state.inventory.splice(slotIndex, 1);
    renderInventory();
  }

  function toggleInventory() {
    if (state.gameState !== 'playing') return;
    if (state.shopOpen) return; // магазин и инвентарь одновременно не открываются
    if (!state.invOpen) {
      state.invOpen = true;
      renderInventory();
      DOM.invwrap.classList.remove('hidden');
    } else {
      state.invOpen = false;
      state.input.mouseDown = false;
      DOM.invwrap.classList.add('hidden');
    }
  }

  // Отрисовка портрета персонажа и слотов инвентаря
  function renderInventory() {
    const pl = state.player;
    if (pl && pl.drawPortrait) pl.drawPortrait(DOM.invskin, 140);

    const slots = DOM.invslots;
    slots.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const def = ITEM_DEFS[state.inventory[i]];
      const slot = document.createElement('div');
      slot.className = 'inv-slot' + (def ? '' : ' empty');
      slot.dataset.i = i;
      if (def) {
        const cr = Game.assets.itemCrops[state.inventory[i]];
        const img = Game.assets.itemImgs[state.inventory[i]];
        if (img && cr) {
          const im = document.createElement('img');
          im.src = img.src;
          im.alt = def.name;
          slot.appendChild(im);
        }
        const n = document.createElement('div');
        n.className = 'iname';
        n.textContent = def.name.toLowerCase();
        slot.appendChild(n);
        slot.title = def.tier === 'thirst' ? 'Restores ' + def.amount + ' water' : 'Restores ' + def.amount + ' food';
        slot.addEventListener('click', function (e) {
          e.stopPropagation();
          useItem(parseInt(this.dataset.i));
        });
      }
      slots.appendChild(slot);
    }
  }

  // ---- МАГАЗИН И СПАВН ----
  // Стоит ли персонаж у магазина (только на спавн-карте)
  function nearShop() {
    const sh = state.shop;
    if (!sh || state.worldX !== 0 || state.worldY !== 0) return null;
    const pl = state.player;
    if (!pl || !pl.alive || state.shopOpen || state.invOpen) return null;
    const dx = Math.abs(pl.x - sh.x);
    const dy = Math.abs(pl.y - sh.y);
    if (dx <= sh.hw + 60 && dy <= sh.hh + 60) return sh;
    return null;
  }

  function openShop() {
    state.shopOpen = true;
    state.input.enterPressed = false;
    const t = Game.assets.trader;
    const cr = Game.assets.traderCrop;
    if (t && cr) {
      DOM.shopTraderImg.src = t.src;
    } else {
      DOM.shopTraderImg.style.display = 'none';
    }
    setShopTab('buy');
    DOM.shopwrap.classList.remove('hidden');
  }

  function closeShop() {
    state.shopOpen = false;
    DOM.shopwrap.classList.add('hidden');
  }

  // Переключение вкладок: пока всё пусто, но поля под торговлю готовы
  function setShopTab(tab) {
    const tabs = document.querySelectorAll('.shop-tab');
    for (const b of tabs) {
      b.classList.toggle('active', b.dataset.tab === tab);
    }
    const labels = { buy: 'BUY', sell: 'SELL', trade: 'TRADE' };
    DOM.shopBody.innerHTML =
      '<p class="shop-empty">' + (labels[tab] || '') +
      ' — nothing here yet.<br>Trade opens later.</p>';
  }

  // Кнопка СПАВН: включает/отменяет возврат на спавн через 5 секунд
  function toggleSpawnCountdown() {
    if (state.gameState !== 'playing' || state.invOpen || state.shopOpen) return;
    if (state.spawnTp > 0) {
      state.spawnTp = 0;
    } else {
      state.spawnTp = 5;
      Game.audio.doorClick();
    }
    updateSpawnBtn();
  }

  function updateSpawnBtn() {
    DOM.spawnbtn.classList.toggle('counting', state.spawnTp > 0);
    DOM.spawnbtn.textContent = state.spawnTp > 0 ? Math.ceil(state.spawnTp) + ' …' : 'SPAWN';
  }

  // Телепорт на спавн (карта 0,0). heal=true — возрождение после смерти
  function teleportToSpawn(heal) {
    state.worldX = 0;
    state.worldY = 0;
    Game.assets.enterCell(0, 0);
    state.mapW = Game.assets.mapW;
    state.mapH = Game.assets.mapH;
    state.enemies = [];
    state.bullets = [];
    state.doomBullets = [];
    state.grenades = [];
    Game.effects.resetEffects();
    const pl = state.player;
    pl.x = state.mapW / 2;
    pl.y = state.mapH / 2;
    pl.px = pl.x;
    pl.py = pl.y;
    if (heal) {
      pl.hp = pl.maxHp;
      pl.ammo = 6;
      pl.reloading = false;
    }
    pl.alive = true;
    pl.invuln = 2;
    // Машину с собой берём только если едем за рулём
    if (state.vehicle) {
      if (state.vehicle.driving) {
        state.vehicle.cell = Game.assets._curKey;
        state.vehicle.x = pl.x;
        state.vehicle.y = pl.y;
      } else if (state.vehicle.cell !== Game.assets._curKey) {
        state.vehicle.x = -9999;
      }
    }
    state.camX = pl.x - innerWidth / 2;
    state.camY = pl.y - innerHeight / 2;
    state.input.mouseDown = false;
    state.input.enterPressed = false;
    state.input.grenadePressed = false;
    state.input.reloadPressed = false;
    Game.audio.setWalking(false);
    Game.effects.bloodPool(pl.x, pl.y, 30, 40);
    Game.shake(6);
    ensureCellItems();
    DOM.hud.classList.remove('hidden');
  }

  // Магазин на спавн-карте — здание с тенью и вывеской
  function drawShop(g) {
    const sh = state.shop;
    const img = Game.assets.shop;
    if (!sh || !img || state.worldX !== 0 || state.worldY !== 0) return;
    const cr = Game.assets.shopCrop ||
      { x: 0, y: 0, w: img.naturalWidth || 1200, h: img.naturalHeight || 1200 };
    const S = Math.max(sh.hw, sh.hh) * 2;
    const sc = S / Math.max(cr.w, cr.h);
    const w = cr.w * sc, h = cr.h * sc;
    // Тень
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.beginPath();
    g.ellipse(sh.x, sh.y + h * 0.3, w * 0.62, h * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(img, cr.x, cr.y, cr.w, cr.h, sh.x - w / 2, sh.y - h / 2, w, h);
    // Вывеска «SHOP», чтобы здание сразу было видно
    g.font = 'bold 18px Consolas';
    g.textAlign = 'center';
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineWidth = 5;
    g.strokeText('SHOP', sh.x, sh.y - h / 2 - 14);
    g.fillStyle = '#ffe9a8';
    g.fillText('SHOP', sh.x, sh.y - h / 2 - 14);
  }

  // Отрисовка припасов на земле (с лёгким покачиванием)
  function drawGroundItems(g) {
    const t = performance.now() / 1000;
    for (const it of state.items) {
      if (it.taken) continue;
      const def = ITEM_DEFS[it.type];
      const img = Game.assets.itemImgs[it.type];
      if (!img) continue;
      const drop = Math.sin(t * 2 + it.x * 0.05) * 2;
      const bobY = it.y + drop;
      const sc = def.scale || 1;
      const w = 40 * sc;
      const h = w * ((img.naturalHeight || 1) / (img.naturalWidth || 1));
      // Тень
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      g.ellipse(it.x, it.y + 14 * sc + 4, 14 * sc, 5 * sc, 0, 0, Math.PI * 2);
      g.fill();
      g.drawImage(img, it.x - w / 2, bobY - h / 2, w, h);
      // Метка «можно подобрать»
      if (nearItem() === it) {
        g.strokeStyle = 'rgba(205,238,176,0.9)';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(it.x, it.y + 2, 22 * sc + 8, 18 * sc + 6, 0, 0, Math.PI * 2);
        g.stroke();
        const nm = def.name;
        g.font = 'bold 12px Consolas';
        g.fillStyle = 'rgba(205,238,176,0.95)';
        g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.lineWidth = 3;
        g.textAlign = 'center';
        g.strokeText(nm, it.x, it.y - 24);
        g.fillText(nm, it.x, it.y - 24);
      }
    }
  }

  function throwGrenade() {
    const pl = state.player;
    const a = angleTo(pl.x, pl.y, state.input.mx, state.input.my);
    const sp = 620;
    state.grenades.push({
      x: pl.x, y: pl.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      fuse: 3.5,
      rot: rand(0, Math.PI * 2), vr: rand(-6, 6)
    });
    if (state.grenades.length > 8) state.grenades.shift();
  }

  function updateGrenades(dt) {
    for (let i = state.grenades.length - 1; i >= 0; i--) {
      const gr = state.grenades[i];
      gr.x += gr.vx * dt;
      gr.y += gr.vy * dt;
      gr.rot += gr.vr * dt;
      // Сильное торможение — граната катится и встаёт
      gr.vx *= Math.pow(0.00001, dt);
      gr.vy *= Math.pow(0.00001, dt);
      gr.x = clamp(gr.x, 14, state.mapW - 14);
      gr.y = clamp(gr.y, 14, state.mapH - 14);
      gr.fuse -= dt;
      if (gr.fuse <= 0) {
        explodeGrenade(gr.x, gr.y);
        state.grenades.splice(i, 1);
      } else if (Math.random() < 0.35) {
        Game.effects.smoke(gr.x, gr.y);
      }
    }
  }

  // Взрыв: убивает всех зомби в радиусе и откидывает остальных
  function explodeGrenade(x, y) {
    const R = 150;
    Game.audio.boom();
    Game.effects.explosion(x, y);
    Game.shake(16);

    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const en = state.enemies[i];
      if (dist2(en.x, en.y, x, y) < R * R) {
        // Босса граната не убивает с одного раза — снимает 60 HP
        if (en.isBoss()) {
          en.takeDamage(60, angleTo(x, y, en.x, en.y), state);
        } else {
          en.die(angleTo(x, y, en.x, en.y), state);
        }
      }
    }
    // Выживших отбрасывает взрывной волной
    for (const en of state.enemies) {
      const d2 = dist2(en.x, en.y, x, y);
      const maxD = R * 1.8;
      if (d2 < maxD * maxD) {
        const a = angleTo(x, y, en.x, en.y);
        const power = 1 - Math.sqrt(d2) / maxD;
        const bx = clamp(en.x + Math.cos(a) * power * 34, 10, state.mapW - 10);
        const by = clamp(en.y + Math.sin(a) * power * 34, 10, state.mapH - 10);
        // Кикбэк не должен зашвыривать врага сквозь стены
        const cr = Game.buildings.resolve(bx, by, en.radius * 1.55, state, en.x, en.y);
        en.x = cr.x;
        en.y = cr.y;
      }
    }
  }

  function drawGrenades(g) {
    const img = Game.assets.grenade;
    if (!img) return;
    const crop = Game.assets.grenadeCrop || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const s = 19;
    const gh = s * (crop.h / crop.w || 1);
    for (const gr of state.grenades) {
      // Тень
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(gr.x + 2, gr.y + 4, s * 0.5, s * 0.38, 0, 0, Math.PI * 2);
      g.fill();
      // Сама граната
      g.save();
      g.translate(gr.x, gr.y);
      g.rotate(gr.rot);
      g.drawImage(img, crop.x, crop.y, crop.w, crop.h, -s / 2, -gh / 2, s, gh);
      g.restore();
      // Мигает красным перед взрывом
      if (gr.fuse < 1.0 && Math.floor(gr.fuse * 8) % 2 === 0) {
        g.fillStyle = 'rgba(255,70,30,0.95)';
        g.beginPath();
        g.arc(gr.x, gr.y, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function update(dt) {
    // Мёртв: через пару секунд возрождаемся на спавн-карте
    if (state.gameState === 'dead') {
      state.deathTimer -= dt;
      if (state.deathTimer <= 0) {
        teleportToSpawn(true);
        DOM.gameover.classList.add('hidden');
        state.gameState = 'playing';
      }
      return;
    }
    if (state.gameState !== 'playing') return;
    const pl = state.player;
    if (!pl) return;

    // Инвентарь или магазин: мир на паузе, но время продолжает течь
    if (state.invOpen || state.shopOpen) {
      state.time += dt;
      return;
    }

    // ТП на спавн через 5 секунд после нажатия кнопки
    if (state.spawnTp > 0) {
      state.spawnTp -= dt;
      updateSpawnBtn();
      if (state.spawnTp <= 0) {
        state.spawnTp = 0;
        teleportToSpawn(false);
        updateSpawnBtn();
      }
    }

    state.time += dt;

    // Открытый мир: враги приходят "иногда" — в случайные точки карты,
    // толпа и их сила растут со временем
    const cap = Math.min(6 + Math.floor(state.time / 45), 24);
    if (state.enemies.length < cap) {
      state.spawnCd -= dt;
      if (state.spawnCd <= 0) {
        spawnEnemy(pickSpawnType(state.time / 60));
        state.spawnCd = Math.max(1.1, 2.6 - state.time * 0.008);
      }
    }

    if (!state.vehicle || !state.vehicle.driving) pl.update(dt, state);
    // Не проваливаемся в стены (скольжение, позиция ДО движения — своя сторона грани)
    {
      const ppx = typeof pl.px === 'number' ? pl.px : pl.x;
      const ppy = typeof pl.py === 'number' ? pl.py : pl.y;
      const pr = Game.buildings.resolve(pl.x, pl.y, pl.radius * 1.55, state, ppx, ppy);
      pl.x = pr.x;
      pl.y = pr.y;
      pl.px = pl.x;
      pl.py = pl.y;
    }

    // E: сперва магазин, потом припасы, потом машина/дверь
    if (state.input.enterPressed) {
      const shopNear = nearShop();
      if (shopNear) {
        openShop();
        state.input.enterPressed = false;
      }
      const item = nearItem();
      if (!shopNear && item) {
        takeItem(item);
        state.input.enterPressed = false;
      }
      const veh = state.vehicle;
      const nearCar = veh && !veh.driving && pl.alive &&
        Math.abs(veh.speed) < 50 && dist2(pl.x, pl.y, veh.x, veh.y) < 92 * 92;
      if (!nearCar && !item && !shopNear) {
        const door = Game.buildings.nearDoor(state);
        if (door) {
          Game.buildings.toggleDoor(state, door);
          state.input.enterPressed = false;
        }
      }
    }

    // Враги идут за игроком
    for (let i = 0; i < state.enemies.length; i++) {
      const en = state.enemies[i];
      const ox = en.x, oy = en.y;
      en.update(dt, state);
      // Враги не проходят сквозь стены — радиус коллизии берём по размеру
      // спрайта (radius * 2.9 рисуется в ширину), чтобы тело было СНАРУЖИ стены
      const rr = Game.buildings.resolve(en.x, en.y, en.radius * 1.55, state, ox, oy);
      en.x = rr.x;
      en.y = rr.y;
    }

    // Машина: физика, следы шин, выхлоп, снос врагов
    if (state.vehicle && state.vehicle.cell === Game.assets._curKey) Game.vehicleUpdate(dt, state);

    // Гранаты: бросок (ПКМ) и полёт до взрыва
    if (!state.vehicle || !state.vehicle.driving) {
    state.grenadeCd -= dt;
    if (state.input.grenadePressed && state.grenadeCd <= 0 && pl.alive) {
      throwGrenade();
      state.input.grenadePressed = false;
      state.grenadeCd = 0.9;
    }
    updateGrenades(dt);
    }

    // Снаряды думгая
    updateDoomBullets(dt);

    // Пули
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      const px = b.x, py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.px = px; b.py = py;

      const m = state.mapMargin;
      if (b.life <= 0 || b.x < m || b.y < m || b.x > state.mapW - m || b.y > state.mapH - m) {
        state.bullets.splice(i, 1);
        continue;
      }
      // Дробь встречает стену — сноп мелких искр
      if (Game.buildings.solidAt(state, b.x, b.y)) {
        for (let k = 0; k < 3; k++) {
          Game.effects.pool.spawn({
            x: b.x, y: b.y,
            vx: rand(-60, 60), vy: rand(-60, 60),
            life: rand(0.06, 0.15), maxLife: 0.15, friction: 0.8,
            size: rand(0.8, 1.6), color: '#ffd76a', alpha: 0.9
          });
        }
        state.bullets.splice(i, 1);
        continue;
      }
      // Попадание во врага
      for (let j = 0; j < state.enemies.length; j++) {
        const en = state.enemies[j];
        const rr = en.radius + 4;
        if (dist2(b.x, b.y, en.x, en.y) < rr * rr) {
          Game.effects.blood(b.x, b.y, Math.atan2(b.vy, b.vx), 4);
          const died = en.takeDamage(b.damage, Math.atan2(b.vy, b.vx), state);
          b.used = true;
          state.bullets.splice(i, 1);
          if (died) j--;
          break;
        }
      }
    }
    const bulletsAfter = state.bullets.filter(function (b) { return !b.used; });
    state.bullets = bulletsAfter;

    // Контакты врагов с игроком
    if (pl.alive) {
      for (const en of state.enemies) {
        const rr = en.radius + pl.radius;
        if (dist2(en.x, en.y, pl.x, pl.y) < rr * rr) {
          // Лёгкий отталкивающий толчок
          const a = angleTo(en.x, en.y, pl.x, pl.y);
          pl.x += Math.cos(a) * 4;
          pl.y += Math.sin(a) * 4;
          if (en.contactCd <= 0 && pl.contactCd <= 0) {
            en.contactCd = 0.85;
            pl.takeHit(en.dmg);
          }
        }
      }
    }

    // Выживание: жажда и голод убывают, без них умираешь.
    // И жажда, и еда тратятся в 3 раза медленнее.
    state.thirst = Math.max(0, state.thirst - dt * 0.8 / 3);
    state.food = Math.max(0, state.food - dt * 0.5 / 3);
    const starve = (state.thirst <= 0 ? 1.3 : 0) + (state.food <= 0 ? 0.9 : 0);
    if (starve > 0 && pl.alive) {
      pl.hp -= dt * starve;
      if (pl.hp <= 0) {
        pl.hp = 0;
        pl.alive = false;
      }
    }

    // На границе карты — переходим в соседнюю зону мира
    if (pl.x < -26) { pl.x = state.mapW - 80; enterNeighbor(-1, 0); }
    else if (pl.x > state.mapW + 26) { pl.x = 80; enterNeighbor(1, 0); }
    else if (pl.y < -26) { pl.y = state.mapH - 80; enterNeighbor(0, -1); }
    else if (pl.y > state.mapH + 26) { pl.y = 80; enterNeighbor(0, 1); }

    if (!pl.alive) gameOver();

    // Частицы
    Game.effects.updateScorches(dt);
    Game.effects.pool.update(dt);

    // Камера следует за игроком
    const targetX = pl.x - innerWidth / 2;
    const targetY = pl.y - innerHeight / 2;
    const maxCamX = Math.max(state.mapW - innerWidth, 0);
    const maxCamY = Math.max(state.mapH - innerHeight, 0);
    state.camX = clamp(lerp(state.camX, targetX, 0.14), -30, maxCamX + 30);
    state.camY = clamp(lerp(state.camY, targetY, 0.14), -30, maxCamY + 30);

    state.shake *= Math.pow(0.001, dt);

    // Потребляем разовый ввод (E тоже — чтобы не "залипало" между картами/ситуациями)
    state.input.reloadPressed = false;
    state.input.grenadePressed = false;
    state.input.enterPressed = false;

    updateDOM();
  }

  function gameOver() {
    state.gameState = 'dead';
    state.deathTimer = 2.5;
    DOM.goKills.textContent = state.player.kills;
    DOM.goTime.textContent = formatTime(state.time);
    DOM.gameover.classList.remove('hidden');
    DOM.hud.classList.add('hidden');
    Game.audio.growl(0.7);
  }

  // ---- ОТРИСОВКА ----
  // Снаряд думгая: большой светящийся шар с хвостом, медленный, но мощный
  function updateDoomBullets(dt) {
    const pl = state.player;
    for (let i = state.doomBullets.length - 1; i >= 0; i--) {
      const b = state.doomBullets[i];
      const px = b.x, py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.px = px; b.py = py;

      // Искры из хвоста — редкий лёгкий шлейф
      if (Math.random() < 0.4) {
        Game.effects.pool.spawn({
          x: b.x, y: b.y, vx: rand(-14, 14), vy: rand(-14, 14),
          life: rand(0.1, 0.22), maxLife: 0.22, friction: 0.9,
          size: rand(1, 2.2), color: 'rgba(255,190,90,0.8)', alpha: 0.8
        });
      }

      const m = state.mapMargin;
      // Встретила стену (базу) — веером искры
      if (Game.buildings.solidAt(state, b.x, b.y)) {
        const dA = Math.atan2(b.vy, b.vx);
        for (let k = 0; k < 6; k++) {
          const spA = dA + rand(-1, 1);
          Game.effects.pool.spawn({
            x: b.x, y: b.y,
            vx: Math.cos(spA) * rand(60, 180), vy: Math.sin(spA) * rand(60, 180),
            life: rand(0.1, 0.25), maxLife: 0.25, friction: 0.82,
            size: rand(0.8, 1.8), color: Math.random() < 0.5 ? '#ffd76a' : '#ff8a3a', alpha: 0.95
          });
        }
        state.doomBullets.splice(i, 1);
        continue;
      }
      // Пуля исчезает, ударившись о край карты, — веером искры
      if (b.life <= 0 || b.x < m || b.y < m || b.x > state.mapW - m || b.y > state.mapH - m) {
        const dA = Math.atan2(b.vy, b.vx);
        for (let k = 0; k < 7; k++) {
          const spA = dA + rand(-1.1, 1.1);
          Game.effects.pool.spawn({
            x: b.x, y: b.y,
            vx: Math.cos(spA) * rand(60, 200), vy: Math.sin(spA) * rand(60, 200),
            life: rand(0.12, 0.3), maxLife: 0.3, friction: 0.82,
            size: rand(0.8, 1.8), color: Math.random() < 0.5 ? '#ffd76a' : '#ff8a3a', alpha: 0.95
          });
        }
        state.doomBullets.splice(i, 1);
        continue;
      }

      // Попадание в игрока — кровь + искры
      if (pl.alive) {
        const rr = pl.radius + 9;
        if (dist2(b.x, b.y, pl.x, pl.y) < rr * rr) {
          const dmgA = Math.atan2(b.vy, b.vx);
          pl.takeHit(b.damage);
          Game.shake(9);
          Game.effects.blood(b.x, b.y, dmgA, 10);
          for (let k = 0; k < 5; k++) {
            Game.effects.pool.spawn({
              x: b.x, y: b.y,
              vx: Math.cos(dmgA + rand(-0.9, 0.9)) * rand(80, 220), vy: Math.sin(dmgA + rand(-0.9, 0.9)) * rand(80, 220),
              life: rand(0.1, 0.25), maxLife: 0.25, friction: 0.8,
              size: rand(1, 2), color: '#ffd76a', alpha: 1
            });
          }
          state.doomBullets.splice(i, 1);
        }
      }
    }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    if (!Game.assets.mapCache || !state.player) return;

    const shX = state.shake > 0.3 ? rand(-state.shake, state.shake) : 0;
    const shY = state.shake > 0.3 ? rand(-state.shake, state.shake) : 0;

    ctx.save();
    ctx.translate(-(state.camX + shX), -(state.camY + shY));

    // Карта (кешированное полотно)
    ctx.drawImage(Game.assets.mapCache, 0, 0);

    // Магазин на спавн-карте
    drawShop(ctx);

    // Припасы, разбросанные по земле
    drawGroundItems(ctx);

    // Следы взрывов — поверх карты, исчезают через 7 сек
    Game.effects.drawScorches(ctx);

    // Стены, двери и призрак постройки
    Game.buildings.draw(ctx, state);
    if (state.buildMode && state.gameState === 'playing' && state.player.alive &&
        !(state.vehicle && state.vehicle.driving)) {
      const cell = Game.buildings.cellAt(state.input.mx, state.input.my);
      const why = Game.buildings.canPlace(state, cell.x, cell.y, state.mapW, state.mapH);
      const col = why === 'ok' ? 'rgba(120,200,90,0.45)' : 'rgba(230,80,60,0.45)';
      ctx.fillStyle = col;
      ctx.fillRect(cell.x, cell.y, Game.buildings.GRID, Game.buildings.GRID);
      ctx.strokeStyle = why === 'ok' ? 'rgba(180,255,140,0.8)' : 'rgba(255,140,110,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.x + 1, cell.y + 1, Game.buildings.GRID - 2, Game.buildings.GRID - 2);
    }

    // Кляксы уже в кеше; эффекты поверх
    Game.effects.pool.draw(ctx);
    drawGrenades(ctx);
    drawBullets(ctx);
    drawDoomBullets(ctx);
    for (const en of state.enemies) en.draw(ctx);
    if (state.vehicle && state.vehicle.cell === Game.assets._curKey) Game.vehicleDraw(ctx, state);
    // За рулём персонаж не виден
    const driving = state.vehicle && state.vehicle.driving;
    if (state.player.alive && !driving) state.player.draw(ctx);

    ctx.restore();

    drawLowHpOverlay();
  }

  function drawBullets(g) {
    for (const b of state.bullets) {
      const dx = b.x - b.px, dy = b.y - b.py;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      g.save();
      g.globalAlpha = 0.9;
      g.strokeStyle = '#ffe9a8';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(b.px, b.py);
      g.lineTo(b.x + ux * 6, b.y + uy * 6);
      g.stroke();
      g.globalAlpha = 0.35;
      g.strokeStyle = '#ffb52e';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(b.px, b.py);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.restore();
    }
  }

  function drawDoomBullets(g) {
    for (const b of state.doomBullets) {
      const boss = !!b.boss;
      const dx = b.x - b.px, dy = b.y - b.py;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      // Хвост за пулей
      const tx = b.px - ux * 26, ty = b.py - uy * 26;
      g.save();
      g.lineCap = 'round';
      const grad = g.createLinearGradient(tx, ty, b.x, b.y);
      grad.addColorStop(0, 'rgba(255,180,60,0)');
      grad.addColorStop(0.65, boss ? 'rgba(255,120,40,0.7)' : 'rgba(255,190,80,0.7)');
      grad.addColorStop(1, boss ? '#ff6a2a' : '#ffd76a');
      g.strokeStyle = grad;
      g.lineWidth = boss ? 3.5 : 3;
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(b.x, b.y);
      g.stroke();
      // Голова пули — тонкое светящееся пятно
      g.globalAlpha = 0.35;
      g.fillStyle = boss ? '#ff4a1a' : '#ffc84a';
      g.beginPath();
      g.arc(b.x, b.y, 6, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.95;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(b.x + ux * 2, b.y + uy * 2, 2.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  function drawLowHpOverlay() {
    const pl = state.player;
    if (!pl || !pl.alive || pl.hp / pl.maxHp > 0.3) return;
    const a = (1 - pl.hp / pl.maxHp) * 0.35;
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() * 0.005);
    ctx.fillStyle = 'rgba(160,20,10,' + (a * pulse).toFixed(3) + ')';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
  }

  // ---- HUD ----
  function updateDOM() {
    const pl = state.player;
    const hp = Math.max(0, Math.ceil(pl.hp));
    DOM.hpnum.textContent = hp;
    DOM.hpfill.style.width = (pl.hp / pl.maxHp * 100) + '%';
    DOM.hpfill.classList.toggle('low', pl.hp / pl.maxHp <= 0.3);
    // Статы выживания
    DOM.sf.hp.textContent = hp;
    DOM.sf.thirst.textContent = Math.ceil(state.thirst);
    DOM.sf.thirstfill.style.width = state.thirst + '%';
    DOM.sf.thirstfill.classList.toggle('low', state.thirst <= 0);
    DOM.sf.food.textContent = Math.ceil(state.food);
    DOM.sf.foodfill.style.width = state.food + '%';
    DOM.sf.foodfill.classList.toggle('low', state.food <= 0);
    DOM.sf.rad.textContent = Math.ceil(state.rad);
    DOM.sf.radfill.style.width = Math.min(100, state.rad) + '%';
    DOM.timenum.textContent = formatTime(state.time);
    DOM.killnum.textContent = (state.kills || 0);
    DOM.ammonum.textContent = pl.ammo;
    // Зона мира (видно, что карта сменилась)
    let zoneName = 'ZONE ' + state.worldX + ':' + state.worldY;
    if (Game.assets._zoneName) zoneName = Game.assets._zoneName(state.worldX, state.worldY) +
      '  ' + state.worldX + ':' + state.worldY;
    DOM.zoneid.classList.toggle('hidden', !state.worldX && !state.worldY);
    DOM.zoneid.textContent = zoneName;
    // Изменить: в конец строки
    DOM.reloadtip.classList.toggle('hidden', !pl.reloading);
    if (pl.reloading) {
      const pct = 1 - pl.reloadTimer / 1.45;
      DOM.reloadtip.textContent = 'RELOADING ' + Math.round(pct * 100) + '%';
    }

    // Полоска HP босса
    let boss = null;
    for (const en of state.enemies) {
      if (en.type === 'boss') { boss = en; break; }
    }
    DOM.bossbarWrap.classList.toggle('hidden', !boss);
    if (boss) {
      DOM.bossfill.style.width = clamp(boss.hp / boss.maxHp, 0, 1) * 100 + '%';
    }
  }

  // ---- ЦИКЛ ----
  let lastT = performance.now();
  function loop(t) {
    const dt = clamp((t - lastT) / 1000, 0, 0.05);
    lastT = t;
    update(dt);
    draw();
    // Подсказка возле машины / двери / режим стройки
    const bldMode = state.buildMode && state.gameState === 'playing';
    DOM.buildhint.classList.toggle('hidden', !bldMode);
    if (bldMode) {
      const names = { board: 'BOARD', stone: 'STONE', door: 'DOOR' };
      DOM.buildhint.innerHTML = 'BUILD: <b>' + (names[state.buildMaterial] || 'BOARD') +
        '</b> &nbsp;| LMB — place &nbsp;| RMB — remove &nbsp;| 1/2/3 — material &nbsp;| F — exit';
    }
    let hint = bldMode ? null : Game.vehicleHint(state);
    if (!hint && !bldMode) {
      const shopNear = nearShop();
      if (shopNear && !(state.vehicle && state.vehicle.driving)) {
        hint = 'E — shop';
      } else {
        const item = nearItem();
        if (item && !(state.vehicle && state.vehicle.driving)) {
          hint = 'E — pick up ' + ITEM_DEFS[item.type].name.toLowerCase();
        } else {
          const d = Game.buildings.nearDoor(state);
          if (d && !(state.vehicle && state.vehicle.driving)) {
            hint = 'E — ' + (d.open ? 'close' : 'open') + ' door';
          }
        }
      }
    }
    DOM.carhint.classList.toggle('hidden', !hint);
    if (hint) DOM.carhint.textContent = hint;
    // Скрытие подсказки громкости (работает и в меню)
    if (volHintT > 0) {
      volHintT -= dt;
      if (volHintT <= 0) DOM.volhint.classList.add('hidden');
    }
    requestAnimationFrame(loop);
  }

  // ---- СТАРТ ----
  function boot() {
    Game.loadAssets()
      .then(function (assets) {
        DOM.loading.classList.add('hidden');
        debugg('УТИЛИТА', 'Карта ' + assets.mapW + 'x' + assets.mapH + ' загружена');
        DOM.menu.classList.remove('hidden');
        state.gameState = 'menu';
      })
      .catch(function (err) {
        debugg('ОШИБКА', err.message);
        // Продолжаем без ассетов — персонаж и монстры рисуются процедурно
        makeFallbackMap();
        DOM.loading.classList.add('hidden');
        DOM.menu.classList.remove('hidden');
        state.gameState = 'menu';
      });
  }

  function makeFallbackMap() {
    const c = document.createElement('canvas');
    c.width = c.height = 1000;
    const g = c.getContext('2d');
    g.fillStyle = '#3c4426';
    g.fillRect(0, 0, 1000, 1000);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = 'rgba(255,255,255,' + rand(0.02, 0.05) + ')';
      g.fillRect(rand(0, 1000), rand(0, 1000), rand(20, 60), rand(20, 60));
    }
    g.strokeStyle = 'rgba(200,210,120,0.35)';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 990, 990);
    Game.assets.mapCache = c;
    Game.assets.mapW = Game.assets.mapH = 1000;
  }

  document.getElementById('startbtn').addEventListener('click', newGame);
  document.getElementById('restartbtn').addEventListener('click', newGame);

  Game.state = state;
  boot();
  requestAnimationFrame(loop);
})();