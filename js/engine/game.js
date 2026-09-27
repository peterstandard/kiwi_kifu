/**
 * Kiwi Kifu - Core Go Rules Engine & Game State
 * Supports linear recording mode and full branching review mode.
 */

import { HOSHI_POINTS } from './constants.js';
import {
  coordToSgf,
  sgfToCoord,
  coordToReadable,
  escapeSgf,
  unescapeSgf,
  parseSgf,
  serializeGameToSgf
} from './sgf.js';

export class GoGame {
  constructor(size = 19) {
    this.size = size;
    this.mode = 'recording'; // 'recording' | 'review'
    this.nodeIdCounter = 0;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(0));
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

    // Root node (step 0, initial board)
    this.rootNode = {
      id: ++this.nodeIdCounter,
      step: 0,
      player: 0,
      coord: null,
      captures: [],
      comment: '',
      board: this.cloneBoard(),
      caps: { 1: 0, 2: 0 },
      hash: this.getBoardHash(),
      parent: null,
      children: []
    };

    this.currentNode = this.rootNode;
    this.history = [this.rootNode];
    this.currentStep = 0;
  }

  cloneBoard(b = this.board) {
    return b.map(row => [...row]);
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

  setMode(mode) {
    if (mode === 'recording' || mode === 'review') {
      this.mode = mode;
    }
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
    this.rootNode.board = this.cloneBoard();
    this.rootNode.hash = this.getBoardHash();
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

  /**
   * Rebuilds this.history so that it traces from this.rootNode down to targetNode,
   * and then down to the leaf of the active branch following children[0].
   */
  rebuildHistory(targetNode = this.currentNode) {
    if (!targetNode) return;

    // 1. Trace ancestors from targetNode up to root
    const ancestors = [];
    let cur = targetNode;
    while (cur) {
      ancestors.unshift(cur);
      cur = cur.parent;
    }

    // 2. Trace descendants from targetNode down following primary child (children[0])
    const descendants = [];
    let child = targetNode.children && targetNode.children.length > 0 ? targetNode.children[0] : null;
    while (child) {
      descendants.push(child);
      child = child.children && child.children.length > 0 ? child.children[0] : null;
    }

    this.history = [...ancestors, ...descendants];
    for (let i = 0; i < this.history.length; i++) {
      this.history[i].step = i;
    }

    this.currentNode = targetNode;
    this.currentStep = targetNode.step;
    this.board = targetNode.board.map(r => [...r]);
    this.captures = { ...targetNode.caps };

    if (this.currentStep === 0) {
      this.turn = this.handicap >= 2 ? 2 : 1;
    } else {
      this.turn = 3 - targetNode.player;
    }
  }

  playMove(x, y) {
    const parentNode = this.history[this.currentStep] || this.currentNode;
    const player = this.turn;
    const opponent = 3 - player;

    // In Review Mode: check if an identical move already exists as a child of parentNode
    if (this.mode === 'review' && parentNode && parentNode.children) {
      const existingChild = parentNode.children.find(c => {
        if (x === null || y === null) return c.coord === null;
        return c.coord && c.coord.x === x && c.coord.y === y;
      });
      if (existingChild) {
        this.rebuildHistory(existingChild);
        return { success: true, move: existingChild, isBranch: false };
      }
    }

    // Handle PASS
    if (x === null || y === null) {
      const newStep = {
        id: ++this.nodeIdCounter,
        step: parentNode.step + 1,
        player,
        coord: null,
        captures: [],
        comment: '',
        board: this.cloneBoard(parentNode.board),
        caps: { ...parentNode.caps },
        hash: parentNode.hash,
        parent: parentNode,
        children: []
      };

      if (this.mode === 'recording') {
        parentNode.children = [newStep];
      } else {
        parentNode.children.push(newStep);
      }

      this.rebuildHistory(newStep);
      return { success: true, isPass: true, move: newStep };
    }

    // Check bounds & occupancy
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
      return { success: false, error: 'Out of bounds' };
    }
    if (parentNode.board[y][x] !== 0) {
      return { success: false, error: 'Point already occupied' };
    }

    // Speculatively place stone
    const testBoard = this.cloneBoard(parentNode.board);
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

    // Check Ko rule (against board state before parent move)
    const newHash = this.getBoardHash(testBoard);
    if (parentNode.parent) {
      const prevHash = parentNode.parent.hash;
      if (newHash === prevHash && capturedStones.length === 1) {
        return { success: false, error: 'Ko rule: cannot immediately recapture' };
      }
    }

    // Move is valid! Commit state
    const newCaps = { ...parentNode.caps };
    newCaps[player] += capturedStones.length;

    const moveNode = {
      id: ++this.nodeIdCounter,
      step: parentNode.step + 1,
      player,
      coord: { x, y },
      captures: capturedStones,
      comment: '',
      board: testBoard,
      caps: newCaps,
      hash: newHash,
      parent: parentNode,
      children: []
    };

    if (this.mode === 'recording') {
      parentNode.children = [moveNode];
    } else {
      parentNode.children.push(moveNode);
    }

    this.rebuildHistory(moveNode);
    return { success: true, move: moveNode };
  }

  jumpToStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.history.length) return false;
    this.currentStep = stepIndex;
    const node = this.history[stepIndex];
    this.currentNode = node;
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
    const node = this.history[this.currentStep];
    if (node) {
      node.comment = commentText;
    }
  }

  getComment() {
    return this.history[this.currentStep]?.comment || '';
  }

  /**
   * Returns child variation information at the currently viewed node.
   * e.g. [{ index: 0, letter: 'A', coord: {x,y}, player: 1, node }]
   */
  getBranchesAtCurrent() {
    const node = this.currentNode;
    if (!node || !node.children || node.children.length === 0) return [];

    return node.children.map((child, index) => {
      const letter = String.fromCharCode(65 + index); // 'A', 'B', 'C'...
      return {
        index,
        letter,
        coord: child.coord,
        player: child.player,
        node: child
      };
    });
  }

  /**
   * Returns branch info if the user is currently viewing inside a non-main-line variation.
   */
  getCurrentBranchInfo() {
    let cur = this.currentNode;
    let forkNode = null;
    let branchFirstNode = null;

    // Walk up ancestors
    while (cur && cur.parent) {
      const parent = cur.parent;
      const childIndex = parent.children.indexOf(cur);
      if (childIndex > 0) {
        forkNode = parent;
        branchFirstNode = cur;
      }
      cur = parent;
    }

    if (!forkNode || !branchFirstNode) {
      return null; // On main line
    }

    // Determine branch letter (A=0, B=1, C=2...)
    const forkIndex = forkNode.children.indexOf(branchFirstNode);
    const branchLetter = String.fromCharCode(65 + Math.max(0, forkIndex));

    // Collect all nodes in this branch line
    const branchNodes = [];
    let bCur = branchFirstNode;
    while (bCur) {
      branchNodes.push(bCur);
      bCur = bCur.children && bCur.children.length > 0 ? bCur.children[0] : null;
    }

    const currentBranchIndex = branchNodes.indexOf(this.currentNode);

    return {
      forkNode,
      branchFirstNode,
      branchLetter,
      branchNodes,
      currentBranchIndex: currentBranchIndex !== -1 ? currentBranchIndex : 0,
      totalMoves: branchNodes.length
    };
  }

  switchToMainLine() {
    const mainNodes = [];
    let cur = this.rootNode;
    while (cur) {
      mainNodes.push(cur);
      cur = cur.children && cur.children.length > 0 ? cur.children[0] : null;
    }
    this.history = mainNodes;
    for (let i = 0; i < this.history.length; i++) {
      this.history[i].step = i;
    }
    const targetStep = Math.min(this.currentStep, this.history.length - 1);
    this.jumpToStep(targetStep);
  }

  switchToBranch(childIndex) {
    const parentNode = this.currentNode;
    if (!parentNode || !parentNode.children || !parentNode.children[childIndex]) return false;
    const targetChild = parentNode.children[childIndex];
    this.rebuildHistory(targetChild);
    return true;
  }

  promoteBranch(branchFirstNode) {
    if (!branchFirstNode || !branchFirstNode.parent) return false;
    let cur = branchFirstNode;
    while (cur && cur.parent) {
      const parent = cur.parent;
      const idx = parent.children.indexOf(cur);
      if (idx > 0) {
        parent.children.splice(idx, 1);
        parent.children.unshift(cur);
      }
      cur = parent;
    }
    this.rebuildHistory(this.currentNode);
    return true;
  }

  deleteBranchNode(node) {
    if (!node || !node.parent) return false;
    const parent = node.parent;
    const idx = parent.children.indexOf(node);
    if (idx !== -1) {
      parent.children.splice(idx, 1);
    }
    this.rebuildHistory(parent);
    return true;
  }

  hasBranches() {
    function checkNode(node) {
      if (!node || !node.children) return false;
      if (node.children.length > 1) return true;
      for (const child of node.children) {
        if (checkNode(child)) return true;
      }
      return false;
    }
    return checkNode(this.rootNode);
  }

  toSgf() {
    return serializeGameToSgf(this);
  }

  createNodeFromParent(parentNode, player, coord, comment = '') {
    const testBoard = this.cloneBoard(parentNode.board);
    let capturedStones = [];
    const newCaps = { ...parentNode.caps };

    if (coord && coord.x !== null && coord.y !== null) {
      const { x, y } = coord;
      const opponent = 3 - player;
      testBoard[y][x] = player;

      // captures
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
      newCaps[player] += capturedStones.length;
    }

    const newHash = this.getBoardHash(testBoard);

    return {
      id: ++this.nodeIdCounter,
      step: parentNode.step + 1,
      player,
      coord,
      captures: capturedStones,
      comment: comment || '',
      board: testBoard,
      caps: newCaps,
      hash: newHash,
      parent: parentNode,
      children: []
    };
  }

  loadSgf(sgfStr) {
    if (!sgfStr) return false;

    const parsedTree = parseSgf(sgfStr.trim());
    if (!parsedTree || !parsedTree.sequence || parsedTree.sequence.length === 0) {
      return false;
    }

    const rootProps = parsedTree.sequence[0];
    const getProp = (tag) => (rootProps[tag] && rootProps[tag][0] ? rootProps[tag][0] : null);

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
    const abVals = rootProps.AB || [];
    if (abVals.length > 0) {
      const stones = [];
      for (const val of abVals) {
        const c = this.sgfToCoord(val);
        if (c) stones.push(c);
      }
      if (stones.length > 0) {
        this.handicap = stones.length;
        this.handicapStones = stones;
        for (const pt of stones) {
          this.board[pt.y][pt.x] = 1;
        }
        this.rootNode.board = this.cloneBoard();
        this.rootNode.hash = this.getBoardHash();
        this.turn = 2;
      }
    } else if (ha >= 2) {
      this.applyHandicap(ha);
    }

    // Recursively replay sequence and subtrees into game tree
    const replayTree = (tree, parentNode, isFirstTree) => {
      const startIdx = isFirstTree ? 1 : 0;
      let curParent = parentNode;

      for (let i = startIdx; i < tree.sequence.length; i++) {
        const props = tree.sequence[i];
        let player = 0;
        let coordStr = '';
        if (props.B) {
          player = 1;
          coordStr = props.B[0] || '';
        } else if (props.W) {
          player = 2;
          coordStr = props.W[0] || '';
        } else {
          continue;
        }

        const comment = props.C ? props.C[0] : '';
        let coord = null;
        if (coordStr && coordStr !== 'tt') {
          coord = this.sgfToCoord(coordStr);
        }

        const childNode = this.createNodeFromParent(curParent, player, coord, comment);
        curParent.children.push(childNode);
        curParent = childNode;
      }

      if (tree.subTrees && tree.subTrees.length > 0) {
        for (const sub of tree.subTrees) {
          replayTree(sub, curParent, false);
        }
      }
    };

    replayTree(parsedTree, this.rootNode, true);

    // Default to Review Mode on SGF load
    this.mode = 'review';
    this.switchToMainLine();
    this.jumpToStep(this.history.length - 1);
    return true;
  }

  findMoveAtCoord(x, y, atStep = this.currentStep) {
    if (atStep < 0 || atStep >= this.history.length) return null;
    const color = this.board[y] ? this.board[y][x] : 0;
    if (!color) return null;

    for (let i = atStep; i >= 1; i--) {
      const node = this.history[i];
      if (node && node.coord && node.coord.x === x && node.coord.y === y && node.player === color) {
        return i;
      }
    }

    if (this.handicapStones && this.handicapStones.some(pt => pt.x === x && pt.y === y)) {
      return 0;
    }

    return null;
  }

  adjustMove(stepIndex, newX, newY) {
    if (stepIndex <= 0 || stepIndex >= this.history.length) {
      return { success: false, error: 'Invalid move step' };
    }
    const targetNode = this.history[stepIndex];
    if (!targetNode || !targetNode.coord) {
      return { success: false, error: 'Cannot adjust a pass move' };
    }
    if (targetNode.coord.x === newX && targetNode.coord.y === newY) {
      return { success: false, error: 'New location is the same as current' };
    }
    if (newX < 0 || newX >= this.size || newY < 0 || newY >= this.size) {
      return { success: false, error: 'Out of bounds' };
    }

    const testGame = new GoGame(this.size);
    testGame.info = { ...this.info };
    if (this.handicap >= 2) {
      testGame.applyHandicap(this.handicap);
    }

    for (let i = 1; i < stepIndex; i++) {
      const node = this.history[i];
      if (node.coord) {
        const res = testGame.playMove(node.coord.x, node.coord.y);
        if (!res.success) {
          return { success: false, error: `Internal replay error at move ${i}: ${res.error}` };
        }
      } else {
        testGame.playMove(null, null);
      }
      testGame.history[i].comment = node.comment || '';
    }

    const resAdjusted = testGame.playMove(newX, newY);
    if (!resAdjusted.success) {
      return { success: false, error: `Illegal move at step ${stepIndex}: ${resAdjusted.error}` };
    }
    testGame.history[stepIndex].comment = targetNode.comment || '';

    for (let i = stepIndex + 1; i < this.history.length; i++) {
      const node = this.history[i];
      if (node.coord) {
        const res = testGame.playMove(node.coord.x, node.coord.y);
        if (!res.success) {
          const playerName = node.player === 1 ? 'Black' : 'White';
          const coordName = this.coordToReadable(node.coord.x, node.coord.y);
          return {
            success: false,
            error: `Conflict at move ${i} (${playerName} at ${coordName}): ${res.error}`
          };
        }
      } else {
        testGame.playMove(null, null);
      }
      testGame.history[i].comment = node.comment || '';
    }

    const prevStep = this.currentStep;
    this.history = testGame.history;
    this.rootNode = testGame.rootNode;
    this.currentNode = testGame.currentNode;
    this.board = testGame.board;
    this.captures = testGame.captures;
    this.turn = testGame.turn;
    this.currentStep = Math.min(prevStep, this.history.length - 1);
    this.jumpToStep(this.currentStep);

    return { success: true, count: this.history.length - 1 };
  }
}
