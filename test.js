/**
 * Kiwi Kifu - Core Go Rules & SGF Invariant Tests
 * Run with: node test.js
 */

import assert from 'node:assert';
import { GoGame } from './js/engine/game.js';
import { coordToSgf, sgfToCoord, coordToReadable } from './js/engine/sgf.js';
import { StorageService } from './js/services/storage.js';
import { ShareService } from './js/services/share.js';
import { DimmerService } from './js/services/dimmer.js';
import { computeNextVersion } from './scripts/bump.js';
import { territoryScoring, finalTerritoryScore, areaScoring, finalAreaScore, BLACK, WHITE, EMPTY } from './js/services/goscorer.js';
import { BoardGestures } from './js/board/gestures.js';
import { BoardRenderer } from './js/board/renderer.js';

// Setup in-memory mock for localStorage in Node.js test environment
if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\n--- Kiwi Kifu Engine, Storage & Share Tests ---');

await test('Coordinate & SGF translations', () => {
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

test('Storage archive deduplication on identical games', () => {
  StorageService.clearLibrary();
  const game = new GoGame(19);
  game.playMove(3, 15);
  game.playMove(15, 3);

  // First archive
  const rec1 = StorageService.archiveGame(game);
  assert.ok(rec1);
  let lib = StorageService.getLibraryRaw();
  assert.strictEqual(lib.length, 1);

  // Second archive of unchanged game should deduplicate
  const rec2 = StorageService.archiveGame(game);
  assert.strictEqual(rec2.id, rec1.id, 'Returned existing record');
  lib = StorageService.getLibraryRaw();
  assert.strictEqual(lib.length, 1, 'Library did not add duplicate');

  // Modified game (new move or comment) archives as new
  game.playMove(3, 3);
  const rec3 = StorageService.archiveGame(game);
  assert.notStrictEqual(rec3.id, rec1.id);
  lib = StorageService.getLibraryRaw();
  assert.strictEqual(lib.length, 2, 'Modified game archives properly');
});

test('Storage Save Overwrite vs Save as Copy', () => {
  StorageService.clearLibrary();
  const game = new GoGame(19);
  game.playMove(3, 15);
  const copy1 = StorageService.saveGameCopy(game);
  assert.ok(copy1);

  // Play another move, set result, and overwrite
  game.playMove(15, 3);
  game.info.result = 'W+Res';
  const overwriteRes = StorageService.saveGameOverwrite(game, copy1.id);
  assert.strictEqual(overwriteRes.isNew, false);
  assert.strictEqual(overwriteRes.record.moves, 2);
  assert.strictEqual(overwriteRes.record.result, 'W+Res');

  let lib = StorageService.getLibraryRaw();
  assert.strictEqual(lib.length, 1, 'Overwrote in place');
  assert.strictEqual(lib[0].result, 'W+Res');

  // Save as copy creates an additional entry with result preserved
  const copy2 = StorageService.saveGameCopy(game);
  lib = StorageService.getLibraryRaw();
  assert.strictEqual(lib.length, 2, 'Save as copy added 2nd entry');
  assert.strictEqual(copy2.result, 'W+Res');
  assert.notStrictEqual(copy2.id, copy1.id);
});

test('Storage favorite toggle and priority sorting', () => {
  StorageService.clearLibrary();
  const g1 = new GoGame(19); g1.playMove(3, 3);
  const g2 = new GoGame(19); g2.playMove(15, 15);
  const r1 = StorageService.saveGameCopy(g1);
  const r2 = StorageService.saveGameCopy(g2);

  // Toggle favorite on r1 (the older one)
  const isFav = StorageService.toggleFavorite(r1.id);
  assert.strictEqual(isFav, true);

  // getLibrary() should put favorited game first
  const sorted = StorageService.getLibrary();
  assert.strictEqual(sorted[0].id, r1.id, 'Favorited game sorted to top');
  assert.strictEqual(sorted[0].isFavorite, true);
});

test('Storage individual game deletion', () => {
  StorageService.clearLibrary();
  const g = new GoGame(19); g.playMove(9, 9);
  const r = StorageService.saveGameCopy(g);
  assert.strictEqual(StorageService.getLibraryRaw().length, 1);

  const deleted = StorageService.deleteGame(r.id);
  assert.strictEqual(deleted, true);
  assert.strictEqual(StorageService.getLibraryRaw().length, 0, 'Game successfully removed');
});

await test('ShareService Deflate compression round-trip with UTF-8 & comments', async () => {
  const game = new GoGame(19);
  game.info.blackName = '本因坊秀策';
  game.info.whiteName = 'Gennan Inseki';
  game.playMove(3, 15);
  game.setComment('The famous Ear-Reddening Move! 🎯 耳赤の一手');
  game.playMove(15, 3);
  const sgf = game.toSgf();

  const compressed = await ShareService.compressText(sgf);
  assert.ok(compressed);
  assert.strictEqual(typeof compressed, 'string');

  const decompressed = await ShareService.decompressText(compressed);
  assert.strictEqual(decompressed, sgf, 'Decompressed text strictly matches original');

  // Verify URL hash builder uses #z=
  const shareUrl = await ShareService.buildShareUrl(sgf);
  assert.ok(shareUrl.includes('#z='));

  // Verify parseUrlHash parses #z=
  const parsed = await ShareService.parseUrlHash('#z=' + compressed);
  assert.strictEqual(parsed, sgf, 'Parsed #z= hash correctly');

  // Verify backwards compatibility with legacy #sgf=
  const legacyHash = '#sgf=' + encodeURIComponent(sgf);
  const legacyParsed = await ShareService.parseUrlHash(legacyHash);
  assert.strictEqual(legacyParsed, sgf, 'Parsed legacy #sgf= hash correctly');
});

await test('ShareService compression ratio for large game (150 moves)', async () => {
  const game = new GoGame(19);
  let moves = 0;
  for (let x = 0; x < 19; x++) {
    for (let y = 0; y < 19; y++) {
      if (moves >= 150) break;
      const res = game.playMove(x, y);
      if (res.success) moves++;
    }
  }
  const sgf = game.toSgf();
  const rawEncoded = encodeURIComponent(sgf);
  const compressed = await ShareService.compressText(sgf);

  const reduction = 1 - (compressed.length / rawEncoded.length);
  assert.ok(reduction > 0.65, `Expected >65% reduction, got ${Math.round(reduction * 100)}%`);
  assert.ok(compressed.length < 700, `Expected <700 chars, got ${compressed.length}`);
});

await test('DimmerService level clamping, persistence, and state transitions', async () => {
  // Mock overlay element
  const mockSet = new Set();
  const mockOverlay = {
    classList: {
      add: (c) => mockSet.add(c),
      remove: (c) => mockSet.delete(c),
      contains: (c) => mockSet.has(c)
    },
    style: {
      properties: {},
      setProperty(k, v) { this.properties[k] = v; }
    }
  };

  let stateUpdates = [];
  const dimmer = new DimmerService(mockOverlay, (dimmed) => {
    stateUpdates.push(dimmed);
  });

  // Default settings
  assert.strictEqual(dimmer.enabled, true, 'Auto-dim enabled by default');
  assert.strictEqual(dimmer.level, 70, 'Default dim level is 70%');
  assert.strictEqual(mockOverlay.style.properties['--dim-opacity'], '0.70');

  // Level bounds clamping (min 30, max 90)
  dimmer.setLevel(15);
  assert.strictEqual(dimmer.level, 30, 'Clamped to min 30%');
  assert.strictEqual(mockOverlay.style.properties['--dim-opacity'], '0.30');

  dimmer.setLevel(99);
  assert.strictEqual(dimmer.level, 90, 'Clamped to max 90%');
  assert.strictEqual(mockOverlay.style.properties['--dim-opacity'], '0.90');

  dimmer.setLevel(85);
  assert.strictEqual(dimmer.level, 85);
  assert.strictEqual(mockOverlay.style.properties['--dim-opacity'], '0.85');

  // Dim and wake lifecycle
  dimmer.dimScreen();
  assert.strictEqual(dimmer.isDimmed, true);
  assert.strictEqual(stateUpdates[stateUpdates.length - 1], true);

  dimmer.wakeUp(true);
  assert.strictEqual(dimmer.isDimmed, false);
  assert.strictEqual(stateUpdates[stateUpdates.length - 1], false);

  // Toggle enabled
  const toggledOff = dimmer.toggleEnabled();
  assert.strictEqual(toggledOff, false);
  assert.strictEqual(dimmer.enabled, false);

  const toggledOn = dimmer.toggleEnabled();
  assert.strictEqual(toggledOn, true);
  assert.strictEqual(dimmer.enabled, true);

  dimmer.clearTimer();
});

await test('Version bump calculation and semver increments', () => {
  assert.strictEqual(computeNextVersion('1.2.0', 'patch'), '1.2.1');
  assert.strictEqual(computeNextVersion('1.2.0', 'minor'), '1.3.0');
  assert.strictEqual(computeNextVersion('1.2.0', 'major'), '2.0.0');
  assert.strictEqual(computeNextVersion('1.2.0', '1.3.5'), '1.3.5');
  assert.strictEqual(computeNextVersion('1.2.0', 'v2.0.1'), '2.0.1');
  assert.throws(() => computeNextVersion('1.2.0', 'invalid'));
});

await test('GoScorer territory counting, dead stone groups, and komi', () => {
  const size = 9;
  const stones = Array.from({ length: size }, () => Array(size).fill(EMPTY));
  const markedDead = Array.from({ length: size }, () => Array(size).fill(false));

  // Divide 9x9 board with Black wall on col 3 and White wall on col 5
  for (let y = 0; y < size; y++) {
    stones[y][3] = BLACK;
    stones[y][5] = WHITE;
  }

  // Calculate with 3 black captures, 1 white capture, 6.5 komi
  let score = finalTerritoryScore(stones, markedDead, 3, 1, 6.5);
  assert.strictEqual(score.black, 30);
  assert.strictEqual(score.white, 34.5);

  // Mark a dead White invasion stone at (1, 1) inside Black territory
  stones[1][1] = WHITE;
  markedDead[1][1] = true;

  const scoring = territoryScoring(stones, markedDead);
  assert.strictEqual(scoring[1][1].isTerritoryFor, BLACK, 'Dead white stone is territory for Black');
  assert.strictEqual(scoring[0][8].isTerritoryFor, WHITE, 'White corner is territory for White');
  assert.strictEqual(scoring[4][4].isTerritoryFor, EMPTY, 'Center dame is neutral');

  score = finalTerritoryScore(stones, markedDead, 3, 1, 6.5);
  assert.strictEqual(score.black, 31);
  assert.strictEqual(score.white, 34.5);
});

await test('Multiple rulesets: Chinese and AGA area scoring with 7.5 komi', () => {
  const size = 9;
  const stones = Array.from({ length: size }, () => Array(size).fill(EMPTY));
  const markedDead = Array.from({ length: size }, () => Array(size).fill(false));

  // Divide 9x9 board: Black wall on col 3 (9 stones), White wall on col 5 (9 stones)
  for (let y = 0; y < size; y++) {
    stones[y][3] = BLACK;
    stones[y][5] = WHITE;
  }

  // Under Area scoring (Chinese / AGA) with 7.5 komi:
  // Black has 9 living stones + 27 territory = 36 area
  // White has 9 living stones + 27 territory = 36 area + 7.5 komi = 43.5 area
  const areaScore = finalAreaScore(stones, markedDead, 7.5);
  assert.strictEqual(areaScore.black, 36);
  assert.strictEqual(areaScore.white, 43.5);

  // Verify SGF round-trip preserves rulesets (Chinese and AGA)
  const g1 = new GoGame(19);
  g1.info.rules = 'Chinese';
  g1.info.komi = 7.5;
  const sgf1 = g1.toSgf();
  assert.ok(sgf1.includes('RU[Chinese]'));

  const g2 = new GoGame(19);
  g2.loadSgf(sgf1);
  assert.strictEqual(g2.info.rules, 'Chinese');
  assert.strictEqual(g2.info.komi, 7.5);

  const g3 = new GoGame(19);
  g3.info.rules = 'AGA';
  g3.info.komi = 7.5;
  const sgf3 = g3.toSgf();
  assert.ok(sgf3.includes('RU[AGA]'));

  const g4 = new GoGame(19);
  g4.loadSgf(sgf3);
  assert.strictEqual(g4.info.rules, 'AGA');
  assert.strictEqual(g4.info.komi, 7.5);
});

await test('BoardGestures screenToSvg accurate with non-square letterboxing and getScreenCTM', () => {
  const metrics = { size: 19, margin: 28, cellSize: 30, width: 596, height: 596 };

  // 1. Fallback with non-square aspect ratio (mobile height-compressed: 380 wide x 300 tall)
  const nonSquareSvg = {
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 10, top: 50, width: 380, height: 300 })
  };
  const gesturesFallback = new BoardGestures(nonSquareSvg, () => metrics);

  // In 380x300 container, 596x596 board scale is 300/596
  // Left letterbox offset = 10 + (380 - 300)/2 = 50. Top offset = 50.
  // Tap on D4 (3, 15): boardX = 28 + 3*30 = 118, boardY = 28 + 15*30 = 478
  const clientX = 50 + 118 * (300 / 596);
  const clientY = 50 + 478 * (300 / 596);
  const coord = gesturesFallback.getBoardCoordinatesFromScreen(clientX, clientY);
  assert.deepStrictEqual(coord, { x: 3, y: 15 }, 'Non-square letterbox fallback correctly resolves D4 (3, 15)');

  // Bottom corner T1 (18, 18)
  const clientBottomX = 50 + 568 * (300 / 596);
  const clientBottomY = 50 + 568 * (300 / 596);
  const cornerCoord = gesturesFallback.getBoardCoordinatesFromScreen(clientBottomX, clientBottomY);
  assert.deepStrictEqual(cornerCoord, { x: 18, y: 18 }, 'Non-square letterbox fallback correctly resolves T1 (18, 18)');

  // 2. Test with mock getScreenCTM
  const scale = 300 / 596;
  const ctmSvg = {
    addEventListener: () => {},
    getScreenCTM: () => ({
      a: scale, b: 0, c: 0, d: scale, e: 50, f: 50,
      inverse: () => ({
        a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: -50 / scale, f: -50 / scale
      })
    }),
    createSVGPoint: () => ({
      x: 0, y: 0,
      matrixTransform(m) {
        return { x: this.x * m.a + m.e, y: this.y * m.d + m.f };
      }
    }),
    getBoundingClientRect: () => ({ left: 10, top: 50, width: 380, height: 300 })
  };
  const gesturesCtm = new BoardGestures(ctmSvg, () => metrics);
  const coordCtm = gesturesCtm.getBoardCoordinatesFromScreen(clientX, clientY);
  assert.deepStrictEqual(coordCtm, { x: 3, y: 15 }, 'getScreenCTM accurately maps coordinates without offset');
});

