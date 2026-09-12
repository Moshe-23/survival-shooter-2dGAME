// Система построек: стены, двери. F — режим стройки.
// ЛКМ — поставить, ПКМ — убрать, 1/2/3 — материал.
// Враги и пули скользят по стенам; открытая дверь проходима.
(function () {
  const GRID = 48;
  const MAX = 160;

  function curCell(state) {
    return (state.worldX || 0) + ',' + (state.worldY || 0);
  }

  function init(state) {
    state.buildings = [];
    state.buildMode = false;
    state.buildMaterial = 'board';
  }

  // Список препятствий (открытая дверь сквозная) — только стены текущей карты.
  // Магазин на спавне тоже «твёрдый» — через него не пройти и не прострелить.
  function rects(state) {
    const out = [];
    const key = curCell(state);
    const list = state.buildings;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.cell !== key) continue;
      if (b.type === 'door' && b.open) continue;
      out.push({ x: b.x, y: b.y, w: GRID, h: GRID });
    }
    if (state.shop && state.worldX === 0 && state.worldY === 0) {
      out.push({
        x: state.shop.x - state.shop.hw,
        y: state.shop.y - state.shop.hh,
        w: state.shop.hw * 2,
        h: state.shop.hh * 2
      });
    }
    return out;
  }

  // Перегорожена ли стенами линия видимости (луч из глаз врага до игрока)
  function losBlocked(state, x0, y0, x1, y1) {
    const rs = rects(state);
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const steps = Math.max(Math.ceil(dist / 22), 1);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t, y = y0 + dy * t;
      for (let k = 0; k < rs.length; k++) {
        const rc = rs[k];
        if (x >= rc.x && x < rc.x + rc.w && y >= rc.y && y < rc.y + rc.h) return true;
      }
    }
    return false;
  }

  // Скольжение вокруг стен (по осям X и Y — враг обходит,
  // а не застревает) и выталкивание. prevX/prevY — позиция ДО движения:
  // объект выталкивается на ту сторону грани, с которой пришёл,
  // и не «проскакивает» насквозь и не выщёлкивается по центру грани.
  function resolve(x, y, r, state, prevX, prevY) {
    const rs = rects(state);
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < rs.length; k++) {
        const rc = rs[k];
        const hasPrev = typeof prevX === 'number' && typeof prevY === 'number';
        // Ось X: вернуть на сторону входа
        if (y + r > rc.y && y - r < rc.y + rc.h) {
          if (x + r > rc.x && x - r < rc.x + rc.w) {
            if (hasPrev && !(prevX + r > rc.x && prevX - r < rc.x + rc.w)) {
              x = prevX < rc.x ? rc.x - r : rc.x + rc.w + r;
            } else {
              const dl = x - (rc.x - r);
              const dr = (rc.x + rc.w + r) - x;
              x = dl <= dr ? rc.x - r : rc.x + rc.w + r;
            }
          }
        }
        // Ось Y: вернуть на сторону входа
        if (x + r > rc.x && x - r < rc.x + rc.w) {
          if (y + r > rc.y && y - r < rc.y + rc.h) {
            if (hasPrev && !(prevY + r > rc.y && prevY - r < rc.y + rc.h)) {
              y = prevY < rc.y ? rc.y - r : rc.y + rc.h + r;
            } else {
              const du = y - (rc.y - r);
              const dd = (rc.y + rc.h + r) - y;
              y = du <= dd ? rc.y - r : rc.y + rc.h + r;
            }
          }
        }
      }
    }
    return { x: x, y: y };
  }

  // Попала ли точка в закрытую стену/дверь
  function solidAt(state, x, y) {
    const rs = rects(state);
    for (let k = 0; k < rs.length; k++) {
      const rc = rs[k];
      if (x >= rc.x && x < rc.x + rc.w && y >= rc.y && y < rc.y + rc.h) return true;
    }
    return false;
  }

  function cellAt(mx, my) {
    return { x: Math.floor(mx / GRID) * GRID, y: Math.floor(my / GRID) * GRID };
  }

  function occupant(state, x, y) {
    const key = curCell(state);
    const list = state.buildings;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.cell !== key) continue;
      if (b.x === x && b.y === y) return b;
    }
    return null;
  }

  function canPlace(state, x, y, mapW, mapH) {
    if (x + GRID > mapW - 4 || y + GRID > mapH - 4 || x < 4 || y < 4) return 'edge';
    if (occupant(state, x, y)) return 'busy';
    if (state.buildings.length >= MAX) return 'limit';
    return 'ok';
  }

  function place(state, type, mx, my, mapW, mapH) {
    const c = cellAt(mx, my);
    const why = canPlace(state, c.x, c.y, mapW, mapH);
    if (why !== 'ok') return why;
    state.buildings.push({ x: c.x, y: c.y, type: type, open: false, cell: curCell(state) });
    Game.audio.buildSound();
    return 'ok';
  }

  function remove(state, mx, my) {
    const c = cellAt(mx, my);
    const o = occupant(state, c.x, c.y);
    if (o) state.buildings.splice(state.buildings.indexOf(o), 1);
    return !!o;
  }

  // Ближайшая дверь рядом с игроком
  function nearDoor(state, maxDist) {
    const pl = state.player;
    if (!pl) return null;
    maxDist = maxDist || 80;
    const list = state.buildings;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.type !== 'door') continue;
      const cx = b.x + GRID / 2, cy = b.y + GRID / 2;
      if (dist2(pl.x, pl.y, cx, cy) < maxDist * maxDist) return b;
    }
    return null;
  }

  function toggleDoor(state, door) {
    if (!door) return;
    door.open = !door.open;
    Game.audio.doorClick();
  }

  // ---- ОТРИСОВКА ----
  function draw(g, state) {
    const list = state.buildings;
    for (let i = 0; i < list.length; i++) drawOne(g, state, list[i]);
  }

  function drawOne(g, state, b) {
    const x = b.x, y = b.y;
    g.save();
    // Тень
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x + 2, y + 3, GRID, GRID);
    g.fillStyle = '#1d1f16';
    g.fillRect(x + 1, y + 1, GRID, GRID);

    if (b.type === 'stone') {
      // Кладка из камня
      g.fillStyle = '#777d84';
      g.fillRect(x, y, GRID, GRID);
      g.fillStyle = '#5c6167';
      g.fillRect(x, y + GRID - 4, GRID, 4);
      g.fillRect(x + GRID - 4, y, 4, GRID);
      // Камни (детерминировано от координат)
      g.fillStyle = '#8a9097';
      const off = (x * 13 + y * 7) % 3;
      g.fillRect(x + 4, y + 4 + off, 16, 12);
      g.fillRect(x + 24, y + 22 - off, 18, 14);
      g.fillStyle = '#666b71';
      g.fillRect(x + 24, y + 5, 12, 10);
      // Верхний блик
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(x, y, GRID, 2);
    } else if (b.type === 'board') {
      // Доски
      g.fillStyle = '#7d5f38';
      g.fillRect(x, y, GRID, GRID);
      g.strokeStyle = '#523b20';
      g.lineWidth = 2;
      for (let i = 0; i <= GRID; i += 16) {
        g.beginPath();
        g.moveTo(x + i + 0.5, y);
        g.lineTo(x + i + 0.5, y + GRID);
        g.stroke();
      }
      g.fillStyle = '#8c6b3f';
      g.fillRect(x, y, 16, 8);
      g.fillRect(x + 16, y + 10, 16, 8);
      g.fillStyle = '#4c3a24';
      for (const nx of [x + 6, x + 22, x + 38]) {
        g.fillRect(nx, y + 4, 3, 3);
        g.fillRect(nx, y + 40, 3, 3);
      }
    } else if (b.type === 'door') {
      // Дверь: открытая — сдвигается вбок
      const shift = b.open ? GRID * 0.72 : 0;
      // Рама и проём
      g.fillStyle = '#2e2418';
      g.fillRect(x, y, GRID, GRID);
      g.fillStyle = '#a57e49';
      g.fillRect(x + 5, y + 3, GRID - 10, GRID - 6);
      g.fillStyle = '#7c5c32';
      g.fillRect(x + 5, y + 3, GRID - 10, 5);
      // Фигурки панелей
      g.fillStyle = '#8f6b3c';
      g.fillRect(x + 9, y + 14, GRID - 18, GRID - 30);
      g.fillStyle = '#6e5230';
      g.fillRect(x + 9, y + GRID - 20, GRID - 18, 5);
      // Ручка
      g.fillStyle = '#e8d8a0';
      g.beginPath();
      g.arc(x + GRID - 11 + shift * 0, y + GRID / 2, 3, 0, Math.PI * 2);
      g.fill();
      // Открытая дверь съезжает вбок
      g.globalAlpha = 0.85;
      g.fillStyle = 'rgba(125,95,56,0.5)';
      g.fillRect(x + shift, y, 6, GRID);
      g.fillStyle = '#a57e49';
      g.fillRect(x + shift, y + 3, 4, GRID - 6);
      g.globalAlpha = 1;
    }
    g.restore();
  }

  Game.buildings = {
    GRID: GRID,
    init: init,
    resolve: resolve,
    solidAt: solidAt,
    losBlocked: losBlocked,
    cellAt: cellAt,
    occupant: occupant,
    canPlace: canPlace,
    place: place,
    remove: remove,
    nearDoor: nearDoor,
    toggleDoor: toggleDoor,
    draw: draw
  };
})();