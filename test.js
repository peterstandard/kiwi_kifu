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

console.log(`\nAll ${passed} invariant tests passed! 🎯\n`);