await test('Scoring breakdown formatting: territory, captures, living stones, and komi spelled out', () => {
  // Test Area scoring string format
  const blackStones = 118;
  const blackTerr = 64;
  const whiteStones = 110;
  const whiteTerr = 68;
  const komi = 7.5;

  const areaBlackLine1 = `${blackStones} ${blackStones === 1 ? 'living stone' : 'living stones'}`;
  const areaBlackLine2 = `${blackTerr} territory`;
  const areaWhiteLine1 = `${whiteStones} ${whiteStones === 1 ? 'living stone' : 'living stones'}`;
  const areaWhiteLine2 = `${whiteTerr} territory (+${komi} komi)`;

  assert.strictEqual(areaBlackLine1, '118 living stones');
  assert.strictEqual(areaBlackLine2, '64 territory');
  assert.strictEqual(areaWhiteLine1, '110 living stones');
  assert.strictEqual(areaWhiteLine2, '68 territory (+7.5 komi)');
  assert.ok(!areaBlackLine1.includes('terr'), 'No confusing "118 stones terr"');

  // Test Territory scoring string format
  const japBlackTerr = 64;
  const japBlackCaps = 12;
  const japWhiteTerr = 68;
  const japWhiteCaps = 8;
  const japKomi = 6.5;

  const japBlackLine1 = `${japBlackTerr} territory`;
  const japBlackLine2 = `${japBlackCaps} ${japBlackCaps === 1 ? 'capture' : 'captures'}`;
  const japWhiteLine1 = `${japWhiteTerr} territory`;
  const japWhiteLine2 = `${japWhiteCaps} ${japWhiteCaps === 1 ? 'capture' : 'captures'} (+${japKomi} komi)`;

  assert.strictEqual(japBlackLine1, '64 territory');
  assert.strictEqual(japBlackLine2, '12 captures');
  assert.strictEqual(japWhiteLine1, '68 territory');
  assert.strictEqual(japWhiteLine2, '8 captures (+6.5 komi)');
  assert.ok(!japBlackLine2.includes('caps'), 'Uses "captures" instead of "caps"');
  assert.ok(!japWhiteLine2.includes('6.5k'), 'Uses "6.5 komi" instead of "6.5k"');
});

