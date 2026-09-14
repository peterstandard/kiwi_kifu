/**
 * SimpleKifu - SVG Board Renderer
 */

import { COORD_LETTERS } from '../engine/constants.js';

export class BoardRenderer {
  constructor(domElements) {
    this.svg = domElements.svg;
    this.woodGroup = domElements.woodGroup;
    this.gridGroup = domElements.gridGroup;
    this.coordsGroup = domElements.coordsGroup;
    this.starPointsGroup = domElements.starPointsGroup;
    this.stonesGroup = domElements.stonesGroup;
    this.markersGroup = domElements.markersGroup;
    this.zoomGroup = domElements.zoomGroup;
    this.btnZoomReset = domElements.btnZoomReset;
  }

  getMetrics(size = 19) {
    const margin = 28;
    const cellSize = 30;
    const width = margin * 2 + (size - 1) * cellSize;
    const height = width;
    return { size, margin, cellSize, width, height, stoneRadius: cellSize * 0.48 };
  }

  calculateMoveNumbers(game, numbersMode) {
    const result = {};
    if (numbersMode === 'none') return result;

    const currentStep = game.currentStep;
    let startStep = 1;

    if (numbersMode === 'last1') {
      startStep = Math.max(1, currentStep);
    } else if (numbersMode === 'last10') {
      startStep = Math.max(1, currentStep - 9);
    }

    for (let i = startStep; i <= currentStep; i++) {
      const node = game.history[i];
      if (node && node.coord && node.coord.x !== null) {
        const { x, y } = node.coord;
        if (game.board[y][x] === node.player) {
          result[`${x},${y}`] = i;
        }
      }
    }
    return result;
  }

