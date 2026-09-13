/**
 * Kiwi Kifu - Core Go Rules & SGF Invariant Tests
 * Run with: node test.js
 */

import assert from 'node:assert';
import { GoGame } from './js/engine/game.js';
import { coordToSgf, sgfToCoord, coordToReadable } from './js/engine/sgf.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\n--- Kiwi Kifu Engine Tests ---');

test('Coordinate & SGF translations', () => {
  assert.strictEqual(coordToSgf(0, 0), 'aa');
  assert.strictEqual(coordToSgf(3, 15), 'dp');
  assert.strictEqual(coordToSgf(null, null), '');

  const pt = sgfToCoord('dp', 19);
  assert.deepStrictEqual(pt, { x: 3, y: 15 });

  assert.strictEqual(coordToReadable(3, 15, 19), 'D4');
  assert.strictEqual(coordToReadable(15, 3, 19), 'Q16');
  assert.strictEqual(coordToReadable(null, null, 19), 'Pass');
});

test('Basic moves and turn alternation', () => {
  const game = new GoGame(19);
  assert.strictEqual(game.turn, 1, 'Black starts first');

  const r1 = game.playMove(3, 15); // Black D4
  assert.strictEqual(r1.success, true);
  assert.strictEqual(game.board[15][3], 1);
  assert.strictEqual(game.turn, 2, 'Turn switches to White');

  const r2 = game.playMove(15, 3); // White Q16
  assert.strictEqual(r2.success, true);
  assert.strictEqual(game.board[3][15], 2);
  assert.strictEqual(game.turn, 1, 'Turn switches back to Black');
  assert.strictEqual(game.history.length, 3);
});

test('Single stone capture', () => {
  const game = new GoGame(9);
  game.playMove(0, 1); // B (0,1)
  game.playMove(0, 0); // W (0,0) - corner with 1 liberty remaining at (1,0)
  const cap = game.playMove(1, 0); // B (1,0) - removes last liberty

  assert.strictEqual(cap.success, true);
  assert.strictEqual(game.board[0][0], 0, 'Stone at (0,0) must be removed');
  assert.strictEqual(game.captures[1], 1, 'Black must have 1 capture');
});

test('Multi-stone group capture', () => {
  const game = new GoGame(9);
  // Surround 2 white stones at (2,2) and (2,3)
  game.playMove(1, 2); // B
  game.playMove(2, 2); // W (first stone of group)
  game.playMove(1, 3); // B
  game.playMove(2, 3); // W (second stone connected)
  game.playMove(3, 2); // B
  game.playMove(8, 8); // W pass-like move
  game.playMove(3, 3); // B
  game.playMove(8, 7); // W pass-like move
  game.playMove(2, 1); // B
  game.playMove(8, 6); // W pass-like move
  const cap = game.playMove(2, 4); // B delivers atari/capture

  assert.strictEqual(cap.success, true);
  assert.strictEqual(game.board[2][2], 0, 'Stone 1 of group removed');
  assert.strictEqual(game.board[3][2], 0, 'Stone 2 of group removed');
  assert.strictEqual(game.captures[1], 2, 'Black captures 2 stones');
});

test('Suicide rule enforcement', () => {
  const game = new GoGame(9);
  game.playMove(0, 1); // B
  game.playMove(5, 5); // W somewhere else
  game.playMove(1, 0); // B surrounds corner (0,0)
  
  // W plays (0,0) which has 0 liberties and captures nothing
  const res = game.playMove(0, 0);
  assert.strictEqual(res.success, false, 'Suicide move must be rejected');
  assert.strictEqual(game.board[0][0], 0, 'Board position remains empty');
  assert.strictEqual(game.turn, 2, 'Turn remains White');
});

test('Ko rule enforcement (immediate recapture prohibited)', () => {
  const game = new GoGame(19);
  // Standard Ko shape:
  game.playMove(1, 0); // B
  game.playMove(2, 0); // W
  game.playMove(0, 1); // B
  game.playMove(3, 1); // W
  game.playMove(1, 2); // B
  game.playMove(2, 2); // W
  game.playMove(2, 1); // B places at (2,1), liberty at (1,1)

  // White captures Black at (2,1) by playing (1,1)
  const wCapture = game.playMove(1, 1);
  assert.strictEqual(wCapture.success, true, 'White capture succeeds');
  assert.strictEqual(game.board[1][2], 0, 'Black stone at (2,1) was captured');
  assert.strictEqual(game.captures[2], 1);

  // Black immediately tries to recapture at (2,1)
  const koIllegal = game.playMove(2, 1);
  assert.strictEqual(koIllegal.success, false, 'Immediate Ko recapture is illegal');
  assert.ok(koIllegal.error.includes('Ko rule'), 'Returns Ko rule error');

  // Black plays elsewhere, White responds, now Black CAN capture
  game.playMove(10, 10); // B ko threat
  game.playMove(10, 11); // W answers
  const koLegal = game.playMove(2, 1); // B recaptures ko
  assert.strictEqual(koLegal.success, true, 'Recapture allowed after an intervening move');
});

test('Handicap setup and starting turn', () => {
  const game = new GoGame(19);
  game.applyHandicap(4);

  assert.strictEqual(game.handicap, 4);
  assert.strictEqual(game.turn, 2, 'White moves first in handicap game');
  assert.strictEqual(game.board[3][3], 1, 'Stone at D16');
  assert.strictEqual(game.board[15][3], 1, 'Stone at D4');
  assert.strictEqual(game.board[3][15], 1, 'Stone at Q16');
  assert.strictEqual(game.board[15][15], 1, 'Stone at Q4');
});

test('SGF export & import round-trip', () => {
  const game = new GoGame(19);
  game.info.blackName = 'Alice';
  game.info.whiteName = 'Bob';
  game.info.komi = 7.5;
  game.playMove(3, 15); // B D4
  game.setComment('Comment with [brackets] and \\slashes\\');
  game.playMove(15, 3); // W Q16
  game.playMove(null, null); // B Pass

  const exportedSgf = game.toSgf();
  assert.ok(exportedSgf.includes('PB[Alice]'));
  assert.ok(exportedSgf.includes('PW[Bob]'));
  assert.ok(exportedSgf.includes('KM[7.5]'));
  assert.ok(exportedSgf.includes(';W[pd]'));

  // Load into fresh instance
  const reloaded = new GoGame(19);
  const ok = reloaded.loadSgf(exportedSgf);
  assert.strictEqual(ok, true, 'SGF parsed successfully');
  assert.strictEqual(reloaded.info.blackName, 'Alice');
  assert.strictEqual(reloaded.info.whiteName, 'Bob');
  assert.strictEqual(reloaded.history.length, game.history.length);
  assert.strictEqual(reloaded.getBoardHash(), game.getBoardHash(), 'Board state identical');
});

console.log(`\nAll ${passed} invariant tests passed! 🎯\n`);