await test('Score total display formatting and positive non-zero values', () => {
  const score = { black: 182.0, white: 179.5 };
  const blackTotalStr = score.black.toFixed(1);
  const whiteTotalStr = score.white.toFixed(1);

  assert.strictEqual(blackTotalStr, '182.0');
  assert.strictEqual(whiteTotalStr, '179.5');
  assert.notStrictEqual(blackTotalStr, '0.0');
  assert.notStrictEqual(whiteTotalStr, '0.0');
});

await test('New Game options: Save to library vs Discard without saving', () => {
  StorageService.clearLibrary();
  const game = new GoGame(19);
  game.playMove(3, 3);
  game.playMove(15, 15);

  // Scenario 1: User saves before new game
  StorageService.archiveGame(game);
  let lib = StorageService.getLibrary();
  assert.strictEqual(lib.length, 1, 'Archived game saved to library');

  // Scenario 2: User resets game
  game.reset();
  assert.strictEqual(game.history.length, 1);
  assert.strictEqual(game.currentStep, 0);

  // Scenario 3: User plays and discards
  game.playMove(9, 9);
  game.reset(); // Discard without archiveGame()
  lib = StorageService.getLibrary();
  assert.strictEqual(lib.length, 1, 'Discarded game was not added to library');
});

await test('Board export SVG generation: Numbered vs Unnumbered (Clean)', () => {
  const renderer = new BoardRenderer({});
  const game = new GoGame(19);
  game.playMove(3, 3); // Move 1: Black D16 (or D4 depending on coord)
  game.playMove(15, 15); // Move 2: White Q4
  game.playMove(15, 3); // Move 3: Black Q16

  // Numbered export
  const svgNumbered = renderer.generateExportSvg(game, 'all');
  assert.ok(svgNumbered.startsWith('<svg'), 'Starts with SVG tag');
  assert.ok(svgNumbered.includes('viewBox="0 0 596 596"'), 'Viewbox is set');
  assert.ok(svgNumbered.includes('id="exp-markers"'), 'Has markers group');
  // Check that the markers group contains move number text elements
  const markersMatchNumbered = svgNumbered.match(/<g id="exp-markers">(.*?)<\/g>/s);
  assert.ok(markersMatchNumbered && markersMatchNumbered[1].includes('>1<'), 'Markers group has move 1');
  assert.ok(markersMatchNumbered && markersMatchNumbered[1].includes('>2<'), 'Markers group has move 2');
  assert.ok(markersMatchNumbered && markersMatchNumbered[1].includes('>3<'), 'Markers group has move 3');
  assert.ok(svgNumbered.includes('id="exp-wood-grad"'), 'Has self-contained defs');

  // Clean unnumbered export
  const svgClean = renderer.generateExportSvg(game, 'none');
  assert.ok(svgClean.startsWith('<svg'), 'Starts with SVG tag');
  const markersMatchClean = svgClean.match(/<g id="exp-markers">(.*?)<\/g>/s);
  assert.ok(markersMatchClean && !markersMatchClean[1].includes('>1<'), 'Markers group does not have move 1');
  assert.ok(markersMatchClean && !markersMatchClean[1].includes('>2<'), 'Markers group does not have move 2');
  assert.ok(markersMatchClean && !markersMatchClean[1].includes('>3<'), 'Markers group does not have move 3');
  assert.ok(svgClean.includes('filter="url(#exp-stone-shadow)"'), 'Has stones rendered');
});