  render(game, numbersMode = 'last1', pendingMove = null, scale = 1.0, panX = 0, panY = 0, scoringState = null, editingMove = null) {
    const metrics = this.getMetrics(game.size);
    const { size, margin, cellSize, width, height, stoneRadius } = metrics;

    if (this.svg) {
      this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    // 1. Render Wood Base
    if (this.woodGroup) {
      this.woodGroup.innerHTML = `<rect width="${width}" height="${height}" fill="url(#wood-grad)" />`;
    }

    // 2. Render Grid Lines
    if (this.gridGroup) {
      let gridSvg = '';
      const startCoord = margin;
      const endCoord = margin + (size - 1) * cellSize;

      for (let i = 0; i < size; i++) {
        const pos = margin + i * cellSize;
        const strokeWidth = (i === 0 || i === size - 1) ? 2 : 1;
        // Vertical
        gridSvg += `<line x1="${pos}" y1="${startCoord}" x2="${pos}" y2="${endCoord}" stroke="#45311c" stroke-width="${strokeWidth}" />`;
        // Horizontal
        gridSvg += `<line x1="${startCoord}" y1="${pos}" x2="${endCoord}" y2="${pos}" stroke="#45311c" stroke-width="${strokeWidth}" />`;
      }
      this.gridGroup.innerHTML = gridSvg;
    }

    // 3. Render Star Points (Hoshi)
    if (this.starPointsGroup) {
      let starSvg = '';
      let starIndices = [];
      if (size === 19) starIndices = [3, 9, 15];
      else if (size === 13) starIndices = [3, 6, 9];
      else if (size === 9) starIndices = [2, 4, 6];

      for (const row of starIndices) {
        for (const col of starIndices) {
          const cx = margin + col * cellSize;
          const cy = margin + row * cellSize;
          starSvg += `<circle cx="${cx}" cy="${cy}" r="3.2" fill="#382512" />`;
        }
      }
      this.starPointsGroup.innerHTML = starSvg;
    }

    // 4. Render Coordinate Labels
    if (this.coordsGroup) {
      let coordSvg = '';
      const labelColor = '#6d5032';
      const fontSize = 11;

      for (let i = 0; i < size; i++) {
        const pos = margin + i * cellSize;
        const letter = COORD_LETTERS[i];
        const number = size - i;

        // Letters top & bottom
        coordSvg += `<text x="${pos}" y="${margin * 0.55}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="600" fill="${labelColor}">${letter}</text>`;
        coordSvg += `<text x="${pos}" y="${height - margin * 0.45}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="600" fill="${labelColor}">${letter}</text>`;

        // Numbers left & right
        coordSvg += `<text x="${margin * 0.45}" y="${pos}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="600" fill="${labelColor}">${number}</text>`;
        coordSvg += `<text x="${width - margin * 0.45}" y="${pos}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="600" fill="${labelColor}">${number}</text>`;
      }
      this.coordsGroup.innerHTML = coordSvg;
    }

    // 5. Render Stones & Markers
    let stonesSvg = '';
    let markersSvg = '';
    const isScoring = scoringState && scoringState.active;
    const moveNumbers = isScoring ? {} : this.calculateMoveNumbers(game, numbersMode);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const color = game.board[y][x];
        const cx = margin + x * cellSize;
        const cy = margin + y * cellSize;

        if (color === 0) {
          // In scoring mode, render subtle square territory dots
          if (isScoring && scoringState.territory) {
            const terr = scoringState.territory[y][x]?.isTerritoryFor ?? scoringState.territory[y][x];
            if (terr === 1) { // Black territory
              const sq = cellSize * 0.24;
              markersSvg += `<rect x="${cx - sq / 2}" y="${cy - sq / 2}" width="${sq}" height="${sq}" rx="1" fill="#181a1b" stroke="#3e3730" stroke-width="0.7" opacity="0.9" pointer-events="none" />`;
            } else if (terr === 2) { // White territory
              const sq = cellSize * 0.24;
              markersSvg += `<rect x="${cx - sq / 2}" y="${cy - sq / 2}" width="${sq}" height="${sq}" rx="1" fill="#f8f5f0" stroke="#a38f75" stroke-width="0.8" opacity="0.95" pointer-events="none" />`;
            }
          }
        } else {
          const grad = color === 1 ? 'url(#black-grad)' : 'url(#white-grad)';
          const stroke = color === 1 ? '#111' : '#bbb';
          const isDead = isScoring && scoringState.markedDead && scoringState.markedDead[y] && scoringState.markedDead[y][x];
          const isBeingEdited = editingMove && editingMove.originalCoord && editingMove.originalCoord.x === x && editingMove.originalCoord.y === y;

          if (isDead || isBeingEdited) {
            // Translucent stone so underlying grid and status are clear
            stonesSvg += `<circle cx="${cx}" cy="${cy}" r="${stoneRadius}" fill="${grad}" stroke="${stroke}" stroke-width="0.8" opacity="0.38" />`;
            // Crisp X mark centered on stone (scoring dead stone style)
            const d = stoneRadius * 0.42;
            const xColor = color === 1 ? '#ffffff' : '#c0392b';
            markersSvg += `<line x1="${cx - d}" y1="${cy - d}" x2="${cx + d}" y2="${cy + d}" stroke="${xColor}" stroke-width="2.6" stroke-linecap="round" pointer-events="none" />`;
            markersSvg += `<line x1="${cx - d}" y1="${cy + d}" x2="${cx + d}" y2="${cy - d}" stroke="${xColor}" stroke-width="2.6" stroke-linecap="round" pointer-events="none" />`;
            if (isBeingEdited) {
              // Amber dashed target halo around stone being relocated
              markersSvg += `<circle cx="${cx}" cy="${cy}" r="${stoneRadius + 2.5}" fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="4 2.5" pointer-events="none" />`;
            }
          } else {
            stonesSvg += `<circle cx="${cx}" cy="${cy}" r="${stoneRadius}" fill="${grad}" stroke="${stroke}" stroke-width="0.8" filter="url(#stone-shadow)" />`;

            // Move number overlay (only during normal play)
            const moveNum = moveNumbers[`${x},${y}`];
            if (moveNum !== undefined) {
              const numColor = color === 1 ? '#ffffff' : '#000000';
              const numSize = moveNum > 99 ? 10 : 12;
              markersSvg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${numSize}" font-weight="bold" fill="${numColor}" pointer-events="none">${moveNum}</text>`;
            }
          }
        }
      }
    }

