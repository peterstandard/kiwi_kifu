/**
 * SimpleKifu - Core Go Rules Engine & Game State
 */

import { HOSHI_POINTS } from './constants.js';
import {
  coordToSgf,
  sgfToCoord,
  coordToReadable,
  escapeSgf,
  unescapeSgf,
  serializeGameToSgf
} from './sgf.js';

export class GoGame {
  constructor(size = 19) {
    this.size = size;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(0));
    this.history = [];
    this.currentStep = 0;
    this.captures = { 1: 0, 2: 0 }; // 1 = Black, 2 = White
    this.turn = 1; // 1 = Black, 2 = White
    this.handicap = 0;
    this.handicapStones = [];
    this.info = {
      blackName: 'Black',
      blackRank: '',
      whiteName: 'White',
      whiteRank: '',
      komi: 6.5,
      date: new Date().toISOString().split('T')[0],
      event: '',
      result: '',
      rules: 'Japanese'
    };

    // Save initial empty state
    this.history.push({
      step: 0,
      player: 0,
      coord: null,
      captures: [],
      comment: '',
      board: this.cloneBoard(),
      caps: { 1: 0, 2: 0 },
      hash: this.getBoardHash()
    });
  }

  cloneBoard() {
    return this.board.map(row => [...row]);
  }

  getBoardHash(b = this.board) {
    return b.map(row => row.join('')).join('');
  }

  coordToSgf(x, y) {
    return coordToSgf(x, y);
  }

  sgfToCoord(str) {
    return sgfToCoord(str, this.size);
  }

  coordToReadable(x, y) {
    return coordToReadable(x, y, this.size);
  }

  escapeSgf(str) {
    return escapeSgf(str);
  }

  applyHandicap(numStones) {
    this.reset();
    this.handicap = numStones;
    if (numStones < 2) return;

    let points = [];
    const hoshiData = HOSHI_POINTS[this.size];
    if (hoshiData && hoshiData.handicapMap) {
      const hoshiMap = hoshiData.handicapMap;
      if (this.size === 19) {
        if (numStones === 2) points = [hoshiMap.d4, hoshiMap.q16];
        else if (numStones === 3) points = [hoshiMap.d4, hoshiMap.q16, hoshiMap.q4];
        else if (numStones === 4) points = [hoshiMap.d4, hoshiMap.q16, hoshiMap.d16, hoshiMap.q4];
        else if (numStones === 5) points = [hoshiMap.d4, hoshiMap.q16, hoshiMap.d16, hoshiMap.q4, hoshiMap.k10];
        else if (numStones === 6) points = [hoshiMap.d4, hoshiMap.q16, hoshiMap.d16, hoshiMap.q4, hoshiMap.d10, hoshiMap.q10];
        else if (numStones === 7) points = [hoshiMap.d4, hoshiMap.q16, hoshiMap.d16, hoshiMap.q4, hoshiMap.d10, hoshiMap.q10, hoshiMap.k10];
        else if (numStones === 8) points = [hoshiMap.d4, hoshiMap.q16, hoshiMap.d16, hoshiMap.q4, hoshiMap.d10, hoshiMap.q10, hoshiMap.k4, hoshiMap.k16];
        else if (numStones >= 9) points = [hoshiMap.d4, hoshiMap.q16, hoshiMap.d16, hoshiMap.q4, hoshiMap.d10, hoshiMap.q10, hoshiMap.k4, hoshiMap.k16, hoshiMap.k10];
      } else if (this.size === 13) {
        if (numStones >= 2) points.push(hoshiMap.d4, hoshiMap.k10);
        if (numStones >= 3) points.push(hoshiMap.k4);
        if (numStones >= 4) points.push(hoshiMap.d10);
        if (numStones >= 5) points.push(hoshiMap.g7);
      } else if (this.size === 9) {
        if (numStones >= 2) points.push(hoshiMap.c3, hoshiMap.g7);
        if (numStones >= 3) points.push(hoshiMap.g3);
        if (numStones >= 4) points.push(hoshiMap.c7);
        if (numStones >= 5) points.push(hoshiMap.e5);
      }
    }

    this.handicapStones = points;
    for (const pt of points) {
      this.board[pt.y][pt.x] = 1; // Black
    }
    this.history[0].board = this.cloneBoard();
    this.history[0].hash = this.getBoardHash();
    this.turn = 2; // White plays first in handicap game
  }

  getNeighbors(x, y) {
    const list = [];
    if (x > 0) list.push({ x: x - 1, y });
    if (x < this.size - 1) list.push({ x: x + 1, y });
    if (y > 0) list.push({ x, y: y - 1 });
    if (y < this.size - 1) list.push({ x, y: y + 1 });
    return list;
  }

  getGroup(startX, startY, board = this.board) {
    const color = board[startY][startX];
    if (color === 0) return { stones: [], liberties: new Set() };

    const visited = new Set();
    const stones = [];
    const liberties = new Set();
    const queue = [{ x: startX, y: startY }];
    visited.add(`${startX},${startY}`);

    while (queue.length > 0) {
      const { x, y } = queue.shift();
      stones.push({ x, y });

      for (const n of this.getNeighbors(x, y)) {
        const key = `${n.x},${n.y}`;
        const nColor = board[n.y][n.x];

        if (nColor === 0) {
          liberties.add(key);
        } else if (nColor === color && !visited.has(key)) {
          visited.add(key);
          queue.push(n);
        }
      }
    }

    return { stones, liberties };
  }

  playMove(x, y) {
    // If not at latest step, truncate forward history
    if (this.currentStep < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentStep + 1);
    }

    const player = this.turn;
    const opponent = 3 - player;

    // Handle PASS
    if (x === null || y === null) {
      const newStep = {
        step: this.history.length,
        player,
        coord: null,
        captures: [],
        comment: '',
        board: this.cloneBoard(),
        caps: { ...this.captures },
        hash: this.getBoardHash()
      };
      this.history.push(newStep);
      this.currentStep = this.history.length - 1;
      this.turn = opponent;
      return { success: true, isPass: true };
    }

    // Check bounds & occupancy
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
      return { success: false, error: 'Out of bounds' };
    }
    if (this.board[y][x] !== 0) {
      return { success: false, error: 'Point already occupied' };
    }

    // Speculatively place stone
    const testBoard = this.cloneBoard();
    testBoard[y][x] = player;

    // Check opponent captures
    let capturedStones = [];
    for (const n of this.getNeighbors(x, y)) {
      if (testBoard[n.y][n.x] === opponent) {
        const group = this.getGroup(n.x, n.y, testBoard);
        if (group.liberties.size === 0) {
          for (const s of group.stones) {
            testBoard[s.y][s.x] = 0;
            capturedStones.push({ ...s, color: opponent });
          }
        }
      }
    }

    // Check suicide rule
    const ownGroup = this.getGroup(x, y, testBoard);
    if (ownGroup.liberties.size === 0 && capturedStones.length === 0) {
      return { success: false, error: 'Suicide move is illegal' };
    }

    // Check Ko rule
    const newHash = this.getBoardHash(testBoard);
    if (this.currentStep >= 1) {
      const prevHash = this.history[this.currentStep - 1].hash;
      if (newHash === prevHash && capturedStones.length === 1) {
        return { success: false, error: 'Ko rule: cannot immediately recapture' };
      }
    }

    // Move is valid! Commit state
    this.board = testBoard;
    this.captures[player] += capturedStones.length;

    const moveNode = {
      step: this.history.length,
      player,
      coord: { x, y },
      captures: capturedStones,
      comment: '',
      board: this.cloneBoard(),
      caps: { ...this.captures },
      hash: newHash
    };

    this.history.push(moveNode);
    this.currentStep = this.history.length - 1;
    this.turn = opponent;

    return { success: true, move: moveNode };
  }

  jumpToStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.history.length) return false;
    this.currentStep = stepIndex;
    const node = this.history[stepIndex];
    this.board = node.board.map(r => [...r]);
    this.captures = { ...node.caps };

    if (stepIndex === 0) {
      this.turn = this.handicap >= 2 ? 2 : 1;
    } else {
      this.turn = 3 - node.player;
    }
    return true;
  }

  undo() {
    if (this.currentStep > 0) {
      return this.jumpToStep(this.currentStep - 1);
    }
    return false;
  }

  redo() {
    if (this.currentStep < this.history.length - 1) {
      return this.jumpToStep(this.currentStep + 1);
    }
    return false;
  }

  setComment(commentText) {
    if (this.history[this.currentStep]) {
      this.history[this.currentStep].comment = commentText;
    }
  }

  getComment() {
    return this.history[this.currentStep]?.comment || '';
  }

  toSgf() {
    return serializeGameToSgf(this);
  }

  loadSgf(sgfStr) {
    if (!sgfStr) return false;

    const clean = sgfStr.trim();
    if (!clean.startsWith('(')) return false;

    const getProp = (tag) => {
      const m = clean.match(new RegExp(`${tag}\\[((?:\\\\.|[^\\\\\\]])*)\\]`, 's'));
      return m ? unescapeSgf(m[1]) : null;
    };

    const sz = parseInt(getProp('SZ') || '19', 10);
    this.size = [19, 13, 9].includes(sz) ? sz : 19;
    this.reset();

    this.info.blackName = getProp('PB') || 'Black';
    this.info.blackRank = getProp('BR') || '';
    this.info.whiteName = getProp('PW') || 'White';
    this.info.whiteRank = getProp('WR') || '';
    this.info.komi = parseFloat(getProp('KM') || '6.5');
    this.info.date = getProp('DT') || new Date().toISOString().split('T')[0];
    this.info.event = getProp('EV') || '';
    this.info.result = getProp('RE') || '';
    const ru = (getProp('RU') || 'Japanese').trim();
    if (/^chinese/i.test(ru)) this.info.rules = 'Chinese';
    else if (/^aga/i.test(ru)) this.info.rules = 'AGA';
    else this.info.rules = 'Japanese';

    // Handicap
    const ha = parseInt(getProp('HA') || '0', 10);
    const abMatches = clean.match(/AB(\[[a-z]{2}\])+/g);
    if (abMatches) {
      const stones = [];
      const coordRegex = /\[([a-z]{2})\]/g;
      let m;
      while ((m = coordRegex.exec(abMatches.join(''))) !== null) {
        const c = this.sgfToCoord(m[1]);
        if (c) stones.push(c);
      }
      if (stones.length > 0) {
        this.handicap = stones.length;
        this.handicapStones = stones;
        for (const pt of stones) {
          this.board[pt.y][pt.x] = 1;
        }
        this.history[0].board = this.cloneBoard();
        this.history[0].hash = this.getBoardHash();
        this.turn = 2;
      }
    } else if (ha >= 2) {
      this.applyHandicap(ha);
    }

    // Parse moves: sequence of ;[BW]\[([a-z]{0,2})\](C\[...\])?
    const nodeRegex = /;([BW])\[([a-z]{0,2})\](?:C\[((?:\\.|[^\\\]])*)\])?/gs;
    let match;
    while ((match = nodeRegex.exec(clean)) !== null) {
      const colorChar = match[1];
      const coordStr = match[2];
      const commentRaw = match[3] || '';
      const comment = unescapeSgf(commentRaw);

      const expectedColor = colorChar === 'B' ? 1 : 2;
      this.turn = expectedColor;

      if (!coordStr || coordStr.length === 0 || (coordStr === 'tt' && this.size <= 19)) {
        this.playMove(null, null);
      } else {
        const c = this.sgfToCoord(coordStr);
        if (c) {
          this.playMove(c.x, c.y);
        } else {
          this.playMove(null, null);
        }
      }

      if (comment) {
        this.setComment(comment);
      }
    }

    return true;
  }
}
