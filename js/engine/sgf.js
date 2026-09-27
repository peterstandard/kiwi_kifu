/**
 * Kiwi Kifu - SGF Parsing, Serialization & Coordinate Conversion
 * Fully supports standard recursive SGF (FF[4]) game trees and variations.
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

/**
 * Parses an SGF string into an AST with sequences of property maps and recursive subtrees.
 * Returns: { sequence: [ { IDENT: [val1, val2] } ], subTrees: [ { sequence, subTrees } ] }
 */
export function parseSgf(sgf) {
  let i = 0;
  const len = sgf.length;

  function skipWhitespace() {
    while (i < len && /\s/.test(sgf[i])) i++;
  }

  function parsePropValue() {
    if (sgf[i] !== '[') return null;
    i++; // skip '['
    let val = '';
    while (i < len) {
      if (sgf[i] === '\\') {
        if (i + 1 < len) {
          val += sgf[i + 1];
          i += 2;
        } else {
          i++;
        }
      } else if (sgf[i] === ']') {
        i++; // skip ']'
        break;
      } else {
        val += sgf[i];
        i++;
      }
    }
    return val;
  }

  function parseNode() {
    if (sgf[i] !== ';') return null;
    i++; // skip ';'
    const props = {};
    while (i < len) {
      skipWhitespace();
      if (i >= len || sgf[i] === ';' || sgf[i] === '(' || sgf[i] === ')') break;
      let ident = '';
      while (i < len && /[A-Z]/.test(sgf[i])) {
        ident += sgf[i];
        i++;
      }
      if (!ident) {
        i++;
        continue;
      }
      skipWhitespace();
      const values = [];
      while (i < len && sgf[i] === '[') {
        const val = parsePropValue();
        if (val !== null) values.push(val);
        skipWhitespace();
      }
      props[ident] = values;
    }
    return props;
  }

  function parseTree() {
    skipWhitespace();
    if (i >= len || sgf[i] !== '(') return null;
    i++; // skip '('

    const sequence = [];
    while (i < len) {
      skipWhitespace();
      if (i >= len) break;
      if (sgf[i] === ';') {
        const node = parseNode();
        if (node) sequence.push(node);
      } else if (sgf[i] === '(' || sgf[i] === ')') {
        break;
      } else {
        i++;
      }
    }

    const subTrees = [];
    while (i < len) {
      skipWhitespace();
      if (i >= len || sgf[i] === ')') break;
      if (sgf[i] === '(') {
        const sub = parseTree();
        if (sub) subTrees.push(sub);
      } else {
        i++;
      }
    }

    skipWhitespace();
    if (i < len && sgf[i] === ')') {
      i++; // skip ')'
    }

    return { sequence, subTrees };
  }

  while (i < len && sgf[i] !== '(') i++;
  return parseTree();
}

function serializeNodeBranch(node) {
  let res = '';
  let cur = node;
  let moveCount = 0;
  while (cur) {
    if (cur.player === 1 || cur.player === 2) {
      const p = cur.player === 1 ? 'B' : 'W';
      const coordStr = cur.coord ? coordToSgf(cur.coord.x, cur.coord.y) : '';
      res += `;${p}[${coordStr}]`;
      if (cur.comment) {
        res += `C[${escapeSgf(cur.comment)}]`;
      }
      moveCount++;
      if (moveCount % 6 === 0) res += '\n';
    }

    if (!cur.children || cur.children.length === 0) {
      break;
    } else if (cur.children.length === 1) {
      cur = cur.children[0];
    } else {
      for (const branch of cur.children) {
        res += '\n(' + serializeNodeBranch(branch) + ')';
      }
      break;
    }
  }
  return res;
}

/**
 * Serializes a GoGame instance to standard SGF, outputting clean tree variations
 * when multiple branches exist.
 */
export function serializeGameToSgf(game) {
  let sgf = '(;GM[1]FF[4]CA[UTF-8]AP[KiwiKifu:1.0]\n';
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

  // If tree representation exists on game.rootNode, serialize recursively
  if (game.rootNode && game.rootNode.children && game.rootNode.children.length > 0) {
    if (game.rootNode.children.length === 1) {
      sgf += serializeNodeBranch(game.rootNode.children[0]);
    } else {
      for (const branch of game.rootNode.children) {
        sgf += '\n(' + serializeNodeBranch(branch) + ')';
      }
    }
  } else {
    // Fallback linear serialization for flat history arrays
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
  }

  sgf += '\n)';
  return sgf;
}
