// Загрузка ассетов и кеш карты
(function () {
  const assets = {
    map: null,
    shotgun: null,
    zombie: null,
    doom: null,
    boss: null,
    grenade: null,
    car: null,
    shotgunCrop: null,
    zombieCrop: null,
    doomCrop: null,
    grenadeCrop: null,
    carSprite: null,
    carOutline: null,
    itemImgs: {},
    itemCrops: {},
    hero: null,
    heroCrop: null,
    shop: null,
    shopCrop: null,
    trader: null,
    traderCrop: null,
    bossWalk: [],    // кадры бега (ряд 0)
    bossShoot: [],   // кадры стрельбы (ряд 3)
    bossWalkOutline: [],
    bossShootOutline: [],
    ready: false
  };

  const mapCache = document.createElement('canvas');
  // Мир: каждая картинка — ячейка (worldX,worldY). Пустые ячейки — процедурные.
  const worldImgs = {};
  const mapCaches = {};
  const cellKey = function (wx, wy) { return wx + ',' + wy; };

  function bakeCanvas(mapImg) {
    const iw = mapImg.naturalWidth || mapImg.width;
    const ih = mapImg.naturalHeight || mapImg.height;
    // Карта не должна быть меньше экрана, иначе справа/снизу будет пустота.
    // Растягиваем холст до размера окна, картинку — режимом "cover".
    const w = Math.max(iw, window.innerWidth || 1920);
    const h = Math.max(ih, window.innerHeight || 1080);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    g.drawImage(mapImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,210,120,0.35)';
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    return c;
  }

  // Процедурная заготовка для ячеек без картинки — мир бесконечный
  function makeProceduralCell() {
    const cc = document.createElement('canvas');
    cc.width = Math.max(1500, window.innerWidth || 1920);
    cc.height = Math.max(1100, window.innerHeight || 1080);
    const w = cc.width, h = cc.height;
    const g = cc.getContext('2d');
    g.fillStyle = '#3c4426';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.02 + Math.random() * 0.05) + ')';
      g.fillRect(rand(0, w), rand(0, h), rand(20, 70), rand(20, 70));
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(30,26,18,' + (0.12 + Math.random() * 0.15) + ')';
      g.beginPath();
      g.ellipse(rand(0, w), rand(0, h), rand(40, 130), rand(30, 90), rand(0, Math.PI), 0, Math.PI * 2);
      g.fill();
    }
    return cc;
  }

  // Переключение на ячейку мира: вернёт её полотно (создаст при первом заходе)
  function enterCell(wx, wy) {
    const key = cellKey(wx, wy);
    assets._curKey = key;
    if (!mapCaches[key]) {
      const img = worldImgs[key];
      console.log('[MAP] cell', key, 'img?', !!img, 'keys:', Object.keys(worldImgs).join(','));
      mapCaches[key] = img ? bakeCanvas(img) : makeProceduralCell();
    }
    assets.mapCache = mapCaches[key];
    assets.mapW = assets.mapCache.width;
    assets.mapH = assets.mapCache.height;
    return assets.mapCache;
  }

  // Пересобрать все кеши с нуля (сброс клякс после смерти/новой игры) — старые оставляем
  function resetWorldCaches() {
    // Текущую ячейку перепекаем начисто из исходника
    if (Game.assets && Game.assets._curKey && worldImgs[Game.assets._curKey]) {
      mapCaches[Game.assets._curKey] = bakeCanvas(worldImgs[Game.assets._curKey]);
      assets.mapCache = mapCaches[Game.assets._curKey];
      assets.mapW = assets.mapCache.width;
      assets.mapH = assets.mapCache.height;
    }
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Failed to load: ' + src)); };
      img.src = src;
    });
  }

  // Карта (webp от игрока) рендерится один раз в фоновое полотно — быстро
  function cacheMap(mapImg) {
    const w = mapImg.naturalWidth || mapImg.width;
    const h = mapImg.naturalHeight || mapImg.height;
    mapCache.width = w;
    mapCache.height = h;
    const g = mapCache.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(mapImg, 0, 0);
    assets.mapW = w;
    assets.mapH = h;
    assets.mapCache = mapCache;

    // Лёгкая тёмная виньетка по краям карты, чтобы игрок понимал границы
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    // Граница карты
    g.strokeStyle = 'rgba(200,210,120,0.35)';
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
  }

  // Обрезаем пустые поля вокруг спрайта оружия (прозрачные или белые),
  // чтобы дробовик был крупным и точка хвата совпадала с картинкой
  function tightCrop(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    let data;
    try {
      data = g.getImageData(0, 0, w, h).data;
    } catch (e) {
      return { x: 0, y: 0, w: w, h: h };
    }
    const hasAlpha = (function () {
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) return true;
      }
      return false;
    })();

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i], gg = data[i + 1], b = data[i + 2], a = data[i + 3];
        let visible;
        if (hasAlpha) {
          visible = a > 40;
        } else {
          // Фото на белом фоне: "видимы" не-белые пиксели
          visible = !(r > 230 && gg > 230 && b > 230);
        }
        if (visible) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { x: 0, y: 0, w: w, h: h };
    // Небольшой запас вокруг спрайта
    const pad = Math.max(2, Math.round(Math.min(w, h) * 0.01));
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  // Тёмно-красный силуэт спрайта — рисуется со смещениями как обводка,
  // чтобы зомби читался на любом фоне карты
  function makeSilhouette(img, crop) {
    const c = document.createElement('canvas');
    c.width = crop.w;
    c.height = crop.h;
    const g = c.getContext('2d');
    g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    g.globalCompositeOperation = 'source-in';
    g.globalAlpha = 0.95;
    g.fillStyle = '#4a0804';
    g.fillRect(0, 0, crop.w, crop.h);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    return c;
  }

  // Обрезаем кадр из спрайт-листа по области и убираем пустые поля
  function clipFrame(img, sx, sy, sw, sh) {
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const g = c.getContext('2d');
    g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    let data;
    let crop = { x: 0, y: 0, w: sw, h: sh };
    try {
      data = g.getImageData(0, 0, sw, sh).data;
      let minX = sw, minY = sh, maxX = -1, maxY = -1;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (data[(y * sw + x) * 4 + 3] > 40) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= 0) crop = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } catch (e) { /* пусть останется вся область */ }
    const out = document.createElement('canvas');
    out.width = crop.w; out.height = crop.h;
    out.getContext('2d').drawImage(c, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    return out;
  }

  // Тёмно-красный силуэт кадра (для обводки босса на тёмной карте)
  function makeSilhouetteCanvas(srcCanvas) {
    const c = document.createElement('canvas');
    c.width = srcCanvas.width;
    c.height = srcCanvas.height;
    const g = c.getContext('2d');
    g.drawImage(srcCanvas, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.globalAlpha = 0.95;
    g.fillStyle = '#3a0603';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    return c;
  }

  // Машина: исходная картинка вертикальная (длинная ось по Y).
// Поворачиваем на 90°, чтобы капот лёг вдоль горизонтали, и обрезаем поля.
// Нос машины в готовом спрайте смотрит вправо (на +x).
function prepareCar(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const rot = document.createElement('canvas');
  rot.width = h;
  rot.height = w;
  const g = rot.getContext('2d');
  g.translate(rot.width / 2, rot.height / 2);
  g.rotate(Math.PI / 2);
  g.drawImage(img, -w / 2, -h / 2);
  const crop = tightCrop(rot);
  const sprite = document.createElement('canvas');
  sprite.width = crop.w;
  sprite.height = crop.h;
  sprite.getContext('2d').drawImage(rot, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  return sprite;
}

function load() {
    // ВНИМАНИЕ: в папке игрока имена перепутаны местами:
    //  - дробовик.jpg — это НАСТОЯЩАЯ карта (3000x2200)
    //  - карта.webp    — это спрайт дробовика (маленький файл)
    const map2 = loadImage('assets/map2.webp').catch(function () { return null; });
    const map3 = loadImage('assets/map3.jpg').catch(function () { return null; });
    const map4 = loadImage('assets/map4.jpg').catch(function () { return null; });
    // Припасы: вода и еда для выживания
    const water = loadImage('assets/water.png').catch(function () { return null; });
    const foodSgush = loadImage('assets/food_sgushchenka.png').catch(function () { return null; });
    const foodGoroh = loadImage('assets/food_goroh.png').catch(function () { return null; });
    const foodKon = loadImage('assets/food_konserva.png').catch(function () { return null; });
    // Главный герой — картинка игрока (персонаж)
    const hero = loadImage('assets/hero.png').catch(function () { return null; });
    // Магазин и продавец
    const shop = loadImage('assets/shop.png').catch(function () { return null; });
    const trader = loadImage('assets/trader.png').catch(function () { return null; });
    return Promise.all([
      loadImage('assets/shotgun.jpg'),  // настоящая карта
      loadImage('assets/map.webp'),     // спрайт дробовика
      loadImage('assets/zombie.webp'),  // модель зомби
      loadImage('assets/doom.png'),     // думгай (с пушкой)
      loadImage('assets/boss.png'),     // босс-солдат (спрайт-лист 9x5)
      loadImage('assets/grenade.png'),  // граната
      loadImage('assets/car.png').catch(function () { return null; }), // машина (не блокирует игру)
      map2, map3, map4,
      water, foodSgush, foodGoroh, foodKon,
      hero, shop, trader
    ])
      .then(function (imgs) {
        assets.map = imgs[0];
        assets.shotgun = imgs[1];
        assets.zombie = imgs[2];
        assets.doom = imgs[3];
        assets.boss = imgs[4];
        assets.grenade = imgs[5];
        assets.car = imgs[6] || null;
        if (assets.car) {
          assets.carSprite = prepareCar(assets.car);
          assets.carOutline = makeSilhouetteCanvas(assets.carSprite);
        }
        assets.shotgunCrop = tightCrop(imgs[1]);
        assets.zombieCrop = tightCrop(imgs[2]);
        assets.doomCrop = tightCrop(imgs[3]);
        assets.grenadeCrop = tightCrop(imgs[5]);
        // Припасы: вода и еда (индексы 10..13)
        assets.itemImgs = {
          water: imgs[10],
          sgushchenka: imgs[11],
          goroh: imgs[12],
          konserva: imgs[13]
        };
        assets.itemCrops = {
          water: imgs[10] ? tightCrop(imgs[10]) : null,
          sgushchenka: imgs[11] ? tightCrop(imgs[11]) : null,
          goroh: imgs[12] ? tightCrop(imgs[12]) : null,
          konserva: imgs[13] ? tightCrop(imgs[13]) : null
        };
        // Персонаж игрока
        assets.hero = imgs[14];
        assets.heroCrop = imgs[14] ? tightCrop(imgs[14]) : null;
        // Магазин (здание на спавне) и продавец (портрет в меню)
        assets.shop = imgs[15];
        assets.shopCrop = imgs[15] ? tightCrop(imgs[15]) : null;
        assets.trader = imgs[16];
        assets.traderCrop = imgs[16] ? tightCrop(imgs[16]) : null;
        console.log('[HERO] loaded:', !!imgs[14], '| shop:', !!imgs[15], '| trader:', !!imgs[16]);
assets.zombieOutline = makeSilhouette(imgs[2], assets.zombieCrop);
        assets.doomOutline = makeSilhouette(imgs[3], assets.doomCrop);
        // Кадры босса из спрайт-листа: сетка 9 колонок x 5 рядов
        const bw = Math.floor(imgs[4].naturalWidth / 9);
        const bh = Math.floor(imgs[4].naturalHeight / 5);
        assets.bossWalk = [];
        assets.bossShoot = [];
        assets.bossWalkOutline = [];
        assets.bossShootOutline = [];
        for (let i = 0; i < 9; i++) {
          const cell = clipFrame(imgs[4], i * bw, 0, bw, bh);
          assets.bossWalk.push(cell);
          assets.bossWalkOutline.push(makeSilhouetteCanvas(cell));
        }
        for (let i = 0; i < 5; i++) {
          const cell = clipFrame(imgs[4], i * bw, 3 * bh, bw, bh);
          assets.bossShoot.push(cell);
          assets.bossShootOutline.push(makeSilhouetteCanvas(cell));
        }
        cacheMap(imgs[0]);
        // Карты мира: (0,0) — основная. Остальные занятых зоны — твои картинки
        // по кругу (восток: map2,map3,map4, потом снова map2...), на север/юг/запад
        // и диагонали тоже подключаем землю, чтобы не было пустых "зелёных" зон.
        worldImgs['0,0'] = imgs[0];
        const heroes = [imgs[7], imgs[8], imgs[9], imgs[7], imgs[8], imgs[9], imgs[7], imgs[8]]; // 2,3,4,2,3,4,2,3
        const cells = ['1,0','2,0','3,0','4,0','5,0','-1,0','0,1','0,-1','1,1','-1,1','1,-1','-1,-1','2,1','2,-1'];
        for (let ci = 0; ci < cells.length; ci++) {
          const h = heroes[ci % heroes.length];
          if (h) worldImgs[cells[ci]] = h;
        }
        console.log('[MAP] worldImgs cells:', Object.keys(worldImgs).join(', '),
          '| imgs7 type:', typeof imgs[7], '| imgs8 type:', typeof imgs[8], '| imgs9 type:', typeof imgs[9]);
        assets._zoneName = function (wx, wy) {
          if (wx === 0 && wy === 0) return 'MAP 1';
          if (wx >= 1 && wx <= 3 && wy === 0) return 'MAP ' + (wx + 1);
          return 'MAP …';
        };
        assets.enterCell = enterCell;
        assets.resetWorldCaches = resetWorldCaches;
        assets.ensureCellCanvas = function (wx, wy) { return enterCell(wx, wy); };
            assets.ready = true;
            // Звуки игрока — не блокируют старт, при ошибке останутся процедурные
            Game.audio.loadSample('shot', 'assets/shot.mp3');
            Game.audio.loadSample('walk', 'assets/walk.mp3');
            Game.audio.loadSample('music', 'assets/music.mp3');
            return assets;
      });
  }

  Game.assets = assets;
  Game.cacheMap = cacheMap;
  Game.loadAssets = load;
})();