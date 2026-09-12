// Враги: зомби (1 выстрел = труп), думгай (2 выстрела) и босс-солдат (10 выстрелов).
// Спрайты нарисованы "лицом к камере", поэтому НЕ поворачиваются по земле —
// иначе выглядят перевёрнутыми. Игрок всегда видит их морду.
// Думгай — тот же зомби, но с оружием в руках.
(function () {
  const TYPES = {
    walker: { hp: 26,  speed: 90,  radius: 22, dmg: 10, score: 12, sprite: 'zombie', aggro: 520 },
    runner: { hp: 20,  speed: 165, radius: 15, dmg: 8,  score: 18, sprite: 'zombie', aggro: 430 },
    brute:  { hp: 45,  speed: 55,  radius: 34, dmg: 18, score: 80, sprite: 'zombie', aggro: 480 },
    doom:   { hp: 90, speed: 120, radius: 20, dmg: 16, score: 100, sprite: 'doom', aggro: 560 },
    boss:   { hp: 700, speed: 220, radius: 26, dmg: 25, score: 750, sprite: 'boss', aggro: 9999 }
  };

  function Enemy(type, x, y, waveScale) {
    const t = TYPES[type];
    this.type = type;
    this.x = x;
    this.y = y;
    this.radius = t.radius;
    this.aggro = t.aggro;
    this.baseSpeed = t.speed * (1 + (waveScale || 0) * 0.1);
    this.speed = this.baseSpeed;
    this.dmg = t.dmg;
    // Здоровье тоже растёт со временем мира
    this.maxHp = t.hp * (1 + 0.35 * (waveScale || 0));
    this.hp = this.maxHp;
    this.score = t.score;
    this.angle = rand(0, Math.PI * 2);
    this.anim = rand(0, 6);
    this.hitFlash = 0;
    this.contactCd = 0;
    this.ramCd = 0; // кулдаун тарана машиной
    this.spawnT = 0;
    this.wobble = rand(0.4, 0.9);
    this.dx = 0; this.dy = 0;
    // Свободный мир: враги бродят по карте, пока не учуют игрока
    this.wanderT = rand(0, 2);
    this.wanderA = rand(0, Math.PI * 2);
    this.stopped = false;
    // Память о замеченном игроке
    this.awareT = 0;
    this.lx = 0;
    this.ly = 0;

    // Думгай: орбита вокруг игрока и стрельба
    this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.orbitAngle = rand(0, Math.PI * 2);
    this.orbitRadius = rand(240, 300);
    this.fireCd = rand(0.5, 1.2);

    // Босс: бег к игроку + очереди пуль
    this.firingT = 0;
    this.animT = rand(0, 1);
  }

  Enemy.prototype.isDoom = function () { return this.type === 'doom'; };
  Enemy.prototype.isBoss = function () { return this.type === 'boss'; };

  // Видит ли враг игрока: дистанция + не перегорожено стенами.
  // Узкого конуса нет — враг вертит головой, но стена реально скрывает игрока
  Enemy.prototype.canSee = function (state) {
    const p = state.player;
    if (!p.alive) return false;
    const dx = p.x - this.x, dy = p.y - this.y;
    const range = this.type === 'boss' ? 820 : this.aggro;
    if (dx * dx + dy * dy > range * range) return false;
    return !Game.buildings.losBlocked(state, this.x, this.y, p.x, p.y);
  };

  // Не видит игрока: замереть или бродить. Чувствует запах — тянется к игроку
  Enemy.prototype.updateIdle = function (dt, state) {
    this.wanderT -= dt;
    const p = state.player;
    if (this.wanderT <= 0) {
      if (Math.random() < 0.45) {
        this.wanderT = rand(0.8, 2.2);
        this.stopped = true;
      } else {
        this.wanderT = rand(1.2, 3.0);
        // В радиусе чутья — чаще выбираем направление на игрока
        if (p && p.alive && dist2(this.x, this.y, p.x, p.y) < this.aggro * this.aggro * 3.2 && Math.random() < 0.5) {
          this.wanderA = angleTo(this.x, this.y, p.x, p.y) + rand(-1.1, 1.1);
        } else {
          this.wanderA = rand(0, Math.PI * 2);
        }
        this.stopped = false;
      }
    }
    if (this.stopped) {
      this.dx = 0;
      this.dy = 0;
    } else {
      const wSp = this.speed * 0.45;
      this.dx = Math.cos(this.wanderA) * wSp;
      this.dy = Math.sin(this.wanderA) * wSp;
      this.x += this.dx * dt;
      this.y += this.dy * dt;
      this.angle = angleLerp(this.angle, this.wanderA, clamp(3 * dt, 0, 1));
    }
    const m = state.mapMargin;
    this.x = clamp(this.x, this.radius + m, state.mapW - this.radius - m);
    this.y = clamp(this.y, this.radius + m, state.mapH - this.radius - m);
  };

  Enemy.prototype.update = function (dt, state) {
    this.spawnT += dt;
    this.anim += dt * (this.speed * 0.08);
    this.hitFlash -= dt;
    this.contactCd -= dt;

    const p = state.player;
    if (!p.alive) { this.dx = 0; this.dy = 0; return; }

    if (this.isDoom()) {
      this.updateDoom(dt, state);
      return;
    }
    if (this.isBoss()) {
      this.updateBoss(dt, state);
      return;
    }

    // Естественное "гуляние": лёгкий шум для непредсказуемости
    if (Math.random() < 0.02) this.wobble = rand(-0.3, 0.3);

    // Игрок в поле зрения? Тогда преследуем (и запоминаем, где видели)
    const vis = this.canSee(state);
    if (vis) {
      this.awareT = 3.5;
      this.lx = p.x;
      this.ly = p.y;
    } else {
      this.awareT -= dt;
    }

    if (this.awareT > 0) {
      // Идём к игроку или к последнему месту, где его видели
      const tx = vis ? p.x : this.lx;
      const ty = vis ? p.y : this.ly;
      const targetA = angleTo(this.x, this.y, tx, ty);
      this.angle = angleLerp(this.angle, targetA, clamp(8 * dt, 0, 1));

      // Почти полная скорость, с лёгкой походкой-покачиванием.
      // Обычные зомби в преследовании бегут в 1.5 раза быстрее обычного
      const chaseMul = this.type === 'walker' ? 1.5 : 1;
      const sp = this.speed * chaseMul * (0.92 + 0.08 * Math.abs(Math.sin(this.anim * 1.5)));
      this.dx = Math.cos(targetA + this.wobble * 0.4) * sp;
      this.dy = Math.sin(targetA + this.wobble * 0.4) * sp;
      this.x += this.dx * dt;
      this.y += this.dy * dt;
    } else {
      this.updateIdle(dt, state);
    }

    const m = state.mapMargin;
    this.x = clamp(this.x, this.radius + m, state.mapW - this.radius - m);
    this.y = clamp(this.y, this.radius + m, state.mapH - this.radius - m);

    // Тип "runner" — рывки
    if (this.type === 'runner' && Math.sin(this.anim * 3) > 0.85) {
      this.x += this.dx * dt * 0.8;
      this.y += this.dy * dt * 0.8;
    }
  };

// Думгай атакует, пока видит игрока: орбита вокруг него + стрельба.
// Потерял из виду — идёт к последнему месту, где видел, потом снова бродит
Enemy.prototype.updateDoom = function (dt, state) {
    const p = state.player;
    this.fireCd -= dt;

    const vis = this.canSee(state);
    if (vis) {
      this.awareT = 3.5;
      this.lx = p.x;
      this.ly = p.y;
    } else {
      this.awareT -= dt;
    }

    // Пока в памяти — летим к игроку или к последнему известному месту
    if (this.awareT > 0) {
      const tx = vis ? p.x : this.lx;
      const ty = vis ? p.y : this.ly;
      const distT = Math.sqrt(dist2(this.x, this.y, tx, ty));
      if (vis) {
        this.orbitAngle += this.orbitDir * dt * 0.85;
        if (Math.random() < 0.01) this.orbitRadius = clamp(this.orbitRadius + rand(-40, 40), 220, 340);
      }
      const cx = tx + Math.cos(this.orbitAngle) * (vis ? this.orbitRadius : 0);
      const cy = ty + Math.sin(this.orbitAngle) * (vis ? this.orbitRadius : 0);
      const a = angleTo(this.x, this.y, cx, cy);
      const sp = this.speed * (vis ? 1 : 0.7);
      this.dx = Math.cos(a) * sp;
      this.dy = Math.sin(a) * sp;
      this.x += this.dx * dt;
      this.y += this.dy * dt;
      this.angle = angleTo(this.x, this.y, p.x, p.y);

      const m = state.mapMargin;
      this.x = clamp(this.x, this.radius + m, state.mapW - this.radius - m);
      this.y = clamp(this.y, this.radius + m, state.mapH - this.radius - m);

      // Стрельба только при прямом контакте взглядом
      if (vis && this.fireCd <= 0 && distT < 520) {
      this.fireCd = rand(1.7, 2.2);
      const spd = 350;
      // Радиус от цели к думгаю — его "пушка справа-внизу"
      const ang = angleTo(this.x, this.y, p.x, p.y);
      const ox = this.x + Math.cos(ang + Math.PI / 2) * this.radius * 0.6;
      const oy = this.y + Math.sin(ang + Math.PI / 2) * this.radius * 0.6;
      state.doomBullets.push({
        x: ox, y: oy,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 3.4,
        damage: this.dmg,
        px: ox, py: oy
      });
Game.audio.pistol();
        Game.effects.muzzleFlash(ox, oy, ang);
      }
      return;
    }

    // Не видит и не помнит — бродит/стоит
    this.updateIdle(dt, state);
  };

// Босс: быстро бежит к игроку, на средней дистанции стреляет очередями.
// В атаку идёт только когда видит игрока (обзор 360°), иначе бродит
Enemy.prototype.updateBoss = function (dt, state) {
    const p = state.player;
    this.firingT -= dt;
    this.animT += dt;   // секунды для плавной анимации кадров

    const vis = this.canSee(state);
    if (vis) {
      this.awareT = 8;
      this.lx = p.x;
      this.ly = p.y;
    } else {
      this.awareT -= dt;
    }
    if (this.awareT <= 0) {
      this.updateIdle(dt, state);
      return;
    }

    this.angle = angleTo(this.x, this.y, p.x, p.y);
    const dist = Math.sqrt(dist2(this.x, this.y, p.x, p.y));

    const targetR = 180;   // держится примерно в 180px
    if (dist > targetR + 30) {
      const a = angleTo(this.x, this.y, p.x, p.y);
      this.dx = Math.cos(a) * this.speed;
      this.dy = Math.sin(a) * this.speed;
    } else if (dist < targetR - 30) {
      const a = angleTo(this.x, this.y, p.x, p.y);
      this.dx = -Math.cos(a) * this.speed * 0.6;
      this.dy = -Math.sin(a) * this.speed * 0.6;
    } else {
      // На дистанции — обходит игрока по кругу
      const perp = this.angle + (this.orbitDir * Math.PI / 2);
      this.dx = Math.cos(perp) * this.speed * 0.55;
      this.dy = Math.sin(perp) * this.speed * 0.55;
    }
    this.x += this.dx * dt;
    this.y += this.dy * dt;

    const m = state.mapMargin;
    this.x = clamp(this.x, this.radius + m, state.mapW - this.radius - m);
    this.y = clamp(this.y, this.radius + m, state.mapH - this.radius - m);

    // Очередь пуль по игроку
    this.fireCd -= dt;
    if (this.fireCd <= 0 && dist > 90 && dist < 700) {
      this.fireCd = rand(0.9, 1.3);
      this.firingT = 0.32;  // показать кадры стрельбы
      for (let k = 0; k < 3; k++) {
        const ang = this.angle + rand(-0.05, 0.05);
        const spd = 430;
        state.doomBullets.push({
          x: this.x, y: this.y,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
          life: 2.6, damage: this.dmg,
          px: this.x, py: this.y,
          boss: true   // красные крупные пули босса
        });
      }
      Game.audio.bossGun();
      Game.effects.muzzleFlash(this.x + Math.cos(this.angle) * 30, this.y + Math.sin(this.angle) * 30, this.angle);
    }
  };

  Enemy.prototype.takeDamage = function (dmg, dirAngle, state) {
    this.hp -= dmg;
    this.hitFlash = 0.1;
    // Урон заставляет врага идти к игроку, даже если потерял его из виду
    if (state.player) {
      this.awareT = 4;
      this.lx = state.player.x;
      this.ly = state.player.y;
    }
    if (this.hp <= 0) {
      this.die(dirAngle, state);
      return true;
    }
    Game.effects.hitMarker(this.x, this.y);
    return false;
  };

  Enemy.prototype.die = function (dirAngle, state) {
    state.kills++;
    const p = state.player;
    if (p.alive) p.kills++;
    Game.effects.gibs(this.x, this.y, dirAngle);
    Game.effects.blood(this.x, this.y, dirAngle, this.type === 'brute' ? 34 : 16);
    if (this.isBoss()) {
      Game.effects.gibs(this.x, this.y, dirAngle);
      Game.effects.gibs(this.x, this.y, dirAngle);
      Game.effects.blood(this.x, this.y, dirAngle, 30);
      Game.shake(18);
    }
    Game.effects.floatingText(this.x, this.y - this.radius, '+' + this.score, '#ffd76a', 15);
    state.score += this.score;

    // Кровавое пятно остаётся на карте
    Game.effects.bloodPool(this.x, this.y, this.radius, this.type === 'brute' ? 46 : 24);
    if (this.isBoss()) {
      Game.effects.bloodPool(this.x, this.y, this.radius * 2.2, 70);
      Game.effects.floatingText(this.x, this.y - this.radius - 20, 'BOSS', '#ff5544', 22);
    }

    const idx = state.enemies.indexOf(this);
    if (idx >= 0) state.enemies.splice(idx, 1);
  };

  // ---- ОТРИСОВКА (двумерный вид, без переворота) ----
  Enemy.prototype.draw = function (g) {
    if (this.isBoss()) { this.drawBoss(g); return; }
    const x = this.x, y = this.y;
    const doom = this.isDoom();
    // Думгай теперь тоже зомби (модель одна), у него только оружие в руках
    const sprite = Game.assets.zombie;
    const crop = Game.assets.zombieCrop;
    const outline = Game.assets.zombieOutline;

    // Появление из-под земли
    const sp = clamp(this.spawnT / 0.5, 0, 1);
    if (sp < 1) {
      g.globalAlpha = 0.35;
      g.fillStyle = 'rgba(40,30,18,0.6)';
      g.beginPath();
      g.ellipse(x, y, this.radius * (2 - sp), this.radius * (1.4 - sp * 0.6), 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    // Тень
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.beginPath();
    g.ellipse(x + 2, y + 4, this.radius + 5, this.radius * 0.9, 0, 0, Math.PI * 2);
    g.fill();

    if (sprite && crop) {
      g.globalAlpha = 0.15 + 0.85 * sp;
      // Размер: зомби крупно, думгай чуть меньше, чем зомби-брут
      const s = this.radius * 2.9;
      // Лёгкий наклон при беге (не переворачиваем, только покачивание)
      const roll = Math.sin(this.anim * 3) * 0.06 * this.wobble;
      const bob = this.speed > 0 ? Math.abs(Math.sin(this.anim * 2)) * 3 : 0;

      g.save();
      g.translate(x, y);
      g.rotate(roll);
      // Обводка-силуэт со смещениями, чтобы враг читался на любом фоне
      if (outline) {
        g.drawImage(outline, -s / 2 - 2, -s / 2 - bob, s, s);
        g.drawImage(outline, -s / 2 + 2, -s / 2 - bob, s, s);
        g.drawImage(outline, -s / 2, -s / 2 - bob - 2, s, s);
        g.drawImage(outline, -s / 2, -s / 2 - bob + 2, s, s);
      }
      g.drawImage(sprite, crop.x, crop.y, crop.w, crop.h, -s / 2, -s / 2 - bob, s, s);
      g.restore();
      g.globalAlpha = 1;

      // Красные глаза у зомби — смотрят в сторону игрока
      g.fillStyle = 'rgba(255,40,24,0.95)';
      const ed = this.radius * 0.5;
      const ef = this.radius * 0.28;
      g.beginPath();
      g.arc(x + Math.cos(this.angle) * ed, y + Math.sin(this.angle) * ed - ef, 3.5, 0, Math.PI * 2);
      g.arc(x + Math.cos(this.angle) * ed, y + Math.sin(this.angle) * ed + ef, 3.5, 0, Math.PI * 2);
      g.fill();
      // Думгай — зомби с оружием: рисуем ствол поверх спрайта, целимся в игрока
      if (doom) {
        g.save();
        const side = this.angle + Math.PI / 2;
        const hx = x + Math.cos(side) * this.radius * 0.6;
        const hy = y + Math.sin(side) * this.radius * 0.6;
        g.translate(hx, hy);
        g.rotate(this.angle);
        const r = this.radius;
        // Корпус оружия у руки
        g.fillStyle = '#1b1b20';
        roundedRect(g, 0, -3, 13, 7, 2);
        g.fill();
        g.strokeStyle = 'rgba(90,90,100,0.5)';
        g.lineWidth = 1;
        g.strokeRect(0, -3, 13, 7);
        // Ствол — тянется к игроку
        g.fillStyle = '#0e0e12';
        g.fillRect(11, -2, r * 1.55, 3.5);
        g.moveTo(11, -0.2);
        g.strokeStyle = 'rgba(140,140,150,0.35)';
        g.lineTo(11 + r * 1.55, -0.2);
        g.stroke();
        // Приклад-рукоять
        g.fillStyle = '#232329';
        roundedRect(g, -4, -1, 5, 10, 2);
        g.fill();
        g.restore();
      }
    } else {
      // Запасной процедурный зомби (если спрайт не загрузился)
      this.drawProceduralBody(g, x, y);
    }

    // Вспышка урона
    if (this.hitFlash > 0) {
      g.globalAlpha = this.hitFlash * 4;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x, y, this.radius, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    // Полоска HP (показывается при уроне)
    if (this.hp < this.maxHp) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x - this.radius, y - this.radius - 14, this.radius * 2, 4);
      g.fillStyle = this.hp / this.maxHp > 0.4 ? '#8fdc6a' : '#e05a4a';
      g.fillRect(x - this.radius, y - this.radius - 14, this.radius * 2 * (this.hp / this.maxHp), 4);
    }
  };

  // Босс: анимация бега (ряд 0) и стрельбы (ряд 3) из спрайт-листа
  Enemy.prototype.drawBoss = function (g) {
    const x = this.x, y = this.y;

    // Появление из-под земли
    const sp = clamp(this.spawnT / 0.6, 0, 1);
    if (sp < 1) {
      g.globalAlpha = 0.35;
      g.fillStyle = 'rgba(40,30,18,0.6)';
      g.beginPath();
      g.ellipse(x, y, this.radius * (2 - sp), this.radius * (1.4 - sp * 0.6), 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    // Тень
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(x + 2, y + 4, this.radius + 7, this.radius * 0.95, 0, 0, Math.PI * 2);
    g.fill();

    const frames = this.firingT > 0 ? Game.assets.bossShoot : Game.assets.bossWalk;
    const outlines = this.firingT > 0 ? Game.assets.bossShootOutline : Game.assets.bossWalkOutline;
    if (frames && frames.length) {
      const n = frames.length;
      let idx;
      if (this.firingT > 0) {
        // Кадры стрельбы (поза с оружием)
        idx = clamp(Math.floor((1 - this.firingT / 0.32) * n), 0, n - 1);
      } else {
        // Плавный бег: 8 кадров в секунду
        idx = Math.floor(this.animT * 8) % n;
      }
      const frame = frames[idx];
      const out = outlines[idx];
      g.globalAlpha = 0.15 + 0.85 * sp;
      const s = this.radius * 3;  // высота контента кадра
      const roll = Math.sin(this.anim * 3) * 0.05;
      const bob = Math.abs(Math.sin(this.anim * 2)) * 2;

      g.save();
      g.translate(x, y);
      g.rotate(roll + (this.firingT > 0 ? 0.08 : 0));
      if (out) {
        g.drawImage(out, -s / 2 - 2, -s / 2 - bob - 2, s, s);
        g.drawImage(out, -s / 2 + 2, -s / 2 - bob + 2, s, s);
        g.drawImage(out, -s / 2 - 2, -s / 2 - bob + 2, s, s);
        g.drawImage(out, -s / 2 + 2, -s / 2 - bob - 2, s, s);
      }
      g.drawImage(frame, -s / 2, -s / 2 - bob, s, s);
      g.restore();
      g.globalAlpha = 1;
    } else {
      // Запасной вариант
      this.drawProceduralBody(g, x, y);
    }

    // Вспышка урона
    if (this.hitFlash > 0) {
      g.globalAlpha = this.hitFlash * 4;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x, y, this.radius, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    // Полоска HP босса (всегда видна)
    const bw = this.radius * 2.6;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x - bw / 2, y - this.radius - 20, bw, 6);
    g.fillStyle = '#d94b35';
    g.fillRect(x - bw / 2, y - this.radius - 20, bw * clamp(this.hp / this.maxHp, 0, 1), 6);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1;
    g.strokeRect(x - bw / 2, y - this.radius - 20, bw, 6);
  };

  // Старый процедурный зомби — запасной вариант
  Enemy.prototype.drawProceduralBody = function (g, x, y) {
    const t = TYPES[this.type];
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(this.anim * 2) * 0.15);
    g.fillStyle = t.color || '#5d7a3a';
    g.beginPath();
    g.ellipse(0, 0, this.radius * 1.05, this.radius * 0.95, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = t.dark || '#3f5426';
    g.beginPath();
    g.ellipse(this.radius * 0.2, this.radius * 0.25, this.radius * 0.4, this.radius * 0.28, 0.5, 0, Math.PI * 2);
    g.ellipse(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.3, this.radius * 0.24, -0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = t.skin || '#6e8a44';
    g.beginPath();
    g.ellipse(this.radius * 0.15, 0, this.radius * 0.5, this.radius * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,40,30,0.8)';
    g.beginPath();
    g.arc(this.radius * 0.42, -this.radius * 0.12, 3, 0, Math.PI * 2);
    g.arc(this.radius * 0.42, this.radius * 0.12, 3, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  Game.Enemy = Enemy;
  Game.EnemyTypes = TYPES;
})();