    // Last move marker (only during normal play, not on edited stone)
    if (!isScoring) {
      const currentNode = game.history[game.currentStep];
      if (currentNode && currentNode.coord && currentNode.coord.x !== null) {
        const { x, y } = currentNode.coord;
        const isBeingEdited = editingMove && editingMove.originalCoord && editingMove.originalCoord.x === x && editingMove.originalCoord.y === y;
        const moveNum = moveNumbers[`${x},${y}`];
        if (moveNum === undefined && !isBeingEdited) {
          const cx = margin + x * cellSize;
          const cy = margin + y * cellSize;
          const markerColor = currentNode.player === 1 ? '#ffffff' : '#dc2626';
          markersSvg += `<circle cx="${cx}" cy="${cy}" r="${stoneRadius * 0.38}" fill="none" stroke="${markerColor}" stroke-width="2.2" pointer-events="none" />`;
        }
      }
    }

    // Ghost stone for pending move in confirm mode (only during normal play / edit)
    if (!isScoring && pendingMove) {
      const { x, y } = pendingMove;
      const cx = margin + x * cellSize;
      const cy = margin + y * cellSize;
      const ghostPlayer = editingMove ? editingMove.player : game.turn;
      const ghostColor = ghostPlayer === 1 ? 'rgba(20, 20, 20, 0.65)' : 'rgba(255, 255, 255, 0.85)';
      const ghostStroke = ghostPlayer === 1 ? '#fff' : '#000';
      markersSvg += `<circle cx="${cx}" cy="${cy}" r="${stoneRadius}" fill="${ghostColor}" stroke="${ghostStroke}" stroke-width="1.5" stroke-dasharray="3 3" filter="url(#ghost-shadow)" pointer-events="none" />`;
    }

    if (this.stonesGroup) this.stonesGroup.innerHTML = stonesSvg;
    if (this.markersGroup) this.markersGroup.innerHTML = markersSvg;

