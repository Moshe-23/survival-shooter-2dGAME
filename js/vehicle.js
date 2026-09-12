// Машина (тачка): физика, следы шин, выхлоп, снос врагов
(function () {
  const MAX_SPEED = 350;
  const REV_MAX = 135;
  const ACC_F = 280;
  const ACC_R = 170;
  const COAST = 52;
  const BRAKE = 420;
  // Фото машины на исходнике смотрит «носом вниз». При повороте нос уходит влево —
  // зеркалим спрайт, чтобы ехать носом вперёд (+x).
  const CAR_FLIP = true;

  // Ставим машину на карту — подальше от игрока
  function create(px, py, mapW, mapH) {
    const sprite = Game.assets.carSprite;
    let len = 155;
    let ratio = 0.5; // высота спрайта / длина (по умолчанию для процедурной)
    if (sprite) {
      len = 155;
      ratio = sprite.height / sprite.width;
    }
    const a = rand(0, Math.PI * 2);
    const dist = rand(480, 820);
    let x = clamp(px + Math.cos(a) * dist, 110, mapW - 110);
    let y = clamp(py + Math.sin(a) * dist, 110, mapH - 110);
    return {
      x: x, y: y,
      angle: rand(0, Math.PI * 2),
      speed: 0,
      driving: false,
      engineOn: false,
      len: len,
      width: Math.max(30, len * ratio),
      spriteRatio: ratio,
      radius: len * 0.42,
      tracks: [],
      smokeT: 0,
      wob: 0
    };
  }

  function spawnTrack(veh, off, perp) {
    if (veh.tracks.length > 700) veh.tracks.shift();
    veh.tracks.push({
      x: off.x + perp.x,
      y: off.y + perp.y,
      ang: veh.angle,
      life: rand(1.8, 2.6),
      maxLife: 2.6
    });
  }

  function update(dt, state) {
    const veh = state.vehicle;
    if (!veh) return;
    const pl = state.player;
    const keys = state.input.keys;

    // Вход и выход из машины
    if (state.input.enterPressed) {
      state.input.enterPressed = false;
      if (!veh.driving && pl.alive && Math.abs(veh.speed) < 50 &&
          dist2(pl.x, pl.y, veh.x, veh.y) < 92 * 92) {
        enterCar(veh, pl);
      } else if (veh.driving) {
        exitCar(veh, pl, state);
      }
    }

    // Если игрок умер за рулём — высаживаем
    if (!pl.alive && veh.driving) exitCar(veh, pl, state);

    if (veh.driving) {
      // ---- Управление WASD ----
      const gas = keys['KeyW'] || keys['ArrowUp'] ? 1 : (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0);
      // D — вправо (угол растёт), A — влево (угол падает)
      const steerIn = ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0) - ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0);

      if (gas > 0) veh.speed += ACC_F * dt;
      else if (gas < 0) {
        if (veh.speed > 5) veh.speed -= BRAKE * dt;   // торможение
        else veh.speed -= ACC_R * dt;                 // задний ход
      } else {
        // катимся — трение
        if (Math.abs(veh.speed) < COAST * dt) veh.speed = 0;
        else veh.speed -= Math.sign(veh.speed) * COAST * dt;
      }
      veh.speed = clamp(veh.speed, -REV_MAX, MAX_SPEED);

      // Поворот: зависит от скорости, при заднем ходе — зеркально
      const turnScale = clamp(Math.abs(veh.speed) / MAX_SPEED + 0.05, 0, 1);
      const dirSign = veh.speed >= 0 ? 1 : -1;
      veh.angle += steerIn * 2.7 * turnScale * dirSign * dt;

      // Двигаемся вперёд по курсу
      veh.x += Math.cos(veh.angle) * veh.speed * dt;
      veh.y += Math.sin(veh.angle) * veh.speed * dt;

      // Столкновение с границей зоны мира: за ней — следующая карта,
      // так что край не блокирует, а переход обрабатывается в main
      veh.x = clamp(veh.x, -28, state.mapW + 28);
      veh.y = clamp(veh.y, -28, state.mapH + 28);
      // Если упёрлись в жёсткий предел — пыль, но без разворота
      const hard = veh.x <= -28 || veh.x >= state.mapW + 28 || veh.y <= -28 || veh.y >= state.mapH + 28;
      if (hard && Math.abs(veh.speed) > 80) {
        Game.shake(3);
        for (let k = 0; k < 4; k++) {
          Game.effects.pool.spawn({
            x: veh.x + rand(-6, 6), y: veh.y + rand(-6, 6),
            vx: -Math.cos(veh.angle) * rand(20, 90),
            vy: -Math.sin(veh.angle) * rand(20, 90),
            life: rand(0.2, 0.4), maxLife: 0.4, friction: 0.85,
            size: rand(3, 6), color: 'rgba(120,120,115,0.5)', alpha: 0.5
          });
        }
      }

      // База / стены останавливают машину (своя сторона грани)
      {
        const vpx = typeof veh.px === 'number' ? veh.px : veh.x;
        const vpy = typeof veh.py === 'number' ? veh.py : veh.y;
        const cr = Game.buildings.resolve(veh.x, veh.y, veh.radius * 0.55, state, vpx, vpy);
        veh.x = cr.x;
        veh.y = cr.y;
        veh.px = veh.x;
        veh.py = veh.y;
      }

      // Двигатель: обороты по газу и скорости
      const throttle = gas > 0 ? 1 : (gas < 0 ? 0.45 : 0);
      Game.audio.updateCarEngine(throttle, Math.abs(veh.speed) / MAX_SPEED);

      // Следы шин от задних колёс
      const backA = veh.angle + Math.PI;
      const bx = Math.cos(backA), by = Math.sin(backA);
      const px = Math.cos(veh.angle), py = Math.sin(veh.angle);
      const halfW = veh.width * 0.42;
      const backOff = veh.len * 0.38;
      if (Math.abs(veh.speed) > 70) {
        const c1 = { x: veh.x + bx * backOff, y: veh.y + by * backOff };
        const l = { x: -py * halfW, y: px * halfW };
        spawnTrack(veh, c1, l);
        spawnTrack(veh, c1, { x: -l.x, y: -l.y });
      }

      // Выхлоп — серые клубы позади, активнее при разгоне
      veh.smokeT -= dt;
      if (veh.smokeT <= 0 && (Math.abs(veh.speed) > 20 || gas !== 0)) {
        veh.smokeT = 0.06;
        const back = { x: veh.x - bx * backOff, y: veh.y - by * backOff };
        Game.effects.pool.spawn({
          x: back.x + rand(-3, 3), y: back.y + rand(-3, 3),
          vx: -Math.cos(veh.angle) * rand(30, 70) + rand(-18, 18),
          vy: -Math.sin(veh.angle) * rand(30, 70) + rand(-18, 18),
          life: rand(0.35, 0.7), maxLife: 0.7, friction: 0.92,
          size: rand(4, 9), color: 'rgba(150,150,155,0.4)', alpha: 0.4
        });
      }

      // Покачивание корпуса при езде
      veh.wob += dt * (6 + Math.abs(veh.speed) / MAX_SPEED * 14);
      veh.x -= Math.sin(veh.wob) * Math.abs(veh.speed) * dt * 0.02; // лёгкая вибрация
    } else {
      // Стоит: разгон затухает, если кто-то толкнул
      if (Math.abs(veh.speed) < COAST * dt) veh.speed = 0;
      else veh.speed -= Math.sign(veh.speed) * COAST * dt;
      veh.x += Math.cos(veh.angle) * veh.speed * dt;
      veh.y += Math.sin(veh.angle) * veh.speed * dt;
    }

    // ---- Снос врагов ----
    if (Math.abs(veh.speed) > 40) {
      const dirA = veh.speed >= 0 ? veh.angle : veh.angle + Math.PI;
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const en = state.enemies[i];
        const rr = en.radius + veh.radius * 0.9;
        if (dist2(en.x, en.y, veh.x, veh.y) < rr * rr && (en.ramCd || 0) <= 0) {
          en.ramCd = 0.5;
          Game.shake(6);
          Game.effects.blood(en.x, en.y, dirA + rand(-0.3, 0.3), 12);
          if (en.isBoss()) {
            en.takeDamage(120, dirA, state);
            en.x += Math.cos(dirA) * 50;
            en.y += Math.sin(dirA) * 50;
          } else {
            en.die(dirA, state);
          }
        }
      }
    }

    // Следы стираются со временем
    for (let i = veh.tracks.length - 1; i >= 0; i--) {
      veh.tracks[i].life -= dt;
      if (veh.tracks[i].life <= 0) veh.tracks.splice(i, 1);
    }

    // Синхронизация: игрок "сидит" в машине
    if (veh.driving) {
      pl.x = veh.x;
      pl.y = veh.y;
    }
  }

  function enterCar(veh, pl) {
    veh.driving = true;
    veh.engineOn = true;
    pl.x = veh.x;
    pl.y = veh.y;
    Game.audio.carStart();
  }

  function exitCar(veh, pl, state) {
    veh.driving = false;
    veh.engineOn = false;
    Game.audio.stopCarEngine();
    // Выходим слева от машины
    const sideA = veh.angle + Math.PI / 2;
    pl.x = clamp(veh.x + Math.cos(sideA) * veh.width * 0.55, 20, state.mapW - 20);
    pl.y = clamp(veh.y + Math.sin(sideA) * veh.width * 0.55, 20, state.mapH - 20);
  }

  // Рисуем следы под машиной и саму машину
  function draw(g, state) {
    const veh = state.vehicle;
    if (!veh) return;

    // Следы шин (исчезают)
    g.lineCap = 'round';
    for (const t of veh.tracks) {
      const a = clamp(t.life / t.maxLife, 0, 1) * 0.4;
      const s = 3 * a;
      g.strokeStyle = 'rgba(25,25,22,' + a.toFixed(2) + ')';
      g.lineWidth = 3 + s;
      g.beginPath();
      g.moveTo(t.x, t.y);
      g.lineTo(t.x + Math.cos(t.ang) * (8 + s * 4), t.y + Math.sin(t.ang) * (8 + s * 4));
      g.stroke();
    }

    const sprite = Game.assets.carSprite;
    const out = Game.assets.carOutline;
    const len = veh.len;
    const h = veh.spriteRatio ? len * veh.spriteRatio : len * 0.5;

    g.save();
    g.translate(veh.x, veh.y);
    g.rotate(veh.angle);
    if (veh.driving) {
      const bob = Math.sin(veh.wob) * (0.8 + Math.abs(veh.speed) / MAX_SPEED * 2);
      g.translate(bob * 0.4, bob * 0.15);
    }

    // Тень
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(0, 4, Math.max(len * 0.5, 44), Math.max(veh.width * 0.46, 22), 0, 0, Math.PI * 2);
    g.fill();

    if (sprite) {
      // Зеркалим, чтобы капот смотрел вперёд (+x)
      if (CAR_FLIP) g.scale(-1, 1);
      // Тёмная подложка для читаемости на любом фоне
      if (out) g.drawImage(out, -len / 2 + 2, -h / 2 + 2, len, h);
      g.drawImage(sprite, -len / 2, -h / 2, len, h);
    } else {
      // Запасной вариант — нарисованная машина
      g.fillStyle = '#5a6b46';
      g.beginPath();
      g.ellipse(0, 0, len * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3c4826';
      g.fillRect(-len * 0.06, -h * 0.42, len * 0.12, h * 0.84);
      g.fillStyle = 'rgba(200,220,150,0.8)';
      g.fillRect(-len * 0.08, -h * 0.35, len * 0.16, h * 0.2);
      g.fillRect(-len * 0.08, h * 0.15, len * 0.16, h * 0.2);
    }
    g.restore();
  }

  // Текст подсказки возле машины
  function hint(state) {
    const veh = state.vehicle;
    if (!veh || state.gameState !== 'playing') return null;
    const pl = state.player;
    if (veh.driving && pl.alive) return 'E — exit vehicle';
    if (!veh.driving && pl.alive && Math.abs(veh.speed) < 50 &&
        dist2(pl.x, pl.y, veh.x, veh.y) < 95 * 95) return 'E — enter vehicle';
    return null;
  }

  Game.vehicleCreate = create;
  Game.vehicleUpdate = update;
  Game.vehicleDraw = draw;
  Game.vehicleHint = hint;
})();