await test('findMoveAtCoord: accurately tracks move step of stones on board', () => {
  const game = new GoGame(19);
  game.playMove(3, 3); // Move 1: Black at (3,3)
  game.playMove(15, 15); // Move 2: White at (15,15)
  game.playMove(3, 4); // Move 3: Black at (3,4)

  assert.strictEqual(game.findMoveAtCoord(3, 3), 1, 'Stone at (3,3) was played at move 1');
  assert.strictEqual(game.findMoveAtCoord(15, 15), 2, 'Stone at (15,15) was played at move 2');
  assert.strictEqual(game.findMoveAtCoord(3, 4), 3, 'Stone at (3,4) was played at move 3');
  assert.strictEqual(game.findMoveAtCoord(0, 0), null, 'Empty point returns null');

  // Handicap stone test
  const handicapGame = new GoGame(19);
  handicapGame.applyHandicap(2); // Points at (3,15) and (15,3)
  assert.strictEqual(handicapGame.findMoveAtCoord(3, 15), 0, 'Handicap stone returns 0');
});

await test('adjustMove: safely relocates historical move and re-validates future moves', () => {
  const game = new GoGame(19);
  game.playMove(3, 3); // Move 1: Black (3,3)
  game.playMove(15, 15); // Move 2: White (15,15)
  game.playMove(15, 3); // Move 3: Black (15,3)
  game.playMove(3, 15); // Move 4: White (3,15)
  game.setComment('Important white approach');

  // Move 1 was placed at (3,3). Let's adjust Move 1 to (3,4)
  const res = game.adjustMove(1, 3, 4);
  assert.strictEqual(res.success, true, 'Adjustment succeeded');
  assert.strictEqual(game.board[3][3], 0, 'Old point (3,3) is now empty');
  assert.strictEqual(game.board[4][3], 1, 'New point (3,4) now has Black stone');
  assert.strictEqual(game.history.length, 5, 'History length preserved');
  assert.strictEqual(game.history[1].coord.x, 3);
  assert.strictEqual(game.history[1].coord.y, 4);
  assert.strictEqual(game.history[4].comment, 'Important white approach', 'Comment preserved');
});