    this.applyTransform(scale, panX, panY);
  }

  applyTransform(scale = 1.0, panX = 0, panY = 0) {
    if (this.zoomGroup) {
      this.zoomGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${scale})`);
    }
    if (this.btnZoomReset) {
      if (scale > 1.05) {
        this.btnZoomReset.classList.remove('hidden');
        this.btnZoomReset.textContent = `${scale.toFixed(1)}×`;
      } else {
        this.btnZoomReset.classList.add('hidden');
      }
    }
  }

  /**
   * Generates standalone, self-contained SVG markup for board image export.
   * Includes all gradients, drop shadows, and fonts inline so it can be cleanly
   * rendered to Canvas / PNG without external CSS dependencies.
   */
  generateExportSvg(game, numbersMode = 'all') {
    const metrics = this.getMetrics(game.size);
    const { size, margin, cellSize, width, height, stoneRadius } = metrics;
    const moveNumbers = this.calculateMoveNumbers(game, numbersMode);
    const sansFont = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    // 1. Grid Lines
    let gridSvg = '';
    const startCoord = margin;
    const endCoord = margin + (size - 1) * cellSize;

    for (let i = 0; i < size; i++) {
      const pos = margin + i * cellSize;
      const strokeWidth = (i === 0 || i === size - 1) ? 2 : 1;
      gridSvg += `<line x1="${pos}" y1="${startCoord}" x2="${pos}" y2="${endCoord}" stroke="#45311c" stroke-width="${strokeWidth}" />`;
      gridSvg += `<line x1="${startCoord}" y1="${pos}" x2="${endCoord}" y2="${pos}" stroke="#45311c" stroke-width="${strokeWidth}" />`;
    }

    // 2. Star Points (Hoshi)
    let starSvg = '';
    let starIndices = [];
    if (size === 19) starIndices = [3, 9, 15];
    else if (size === 13) starIndices = [3, 6, 9];
    else if (size === 9) starIndices = [2, 4, 6];

    for (const row of starIndices) {
      for (const col of starIndices) {
        const cx = margin + col * cellSize;
        const cy = margin + row * cellSize;
        starSvg += `<circle cx="${cx}" cy="${cy}" r="3.2" fill="#382512" />`;
      }
    }

    // 3. Coordinate Labels
    let coordSvg = '';
    const labelColor = '#6d5032';
    const fontSize = 11;

    for (let i = 0; i < size; i++) {
      const pos = margin + i * cellSize;
      const letter = COORD_LETTERS[i];
      const number = size - i;

      coordSvg += `<text x="${pos}" y="${margin * 0.55}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="600" fill="${labelColor}" font-family="${sansFont}">${letter}</text>`;
      coordSvg += `<text x="${pos}" y="${height - margin * 0.45}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="600" fill="${labelColor}" font-family="${sansFont}">${letter}</text>`;

      coordSvg += `<text x="${margin * 0.45}" y="${pos}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="600" fill="${labelColor}" font-family="${sansFont}">${number}</text>`;
      coordSvg += `<text x="${width - margin * 0.45}" y="${pos}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="600" fill="${labelColor}" font-family="${sansFont}">${number}</text>`;
    }

    // 4. Stones & Markers
    let stonesSvg = '';
    let markersSvg = '';

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const color = game.board[y][x];
        if (color === 0) continue;

        const cx = margin + x * cellSize;
        const cy = margin + y * cellSize;
        const grad = color === 1 ? 'url(#exp-black-grad)' : 'url(#exp-white-grad)';
        const stroke = color === 1 ? '#111' : '#bbb';

        stonesSvg += `<circle cx="${cx}" cy="${cy}" r="${stoneRadius}" fill="${grad}" stroke="${stroke}" stroke-width="0.8" filter="url(#exp-stone-shadow)" />`;

        const moveNum = moveNumbers[`${x},${y}`];
        if (moveNum !== undefined) {
          const numColor = color === 1 ? '#ffffff' : '#000000';
          const numSize = moveNum > 99 ? 10 : 12;
          markersSvg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${numSize}" font-weight="bold" fill="${numColor}" font-family="${sansFont}">${moveNum}</text>`;
        }
      }
    }

    // Last move marker (ring marker) if unnumbered or if last move has no number
    const currentNode = game.history[game.currentStep];
    if (currentNode && currentNode.coord && currentNode.coord.x !== null) {
      const { x, y } = currentNode.coord;
      const moveNum = moveNumbers[`${x},${y}`];
      if (moveNum === undefined) {
        const cx = margin + x * cellSize;
        const cy = margin + y * cellSize;
        const markerColor = currentNode.player === 1 ? '#ffffff' : '#dc2626';
        markersSvg += `<circle cx="${cx}" cy="${cy}" r="${stoneRadius * 0.38}" fill="none" stroke="${markerColor}" stroke-width="2.2" />`;
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <defs>
        <linearGradient id="exp-wood-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#e8be78" />
          <stop offset="50%" stop-color="#dfa964" />
          <stop offset="100%" stop-color="#d39b4f" />
        </linearGradient>
        <radialGradient id="exp-black-grad" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#5a5a5a" />
          <stop offset="45%" stop-color="#222222" />
          <stop offset="100%" stop-color="#050505" />
        </radialGradient>
        <radialGradient id="exp-white-grad" cx="30%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="60%" stop-color="#eeeeee" />
          <stop offset="90%" stop-color="#d4d4d4" />
          <stop offset="100%" stop-color="#b0b0b0" />
        </radialGradient>
        <filter id="exp-stone-shadow" x="-20%" y="-20%" width="145%" height="145%">
          <feDropShadow dx="1" dy="2.5" stdDeviation="1.8" flood-opacity="0.38" />
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#exp-wood-grad)" />
      <g id="exp-grid">${gridSvg}</g>
      <g id="exp-stars">${starSvg}</g>
      <g id="exp-coords">${coordSvg}</g>
      <g id="exp-stones">${stonesSvg}</g>
      <g id="exp-markers">${markersSvg}</g>
    </svg>`;
  }
}

