/**
 * SimpleKifu - SGF Parsing, Serialization & Coordinate Conversion
 */

import { COORD_LETTERS, SGF_LETTERS } from './constants.js';

export function coordToSgf(x, y) {
  if (x === null || y === null || x < 0 || y < 0) return '';
  return SGF_LETTERS[x] + SGF_LETTERS[y];
}

export function sgfToCoord(str, size = 19) {
  if (!str || str.length < 2) return null;
  const x = SGF_LETTERS.indexOf(str[0].toLowerCase());
  const y = SGF_LETTERS.indexOf(str[1].toLowerCase());
  if (x < 0 || x >= size || y < 0 || y >= size) return null;
  return { x, y };
}

export function coordToReadable(x, y, size = 19) {
  if (x === null || y === null || x === undefined || y === undefined) return 'Pass';
  const col = COORD_LETTERS[x] || '?';
  const row = size - y;
  return `${col}${row}`;
}

export function escapeSgf(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

export function unescapeSgf(str) {
  if (!str) return '';
  return str.replace(/\\([\s\S])/g, '$1');
}

export function serializeGameToSgf(game) {
  let sgf = '(;GM[1]FF[4]CA[UTF-8]AP[SimpleKifu:1.0]\n';
  sgf += `SZ[${game.size}]\n`;
  sgf += `KM[${game.info.komi || 6.5}]\n`;
  sgf += `RU[${game.info.rules || 'Japanese'}]\n`;
  sgf += `PW[${escapeSgf(game.info.whiteName || 'White')}]\n`;
  if (game.info.whiteRank) sgf += `WR[${escapeSgf(game.info.whiteRank)}]\n`;
  sgf += `PB[${escapeSgf(game.info.blackName || 'Black')}]\n`;
  if (game.info.blackRank) sgf += `BR[${escapeSgf(game.info.blackRank)}]\n`;
  if (game.info.date) sgf += `DT[${game.info.date}]\n`;
  if (game.info.event) sgf += `EV[${escapeSgf(game.info.event)}]\n`;
  if (game.info.result) sgf += `RE[${escapeSgf(game.info.result)}]\n`;

  if (game.handicap >= 2 && game.handicapStones.length > 0) {
    sgf += `HA[${game.handicap}]\nAB`;
    for (const stone of game.handicapStones) {
      sgf += `[${coordToSgf(stone.x, stone.y)}]`;
    }
    sgf += '\n';
  }

  for (let i = 1; i < game.history.length; i++) {
    const node = game.history[i];
    const p = node.player === 1 ? 'B' : 'W';
    const coordStr = node.coord ? coordToSgf(node.coord.x, node.coord.y) : '';
    sgf += `;${p}[${coordStr}]`;
    if (node.comment) {
      sgf += `C[${escapeSgf(node.comment)}]`;
    }
    if (i % 6 === 0) sgf += '\n';
  }

  sgf += '\n)';
  return sgf;
}