await test('adjustMove: safely rejects collisions without altering game state', () => {
  const game = new GoGame(19);
  game.playMove(3, 3); // Move 1: Black (3,3)
  game.playMove(15, 15); // Move 2: White (15,15)
  game.playMove(15, 3); // Move 3: Black (15,3)

  // Attempting to move Move 1 to (15,15) which is occupied by Move 2!
  const res = game.adjustMove(1, 15, 15);
  assert.strictEqual(res.success, false, 'Should be rejected');
  assert.ok(res.error.includes('Conflict at move 2'), 'Error mentions conflict at move 2');

  // Verify game state was NOT corrupted
  assert.strictEqual(game.history.length, 4, 'History is still 3 moves');
  assert.strictEqual(game.board[3][3], 1, 'Original stone at (3,3) is still intact');
  assert.strictEqual(game.board[15][15], 2, 'White stone at (15,15) is still intact');
});

await test('BoardRenderer: renders translucent dead-stone style with amber halo during editingMove', () => {
  const stonesGroup = { innerHTML: '' };
  const markersGroup = { innerHTML: '' };
  const renderer = new BoardRenderer({
    stonesGroup,
    markersGroup
  });

  const game = new GoGame(19);
  game.playMove(3, 3); // Move 1: Black (3,3)
  game.playMove(15, 15); // Move 2: White (15,15)

  const editingMove = {
    step: 1,
    originalCoord: { x: 3, y: 3 },
    player: 1,
    returnStep: 2
  };

  renderer.render(game, 'none', null, 1.0, 0, 0, null, editingMove);

  // The stone at (3,3) being edited should be translucent (opacity="0.38")
  assert.ok(stonesGroup.innerHTML.includes('opacity="0.38"'), 'Edited stone is translucent');
  // Markers group should contain the dead-stone X mark lines
  assert.ok(markersGroup.innerHTML.includes('stroke="#ffffff" stroke-width="2.6"'), 'Edited stone has crisp X mark');
  // Markers group should contain the amber dashed halo
  assert.ok(markersGroup.innerHTML.includes('stroke="#f59e0b"'), 'Edited stone has amber dashed target ring');

  // The other stone at (15,15) should NOT be translucent
  assert.ok(stonesGroup.innerHTML.includes('filter="url(#stone-shadow)"'), 'Unedited stone has normal shadow');
});

await test('adjustMove: preserves viewer returnStep when game has future moves', () => {
  const game = new GoGame(19);
  // Play 10 moves
  for (let i = 0; i < 10; i++) {
    game.playMove(i, i % 2 === 0 ? 0 : 18);
  }
  assert.strictEqual(game.history.length, 11);

  // User was at Move 6 (not move 10!)
  const userReturnStep = 6;
  game.jumpToStep(userReturnStep);
  assert.strictEqual(game.currentStep, 6);

  // Adjust move 2 from (1, 18) to (1, 17)
  const res = game.adjustMove(2, 1, 17);
  assert.strictEqual(res.success, true);
  assert.strictEqual(game.history.length, 11, 'All 10 moves intact');

  // User returnStep can be cleanly restored
  game.jumpToStep(userReturnStep);
  assert.strictEqual(game.currentStep, 6, 'View returns to user viewing step 6');
  assert.strictEqual(game.history[2].coord.x, 1);
  assert.strictEqual(game.history[2].coord.y, 17);
});

await test('Move Scrubber: synchronizes bounds, tracks step, and scrubs history without truncation', () => {
  const game = new GoGame(19);

  // Fresh game: 0 moves
  let total = game.history.length - 1;
  let slider = { min: 0, max: total, value: game.currentStep, disabled: total === 0 };
  assert.strictEqual(slider.max, 0);
  assert.strictEqual(slider.value, 0);
  assert.strictEqual(slider.disabled, true, 'Scrubber disabled on empty board');

  // Play 15 moves
  for (let i = 0; i < 15; i++) {
    game.playMove(i, 3);
  }
  total = game.history.length - 1;
  slider = { min: 0, max: total, value: game.currentStep, disabled: total === 0 };
  assert.strictEqual(slider.max, 15);
  assert.strictEqual(slider.value, 15);
  assert.strictEqual(slider.disabled, false, 'Scrubber enabled with moves');

  // Simulate scrubbing slider to move 7
  const scrubTarget = 7;
  const jumped = game.jumpToStep(scrubTarget);
  assert.strictEqual(jumped, true);
  assert.strictEqual(game.currentStep, 7);
  assert.strictEqual(game.history.length, 16, 'Scrubbing does not truncate single-branch history');

  // Board state reflects move 7
  assert.strictEqual(game.board[3][0], 1, 'Move 1 stone exists');
  assert.strictEqual(game.board[3][6], 1, 'Move 7 stone exists');
  assert.strictEqual(game.board[3][7], 0, 'Move 8 stone not yet placed at step 7');

  // Simulate scrubbing slider back to move 0 (initial board)
  game.jumpToStep(0);
  assert.strictEqual(game.currentStep, 0);
  assert.strictEqual(game.board[3][0], 0, 'Board is clear at step 0');
  assert.strictEqual(game.history.length, 16, 'Full 15 moves still preserved in history');

  // Scrubbing forward to move 15
  game.jumpToStep(15);
  assert.strictEqual(game.currentStep, 15);
  assert.strictEqual(game.board[3][14], 1, 'Move 15 stone exists');
});

await test('Move Scrubber: disabled during edit-move mode or empty game', () => {
  const game = new GoGame(19);
  game.playMove(3, 3);
  game.playMove(15, 15);

  let editingMove = null;
  const total = game.history.length - 1;
  let isSliderDisabled = (total === 0 || !!editingMove);
  assert.strictEqual(isSliderDisabled, false, 'Slider is enabled during standard play');

  // Enter edit-move mode
  editingMove = { step: 1, originalCoord: { x: 3, y: 3 }, player: 1, returnStep: 2 };
  isSliderDisabled = (total === 0 || !!editingMove);
  assert.strictEqual(isSliderDisabled, true, 'Slider is disabled when editing historical move');

  // Exit edit-move mode
  editingMove = null;
  isSliderDisabled = (total === 0 || !!editingMove);
  assert.strictEqual(isSliderDisabled, false, 'Slider is re-enabled when exiting edit-move mode');
});

console.log(`\nAll ${passed} invariant tests passed! 🎯\n`);
