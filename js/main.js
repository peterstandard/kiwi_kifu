/**
 * Kiwi Kifu - Main Application Controller
 */

import { GoGame } from './engine/game.js';
import { SoundFX } from './audio/sound.js';
import { BoardRenderer } from './board/renderer.js';
import { BoardGestures } from './board/gestures.js';
import { StorageService } from './services/storage.js';
import { WakeLockService } from './services/wakelock.js';
import { ShareService } from './services/share.js';
import { DimmerService } from './services/dimmer.js';
import { territoryScoring, finalTerritoryScore, areaScoring, finalAreaScore } from './services/goscorer.js';

export class KiwiKifuUI {
  constructor() {
    this.game = new GoGame(19);
    this.numbersMode = 'last1'; // 'none' | 'last1' | 'last10' | 'all'
    this.tapMode = 'instant'; // 'instant' | 'confirm'
    this.pendingMove = null; // { x, y }
    this.activeGameId = null; // tracks current loaded/saved game id

    // Territory Scoring state
    this.scoringMode = false;
    this.markedDead = null;
    this.scoringResult = null;
    this.territoryScoring = null;

    this.sound = new SoundFX();
    this.wakeLock = new WakeLockService((active, message) => {
      this.updateWakeLockUI();
      if (message) this.showToast(message);
    });

    this.initDOMElements();
    this.dimmer = new DimmerService(this.ambientDimOverlay);
    this.renderer = new BoardRenderer(this.elements);
    this.gestures = new BoardGestures(
      this.elements.svg,
      () => this.renderer.getMetrics(this.game.size),
      {
        onTap: (clientX, clientY) => this.handleTapAt(clientX, clientY),
        onTransformChange: (scale, panX, panY) => this.renderer.applyTransform(scale, panX, panY)
      }
    );

    this.attachEventListeners();

    this.loadCurrentGame();
    this.checkUrlHashGame();

    this.gestures.resetZoom();
    this.render();
    this.updateSoundUI();
    this.updateWakeLockUI();
    this.updateDimmerUI();
    this.registerServiceWorker();

    // Re-render once browser finishes flexbox layout
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.render();
      });
    }
  }

  initDOMElements() {
    this.elements = {
      svg: document.getElementById('go-board'),
      woodGroup: document.getElementById('board-wood'),
      gridGroup: document.getElementById('board-grid'),
      coordsGroup: document.getElementById('board-coords'),
      starPointsGroup: document.getElementById('board-star-points'),
      stonesGroup: document.getElementById('board-stones'),
      markersGroup: document.getElementById('board-markers'),
      interactiveGroup: document.getElementById('board-interactive'),
      zoomGroup: document.getElementById('board-zoom-group'),
      btnZoomReset: document.getElementById('btn-zoom-reset')
    };

    // Header & Status
    this.metaBadge = document.getElementById('game-meta-badge');
    this.badgeBlackName = document.getElementById('badge-black-name');
    this.badgeWhiteName = document.getElementById('badge-white-name');

    this.turnText = document.getElementById('turn-text');
    this.turnDot = document.getElementById('turn-dot');
    this.moveCounter = document.getElementById('move-counter');
    this.lastMoveCoord = document.getElementById('last-move-coord');
    this.capsBlack = document.getElementById('caps-black');
    this.capsWhite = document.getElementById('caps-white');
    this.commentInput = document.getElementById('move-comment-input');

    // Bottom Navigation
    this.btnFirst = document.getElementById('btn-first');
    this.btnUndo = document.getElementById('btn-undo');
    this.btnPass = document.getElementById('btn-pass');
    this.btnRedo = document.getElementById('btn-redo');
    this.btnLast = document.getElementById('btn-last');

    // Mode Toggles & Actions
    this.btnNumbers = document.getElementById('btn-toggle-numbers');
    this.numbersStatus = document.getElementById('numbers-status');
    this.btnTapMode = document.getElementById('btn-toggle-tapmode');
    this.tapModeStatus = document.getElementById('tapmode-status');
    this.btnNewGame = document.getElementById('btn-new-game');

    // Confirm Mode UI
    this.confirmBar = document.getElementById('confirm-bar');
    this.confirmCoordText = document.getElementById('confirm-coord-text');
    this.btnConfirmTap = document.getElementById('btn-confirm-tap');
    this.btnCancelTap = document.getElementById('btn-cancel-tap');

    // Zoom Controls
    this.btnZoomIn = document.getElementById('btn-zoom-in');
    this.btnZoomOut = document.getElementById('btn-zoom-out');
    this.btnZoomReset = document.getElementById('btn-zoom-reset');

    // Hamburger Dropdown
    this.btnMenuToggle = document.getElementById('btn-menu-toggle');
    this.wakeDotIndicator = document.getElementById('wake-dot-indicator');
    this.dropdownMenu = document.getElementById('dropdown-menu');

    this.menuItemShare = document.getElementById('menu-item-share');
    this.menuItemWake = document.getElementById('menu-item-wake');
    this.menuItemSound = document.getElementById('menu-item-sound');
    this.menuItemInfo = document.getElementById('menu-item-info');
    this.menuItemSaveOverwrite = document.getElementById('menu-item-save-overwrite');
    this.menuItemSaveCopy = document.getElementById('menu-item-save-copy');
    this.menuItemSgf = document.getElementById('menu-item-sgf');
    this.menuItemLibrary = document.getElementById('menu-item-library');
    this.menuItemScore = document.getElementById('menu-item-score');

    // Scoring Panel
    this.scoringPanel = document.getElementById('scoring-panel');
    this.scoringRulesetBadge = document.getElementById('scoring-ruleset-badge');
    this.scoreBlackName = document.getElementById('score-black-name');
    this.scoreWhiteName = document.getElementById('score-white-name');
    this.scoreBlackTotal = document.getElementById('score-black-total');
    this.scoreWhiteTotal = document.getElementById('score-white-total');
    this.scoreBlackTerr = document.getElementById('score-black-terr');
    this.scoreBlackCaps = document.getElementById('score-black-caps');
    this.scoreWhiteTerr = document.getElementById('score-white-terr');
    this.scoreWhiteCaps = document.getElementById('score-white-caps');
    this.scoreLeadBanner = document.getElementById('score-lead-banner');
    this.btnResetDead = document.getElementById('btn-reset-dead');
    this.btnCancelScoring = document.getElementById('btn-cancel-scoring');
    this.btnAcceptScore = document.getElementById('btn-accept-score');
    this.bottomControls = document.getElementById('bottom-controls');
    this.inputRuleset = document.getElementById('input-ruleset');

    this.menuWakeStatus = document.getElementById('menu-wake-status');
    this.menuItemDim = document.getElementById('menu-item-dim');
    this.menuDimStatus = document.getElementById('menu-dim-status');
    this.menuDimIcon = document.getElementById('menu-dim-icon');
    this.menuDimSliderBox = document.getElementById('menu-dim-slider-box');
    this.dimLevelPct = document.getElementById('dim-level-pct');
    this.inputDimSlider = document.getElementById('input-dim-slider');
    this.ambientDimOverlay = document.getElementById('ambient-dim-overlay');

    this.menuSoundStatus = document.getElementById('menu-sound-status');
    this.menuSoundIcon = document.getElementById('menu-sound-icon');

    // Modals
    this.modalInfo = document.getElementById('modal-info');
    this.modalSgf = document.getElementById('modal-sgf');
    this.modalLibrary = document.getElementById('modal-library');
    this.modalShare = document.getElementById('modal-share');

    this.qrCodeContainer = document.getElementById('qr-code-container');
    this.inputShareUrl = document.getElementById('input-share-url');
    this.btnCopyShareLink = document.getElementById('btn-copy-share-link');
    this.btnNativeShare = document.getElementById('btn-native-share');
    this.toastEl = document.getElementById('toast');
  }

  attachEventListeners() {
    // Navigation
    this.btnUndo?.addEventListener('click', () => { this.undo(); });
    this.btnRedo?.addEventListener('click', () => { this.redo(); });
    this.btnFirst?.addEventListener('click', () => { this.jumpTo(0); });
    this.btnLast?.addEventListener('click', () => { this.jumpTo(this.game.history.length - 1); });
    this.btnPass?.addEventListener('click', () => { this.pass(); });

    // Mode Toggles
    this.btnNumbers?.addEventListener('click', () => { this.cycleNumbersMode(); });
    this.btnTapMode?.addEventListener('click', () => { this.toggleTapMode(); });
    this.btnNewGame?.addEventListener('click', () => { this.confirmNewGame(); });

    // Confirm Mode Actions
    this.btnConfirmTap?.addEventListener('click', () => {
      if (this.pendingMove) {
        const { x, y } = this.pendingMove;
        this.pendingMove = null;
        this.hideConfirmBar();
        this.attemptPlay(x, y);
      }
    });
    this.btnCancelTap?.addEventListener('click', () => {
      this.pendingMove = null;
      this.hideConfirmBar();
      this.render();
    });

    // Comments
    this.commentInput?.addEventListener('input', (e) => {
      this.game.setComment(e.target.value);
      this.saveCurrentGame();
    });

    // Zoom Buttons
    this.btnZoomIn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.gestures.setZoom(this.gestures.scale * 1.35);
    });
    this.btnZoomOut?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.gestures.setZoom(this.gestures.scale / 1.35);
    });
    this.btnZoomReset?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.gestures.resetZoom();
    });

    // Hamburger Menu Toggle
    this.btnMenuToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdownMenu();
    });

    // Close dropdown when clicking outside
    window.addEventListener('click', (e) => {
      if (this.dropdownMenu && !this.dropdownMenu.classList.contains('hidden')) {
        if (!this.dropdownMenu.contains(e.target) && !this.btnMenuToggle.contains(e.target)) {
          this.dropdownMenu.classList.add('hidden');
        }
      }
    });

    // Menu Item Actions
    this.menuItemShare?.addEventListener('click', () => {
      this.dropdownMenu?.classList.add('hidden');
      this.openShareModal();
    });
    this.menuItemWake?.addEventListener('click', () => {
      this.wakeLock.toggle();
    });
    this.menuItemDim?.addEventListener('click', () => {
      const active = this.dimmer.toggleEnabled();
      this.updateDimmerUI();
      this.showToast(active ? 'Auto-Dim enabled (45s idle) 🌙' : 'Auto-Dim disabled');
    });
    this.inputDimSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (this.dimLevelPct) this.dimLevelPct.textContent = `${val}%`;
      this.dimmer.setLevel(val, false);
    });
    this.inputDimSlider?.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      this.dimmer.setLevel(val, true); // brief preview on release!
    });
    this.menuItemSound?.addEventListener('click', () => {
      this.toggleSound();
    });
    this.menuItemInfo?.addEventListener('click', () => {
      this.dropdownMenu?.classList.add('hidden');
      this.openInfoModal();
    });
    this.menuItemSaveOverwrite?.addEventListener('click', () => {
      this.dropdownMenu?.classList.add('hidden');
      this.saveGameOverwriteAction();
    });
    this.menuItemSaveCopy?.addEventListener('click', () => {
      this.dropdownMenu?.classList.add('hidden');
      this.saveGameCopyAction();
    });
    this.menuItemSgf?.addEventListener('click', () => {
      this.dropdownMenu?.classList.add('hidden');
      this.openSgfModal();
    });
    this.menuItemLibrary?.addEventListener('click', () => {
      this.dropdownMenu?.classList.add('hidden');
      this.openLibraryModal();
    });
    this.menuItemScore?.addEventListener('click', () => {
      this.dropdownMenu?.classList.add('hidden');
      this.startScoringMode();
    });

    this.btnResetDead?.addEventListener('click', () => { this.resetDeadStones(); });
    this.btnCancelScoring?.addEventListener('click', () => { this.exitScoringMode(); });
    this.btnAcceptScore?.addEventListener('click', () => { this.acceptScore(); });
    this.scoringRulesetBadge?.addEventListener('click', () => { this.cycleRuleset(); });

    this.inputRuleset?.addEventListener('change', (e) => {
      const newRules = e.target.value;
      const inputKomi = document.getElementById('input-komi');
      if (inputKomi) {
        const curKomi = parseFloat(inputKomi.value);
        if (newRules === 'Japanese' && (curKomi === 7.5 || isNaN(curKomi))) {
          inputKomi.value = '6.5';
        } else if ((newRules === 'Chinese' || newRules === 'AGA') && (curKomi === 6.5 || isNaN(curKomi))) {
          inputKomi.value = '7.5';
        }
      }
    });

    this.btnCopyShareLink?.addEventListener('click', () => { this.copyShareLink(); });
    this.btnNativeShare?.addEventListener('click', () => { this.handleNativeShare(); });

    // Modals
    this.metaBadge?.addEventListener('click', () => { this.openInfoModal(); });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = e.target.getAttribute('data-close');
        document.getElementById(modalId)?.classList.add('hidden');
      });
    });

    // Modal forms & actions
    document.getElementById('btn-save-info')?.addEventListener('click', () => { this.saveInfoForm(); });
    document.getElementById('btn-copy-sgf')?.addEventListener('click', () => { this.copySgfToClipboard(); });
    document.getElementById('btn-download-sgf')?.addEventListener('click', () => { this.downloadSgfFile(); });
    document.getElementById('btn-load-sgf-text')?.addEventListener('click', () => { this.loadSgfFromTextarea(); });
    document.getElementById('input-file-sgf')?.addEventListener('change', (e) => { this.handleSgfFileUpload(e); });
    document.getElementById('btn-clear-library')?.addEventListener('click', () => { this.clearLibrary(); });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }
      if (this.scoringMode) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.exitScoringMode();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.acceptScore();
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.undo();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.redo();
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.jumpTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.jumpTo(this.game.history.length - 1);
      } else if (e.key === ' ' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.pass();
      }
    });
  }

  render() {
    this.renderer.render(
      this.game,
      this.numbersMode,
      this.pendingMove,
      this.gestures.scale,
      this.gestures.panX,
      this.gestures.panY,
      {
        active: this.scoringMode,
        markedDead: this.markedDead,
        territory: this.territoryScoring
      }
    );
    this.updateUIStatus();
  }

  updateUIStatus() {
    const step = this.game.currentStep;
    const total = this.game.history.length - 1;
    const currentNode = this.game.history[step];

    // Turn
    const isBlackTurn = this.game.turn === 1;
    if (this.turnDot) this.turnDot.className = `stone-dot ${isBlackTurn ? 'black' : 'white'}`;
    if (this.turnText) this.turnText.textContent = `${isBlackTurn ? 'Black' : 'White'}'s turn`;

    // Move Counter & Last Move
    if (this.moveCounter) this.moveCounter.textContent = `Move ${step}${total > step ? ` / ${total}` : ''}`;

    if (this.lastMoveCoord) {
      if (!currentNode || !currentNode.coord) {
        this.lastMoveCoord.textContent = currentNode && currentNode.player ? 'Pass' : '-';
      } else {
        const p = currentNode.player === 1 ? 'B' : 'W';
        this.lastMoveCoord.textContent = `${p} ${this.game.coordToReadable(currentNode.coord.x, currentNode.coord.y)}`;
      }
    }

    // Captures
    if (this.capsBlack) this.capsBlack.textContent = this.game.captures[1];
    if (this.capsWhite) this.capsWhite.textContent = this.game.captures[2];

    // Comment
    if (this.commentInput) this.commentInput.value = this.game.getComment();

    // Nav Buttons disabled states
    if (this.btnFirst) this.btnFirst.disabled = step === 0;
    if (this.btnUndo) this.btnUndo.disabled = step === 0;
    if (this.btnRedo) this.btnRedo.disabled = step >= total;
    if (this.btnLast) this.btnLast.disabled = step >= total;

    // Badges
    if (this.badgeBlackName) this.badgeBlackName.textContent = this.game.info.blackName || 'Black';
    if (this.badgeWhiteName) this.badgeWhiteName.textContent = this.game.info.whiteName || 'White';
  }

  handleTapAt(clientX, clientY) {
    const pt = this.gestures.getBoardCoordinatesFromScreen(clientX, clientY);
    if (!pt) return;

    if (this.scoringMode) {
      this.handleScoringTap(pt.x, pt.y);
      return;
    }

    if (this.tapMode === 'confirm') {
      if (this.pendingMove && this.pendingMove.x === pt.x && this.pendingMove.y === pt.y) {
        this.pendingMove = null;
        this.hideConfirmBar();
        this.attemptPlay(pt.x, pt.y);
      } else {
        if (this.game.board[pt.y][pt.x] === 0) {
          this.pendingMove = pt;
          this.showConfirmBar(pt.x, pt.y);
          this.render();
        }
      }
    } else {
      this.attemptPlay(pt.x, pt.y);
    }
  }

  attemptPlay(x, y) {
    const res = this.game.playMove(x, y);
    if (!res.success) {
      this.showToast(res.error || 'Illegal move');
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
      return;
    }

    if (navigator.vibrate) navigator.vibrate(15);
    this.sound.playStone();
    this.saveCurrentGame();
    this.render();
  }

  pass() {
    if (this.scoringMode) return;
    this.game.playMove(null, null);
    const passedPlayer = this.game.turn === 1 ? 'White' : 'Black';
    this.showToast(`${passedPlayer} passed`);
    if (navigator.vibrate) navigator.vibrate(20);
    this.sound.playPass();
    this.saveCurrentGame();
    this.render();

    // Check consecutive passes (game over / ready to score)
    if (this.game.currentStep >= 2) {
      const cur = this.game.history[this.game.currentStep];
      const prev = this.game.history[this.game.currentStep - 1];
      if (cur.coord === null && prev.coord === null) {
        this.showToast('Both players passed! Opening scoring mode... 🧮', 2500);
        setTimeout(() => {
          if (!this.scoringMode) this.startScoringMode();
        }, 650);
      }
    }
  }

  undo() {
    if (this.scoringMode) this.exitScoringMode();
    if (this.game.undo()) {
      if (this.pendingMove) {
        this.pendingMove = null;
        this.hideConfirmBar();
      }
      this.render();
    }
  }

  redo() {
    if (this.scoringMode) this.exitScoringMode();
    if (this.game.redo()) {
      if (this.pendingMove) {
        this.pendingMove = null;
        this.hideConfirmBar();
      }
      this.render();
    }
  }

  jumpTo(step) {
    if (this.scoringMode) this.exitScoringMode();
    if (this.game.jumpToStep(step)) {
      if (this.pendingMove) {
        this.pendingMove = null;
        this.hideConfirmBar();
      }
      this.render();
    }
  }

  cycleNumbersMode() {
    const modes = ['last1', 'last10', 'all', 'none'];
    const labels = { none: 'Off', last1: 'Last 1', last10: 'Last 10', all: 'All' };
    const nextIdx = (modes.indexOf(this.numbersMode) + 1) % modes.length;
    this.numbersMode = modes[nextIdx];
    if (this.numbersStatus) this.numbersStatus.textContent = labels[this.numbersMode];
    this.render();
  }

  toggleTapMode() {
    if (this.tapMode === 'instant') {
      this.tapMode = 'confirm';
      if (this.tapModeStatus) this.tapModeStatus.textContent = 'Confirm';
      this.showToast('Confirm tap enabled (great for phones)');
    } else {
      this.tapMode = 'instant';
      if (this.tapModeStatus) this.tapModeStatus.textContent = 'Instant';
      this.pendingMove = null;
      this.hideConfirmBar();
      this.showToast('Instant tap enabled');
    }
    this.render();
  }

  showConfirmBar(x, y) {
    const readable = this.game.coordToReadable(x, y);
    const player = this.game.turn === 1 ? 'Black' : 'White';
    if (this.confirmCoordText) this.confirmCoordText.textContent = `${player} at ${readable}?`;
    this.confirmBar?.classList.remove('hidden');
  }

  hideConfirmBar() {
    this.confirmBar?.classList.add('hidden');
  }

  confirmNewGame() {
    if (this.scoringMode) this.exitScoringMode();
    if (this.game.history.length > 2) {
      if (!confirm('Start a new game? Current game will be saved to your library.')) {
        return;
      }
      this.archiveCurrentGame();
    }
    this.activeGameId = null;
    this.game.reset();
    this.gestures.resetZoom();
    this.saveCurrentGame();
    this.render();
    this.showToast('Started new game');
  }

  // --- Territory Scoring Mode ---

  startScoringMode() {
    let hasStones = false;
    for (let y = 0; y < this.game.size; y++) {
      for (let x = 0; x < this.game.size; x++) {
        if (this.game.board[y][x] !== 0) {
          hasStones = true;
          break;
        }
      }
      if (hasStones) break;
    }
    if (!hasStones) {
      this.showToast('Play stones on the board before scoring!');
      return;
    }

    this.scoringMode = true;
    this.markedDead = Array.from({ length: this.game.size }, () => Array(this.game.size).fill(false));

    // Hide standard play controls and show scoring panel
    this.bottomControls?.classList.add('hidden');
    this.commentBar?.classList.add('hidden');
    this.confirmBar?.classList.add('hidden');
    this.scoringPanel?.classList.remove('hidden');

    this.recalculateScore();
    this.render();
    this.showToast('Scoring Mode: Tap dead stone groups to toggle 🧮');
  }

  exitScoringMode() {
    this.scoringMode = false;
    this.markedDead = null;
    this.scoringResult = null;
    this.territoryScoring = null;

    this.scoringPanel?.classList.add('hidden');
    this.bottomControls?.classList.remove('hidden');
    this.commentBar?.classList.remove('hidden');

    this.render();
  }

  handleScoringTap(x, y) {
    const color = this.game.board[y][x];
    if (color === 0) return; // Only stone groups can be toggled dead

    const group = this.game.getGroup(x, y);
    const currentlyDead = !!this.markedDead[y][x];
    const nextState = !currentlyDead;

    for (const s of group.stones) {
      this.markedDead[s.y][s.x] = nextState;
    }

    if (navigator.vibrate) navigator.vibrate(12);
    this.sound.playStone();

    this.recalculateScore();
    this.render();
  }

  resetDeadStones() {
    this.markedDead = Array.from({ length: this.game.size }, () => Array(this.game.size).fill(false));
    this.recalculateScore();
    this.render();
    this.showToast('Reset all stones to alive');
  }

  cycleRuleset() {
    const current = (this.game.info.rules || 'Japanese').trim();
    let nextRules = 'Japanese';
    if (current === 'Japanese') nextRules = 'Chinese';
    else if (current === 'Chinese') nextRules = 'AGA';
    else nextRules = 'Japanese';

    this.game.info.rules = nextRules;

    // Update komi if on standard default
    const curKomi = parseFloat(this.game.info.komi);
    if (nextRules === 'Japanese' && (curKomi === 7.5 || isNaN(curKomi))) {
      this.game.info.komi = 6.5;
    } else if ((nextRules === 'Chinese' || nextRules === 'AGA') && (curKomi === 6.5 || isNaN(curKomi))) {
      this.game.info.komi = 7.5;
    }

    this.saveCurrentGame();
    this.recalculateScore();
    this.render();
    this.showToast(`Ruleset: ${nextRules} (Komi: ${this.game.info.komi}) 🧮`);
  }

  recalculateScore() {
    const rules = (this.game.info.rules || 'Japanese').trim();
    const isAreaScoring = rules === 'Chinese' || rules === 'AGA';
    const komi = parseFloat(this.game.info.komi) || (isAreaScoring ? 7.5 : 6.5);

    // Update ruleset indicator badge
    if (this.scoringRulesetBadge) {
      if (rules === 'Chinese') {
        this.scoringRulesetBadge.textContent = 'Chinese (Area)';
      } else if (rules === 'AGA') {
        this.scoringRulesetBadge.textContent = 'AGA (7.5k)';
      } else {
        this.scoringRulesetBadge.textContent = 'Japanese';
      }
      this.scoringRulesetBadge.title = `Current rules: ${rules}. Click to cycle (Japanese / Chinese / AGA)`;
    }

    if (isAreaScoring) {
      // --- Area Scoring (Chinese / AGA) ---
      this.territoryScoring = areaScoring(this.game.board, this.markedDead);
      this.scoringResult = finalAreaScore(this.game.board, this.markedDead, komi);

      let blackStones = 0;
      let whiteStones = 0;
      let blackTerr = 0;
      let whiteTerr = 0;

      for (let y = 0; y < this.game.size; y++) {
        for (let x = 0; x < this.game.size; x++) {
          const color = this.game.board[y][x];
          const isDead = !!this.markedDead[y][x];
          const areaColor = this.territoryScoring[y][x];

          if (color === 1 && !isDead) blackStones++;
          else if (color === 2 && !isDead) whiteStones++;

          if (color === 0 || isDead) {
            if (areaColor === 1) blackTerr++;
            else if (areaColor === 2) whiteTerr++;
          }
        }
      }

      if (this.scoreBlackTerr) this.scoreBlackTerr.textContent = `${blackStones} stones`;
      if (this.scoreBlackCaps) this.scoreBlackCaps.textContent = `${blackTerr} terr`;
      if (this.scoreWhiteTerr) this.scoreWhiteTerr.textContent = `${whiteStones} stones`;
      if (this.scoreWhiteCaps) this.scoreWhiteCaps.textContent = `${whiteTerr} terr (+${komi}k)`;
    } else {
      // --- Territory Scoring (Japanese) ---
      const blackCaps = this.game.captures[1] || 0;
      const whiteCaps = this.game.captures[2] || 0;

      this.territoryScoring = territoryScoring(this.game.board, this.markedDead);
      this.scoringResult = finalTerritoryScore(
        this.game.board,
        this.markedDead,
        blackCaps,
        whiteCaps,
        komi
      );

      let blackTerr = 0;
      let whiteTerr = 0;
      let deadBlack = 0;
      let deadWhite = 0;

      for (let y = 0; y < this.game.size; y++) {
        for (let x = 0; x < this.game.size; x++) {
          const terr = this.territoryScoring[y][x].isTerritoryFor;
          if (terr === 1) blackTerr++;
          else if (terr === 2) whiteTerr++;

          if (this.markedDead[y][x]) {
            if (this.game.board[y][x] === 1) deadBlack++;
            else if (this.game.board[y][x] === 2) deadWhite++;
          }
        }
      }

      if (this.scoreBlackTerr) this.scoreBlackTerr.textContent = `${blackTerr} terr`;
      if (this.scoreBlackCaps) this.scoreBlackCaps.textContent = `${blackCaps + deadWhite} caps`;
      if (this.scoreWhiteTerr) this.scoreWhiteTerr.textContent = `${whiteTerr} terr`;
      if (this.scoreWhiteCaps) this.scoreWhiteCaps.textContent = `${whiteCaps + deadBlack} caps (+${komi}k)`;
    }

    if (this.scoreBlackName) this.scoreBlackName.textContent = this.game.info.blackName || 'Black';
    if (this.scoreWhiteName) this.scoreWhiteName.textContent = this.game.info.whiteName || 'White';
    if (this.scoreBlackTotal) this.scoreBlackTotal.textContent = this.scoringResult.black.toFixed(1);
    if (this.scoreWhiteTotal) this.scoreWhiteTotal.textContent = this.scoringResult.white.toFixed(1);

    const diff = Math.abs(this.scoringResult.black - this.scoringResult.white);
    if (this.scoreLeadBanner) {
      if (this.scoringResult.black > this.scoringResult.white) {
        this.scoreLeadBanner.textContent = `Black leads by ${diff.toFixed(1)} pts 🏆`;
      } else if (this.scoringResult.white > this.scoringResult.black) {
        this.scoreLeadBanner.textContent = `White leads by ${diff.toFixed(1)} pts 🏆`;
      } else {
        this.scoreLeadBanner.textContent = `Tie / Jigo (0.0 pts)`;
      }
    }
  }

  acceptScore() {
    if (!this.scoringResult) return;
    const diff = Math.abs(this.scoringResult.black - this.scoringResult.white);
    let resultStr = '0';
    if (this.scoringResult.black > this.scoringResult.white) {
      resultStr = `B+${diff.toFixed(1)}`;
    } else if (this.scoringResult.white > this.scoringResult.black) {
      resultStr = `W+${diff.toFixed(1)}`;
    }

    this.game.info.result = resultStr;
    this.saveCurrentGame();
    this.exitScoringMode();
    this.showToast(`Score accepted: ${resultStr}! 🏆`);
  }

  // Modals & Storage
  openInfoModal() {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val ?? '';
    };
    setVal('input-black-name', this.game.info.blackName);
    setVal('input-black-rank', this.game.info.blackRank);
    setVal('input-white-name', this.game.info.whiteName);
    setVal('input-white-rank', this.game.info.whiteRank);
    setVal('input-board-size', this.game.size);
    setVal('input-handicap', this.game.handicap);
    setVal('input-ruleset', this.game.info.rules || 'Japanese');
    setVal('input-komi', this.game.info.komi);
    setVal('input-game-date', this.game.info.date);
    setVal('input-event-name', this.game.info.event);
    setVal('input-result', this.game.info.result);

    this.modalInfo?.classList.remove('hidden');
  }

  saveInfoForm() {
    const getVal = (id) => document.getElementById(id)?.value?.trim() || '';

    this.game.info.blackName = getVal('input-black-name') || 'Black';
    this.game.info.blackRank = getVal('input-black-rank');
    this.game.info.whiteName = getVal('input-white-name') || 'White';
    this.game.info.whiteRank = getVal('input-white-rank');
    this.game.info.rules = getVal('input-ruleset') || 'Japanese';
    this.game.info.komi = parseFloat(getVal('input-komi')) || 6.5;
    this.game.info.date = getVal('input-game-date') || new Date().toISOString().split('T')[0];
    this.game.info.event = getVal('input-event-name');
    this.game.info.result = getVal('input-result');

    const newSize = parseInt(getVal('input-board-size'), 10) || 19;
    const newHandicap = parseInt(getVal('input-handicap'), 10) || 0;

    if (newSize !== this.game.size) {
      if (confirm('Changing board size will reset the current game. Proceed?')) {
        this.game.size = newSize;
        this.gestures.resetZoom();
        if (newHandicap >= 2) {
          this.game.applyHandicap(newHandicap);
        } else {
          this.game.reset();
        }
      }
    } else if (newHandicap !== this.game.handicap) {
      if (confirm('Applying handicap will reset the current game. Proceed?')) {
        this.game.applyHandicap(newHandicap);
      }
    }

    this.modalInfo?.classList.add('hidden');
    this.saveCurrentGame();
    this.render();
    this.showToast('Game info updated');
  }

  openSgfModal() {
    const sgf = this.game.toSgf();
    const area = document.getElementById('textarea-sgf');
    if (area) area.value = sgf;
    this.modalSgf?.classList.remove('hidden');
  }

  copySgfToClipboard() {
    const text = document.getElementById('textarea-sgf')?.value || '';
    ShareService.copyToClipboard(text).then(() => {
      this.showToast('SGF copied to clipboard! 📋');
    }).catch(() => {
      this.showToast('Failed to copy, please copy manually');
    });
  }

  downloadSgfFile() {
    const sgf = this.game.toSgf();
    const date = this.game.info.date || 'game';
    const b = (this.game.info.blackName || 'Black').replace(/[\s\W]+/g, '_');
    const w = (this.game.info.whiteName || 'White').replace(/[\s\W]+/g, '_');
    const filename = `${date}_${b}_vs_${w}.sgf`;

    const blob = new Blob([sgf], { type: 'application/x-go-sgf;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast(`Downloaded ${filename}`);
  }

  loadSgfFromTextarea() {
    const text = document.getElementById('textarea-sgf')?.value?.trim();
    if (!text) {
      this.showToast('Please paste SGF text first');
      return;
    }

    if (this.game.history.length > 2) {
      this.archiveCurrentGame();
    }

    const success = this.game.loadSgf(text);
    if (success) {
      this.gestures.resetZoom();
      this.modalSgf?.classList.add('hidden');
      this.saveCurrentGame();
      this.render();
      this.showToast(`Loaded SGF (${this.game.history.length - 1} moves)`);
    } else {
      this.showToast('Failed to parse SGF. Check format.');
    }
  }

  handleSgfFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const area = document.getElementById('textarea-sgf');
      if (area) area.value = text;
      this.loadSgfFromTextarea();
    };
    reader.readAsText(file);
  }

  // Persistence
  saveCurrentGame() {
    StorageService.saveCurrentGame(this.game.toSgf());
  }

  loadCurrentGame() {
    const saved = StorageService.loadCurrentGame();
    if (saved) {
      this.game.loadSgf(saved);
    }
  }

  archiveCurrentGame() {
    StorageService.archiveGame(this.game);
  }

  openLibraryModal() {
    const listEl = document.getElementById('saved-games-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const library = StorageService.getLibrary();
    if (library.length === 0) {
      listEl.innerHTML = '<p class="section-note" style="padding:12px 0;">No archived games yet.</p>';
    } else {
      library.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = `saved-game-item ${item.isFavorite ? 'favorite' : ''}`;
        const favIcon = item.isFavorite ? '❤️' : '🤍';
        const favTitle = item.isFavorite ? 'Unfavorite game' : 'Favorite game';
        itemEl.innerHTML = `
          <button class="btn-fav-toggle" data-id="${item.id}" title="${favTitle}" aria-label="${favTitle}">
            ${favIcon}
          </button>
          <div class="saved-game-info" data-id="${item.id}">
            <div class="saved-game-title">${this.escapeHtml(item.black)} vs ${this.escapeHtml(item.white)}</div>
            <div class="saved-game-meta">${item.date || 'Unknown date'} • ${item.moves || 0} moves</div>
          </div>
          <div class="saved-game-actions">
            <button class="btn btn-secondary btn-sm load-game-btn" data-id="${item.id}">Open</button>
            <button class="btn btn-danger-icon btn-sm delete-game-btn" data-id="${item.id}" title="Delete game" aria-label="Delete game">🗑️</button>
          </div>
        `;
        listEl.appendChild(itemEl);
      });

      const handleOpen = (id) => {
        const target = library.find(g => g.id === id);
        if (target && target.sgf) {
          if (this.game.history.length > 2) this.archiveCurrentGame();
          this.game.loadSgf(target.sgf);
          this.activeGameId = target.id;
          this.gestures.resetZoom();
          this.saveCurrentGame();
          this.render();
          this.modalLibrary?.classList.add('hidden');
          this.showToast(`Opened: ${target.black} vs ${target.white}`);
        }
      };

      listEl.querySelectorAll('.load-game-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
          handleOpen(id);
        });
      });

      listEl.querySelectorAll('.saved-game-info').forEach(el => {
        el.addEventListener('click', (e) => {
          const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
          handleOpen(id);
        });
      });

      listEl.querySelectorAll('.btn-fav-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
          StorageService.toggleFavorite(id);
          this.openLibraryModal();
        });
      });

      listEl.querySelectorAll('.delete-game-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
          const target = library.find(g => g.id === id);
          const name = target ? `${target.black} vs ${target.white}` : 'this game';
          if (confirm(`Delete ${name} from your saved games?`)) {
            StorageService.deleteGame(id);
            if (this.activeGameId === id) this.activeGameId = null;
            this.openLibraryModal();
            this.showToast('Game deleted');
          }
        });
      });
    }

    this.modalLibrary?.classList.remove('hidden');
  }

  saveGameOverwriteAction() {
    if (this.game.history.length <= 1) {
      this.showToast('No moves to save yet');
      return;
    }
    const result = StorageService.saveGameOverwrite(this.game, this.activeGameId);
    if (result) {
      this.activeGameId = result.record.id;
      this.showToast(result.isNew ? 'Saved to library' : 'Saved (overwrote existing game)');
    } else {
      this.showToast('Failed to save game');
    }
  }

  saveGameCopyAction() {
    if (this.game.history.length <= 1) {
      this.showToast('No moves to save yet');
      return;
    }
    const record = StorageService.saveGameCopy(this.game);
    if (record) {
      this.activeGameId = record.id;
      this.showToast('Saved as new copy');
    } else {
      this.showToast('Failed to save game copy');
    }
  }

  clearLibrary() {
    if (confirm('Clear all archived games in this browser?')) {
      StorageService.clearLibrary();
      this.openLibraryModal();
      this.showToast('Library cleared');
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  showToast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, 2400);
  }

  toggleDropdownMenu() {
    this.updateWakeLockUI();
    this.updateSoundUI();
    this.dropdownMenu?.classList.toggle('hidden');
  }

  // Sound Controls
  toggleSound() {
    const isEnabled = this.sound.toggle();
    this.updateSoundUI();
    this.showToast(isEnabled ? 'Sound ON 🔊' : 'Sound muted 🔇');
  }

  updateSoundUI() {
    if (!this.menuSoundStatus) return;
    if (this.sound.enabled) {
      this.menuSoundStatus.textContent = 'ON';
      this.menuSoundStatus.classList.add('active');
      if (this.menuSoundIcon) this.menuSoundIcon.textContent = '🔊';
    } else {
      this.menuSoundStatus.textContent = 'OFF';
      this.menuSoundStatus.classList.remove('active');
      if (this.menuSoundIcon) this.menuSoundIcon.textContent = '🔇';
    }
  }

  updateWakeLockUI() {
    if (!this.menuWakeStatus) return;
    if (this.wakeLock.isActive()) {
      this.menuWakeStatus.textContent = 'ON';
      this.menuWakeStatus.classList.add('active');
      this.wakeDotIndicator?.classList.remove('hidden');
    } else {
      this.menuWakeStatus.textContent = 'OFF';
      this.menuWakeStatus.classList.remove('active');
      this.wakeDotIndicator?.classList.add('hidden');
    }
  }

  updateDimmerUI() {
    if (!this.dimmer) return;
    if (this.menuDimStatus) {
      if (this.dimmer.enabled) {
        this.menuDimStatus.textContent = 'ON';
        this.menuDimStatus.classList.add('active');
        this.menuDimSliderBox?.classList.remove('disabled');
      } else {
        this.menuDimStatus.textContent = 'OFF';
        this.menuDimStatus.classList.remove('active');
        this.menuDimSliderBox?.classList.add('disabled');
      }
    }
    if (this.dimLevelPct) {
      this.dimLevelPct.textContent = `${this.dimmer.level}%`;
    }
    if (this.inputDimSlider) {
      this.inputDimSlider.value = this.dimmer.level;
    }
  }

  // Share Modal & Direct Link
  async openShareModal() {
    const sgf = this.game.toSgf();
    const shareUrl = await ShareService.buildShareUrl(sgf);

    if (this.inputShareUrl) this.inputShareUrl.value = shareUrl;
    if (this.qrCodeContainer) {
      const qrRes = ShareService.generateQrSvg(shareUrl);
      this.qrCodeContainer.innerHTML = qrRes.html;
    }

    if (ShareService.isNativeShareSupported()) {
      this.btnNativeShare?.classList.remove('hidden');
    } else {
      this.btnNativeShare?.classList.add('hidden');
    }

    this.modalShare?.classList.remove('hidden');
  }

  copyShareLink() {
    const text = this.inputShareUrl?.value || '';
    ShareService.copyToClipboard(text).then(() => {
      this.showToast('Share link copied to clipboard! 🔗');
    }).catch(() => {
      this.inputShareUrl?.select();
      this.showToast('Please copy from text box');
    });
  }

  handleNativeShare() {
    const shareUrl = this.inputShareUrl?.value || '';
    const title = `${this.game.info.blackName} vs ${this.game.info.whiteName} - Kiwi Kifu`;
    ShareService.nativeShare({
      title,
      text: `Go Kifu (${this.game.history.length - 1} moves)`,
      url: shareUrl
    }).catch(() => {});
  }

  async checkUrlHashGame() {
    const decodedSgf = await ShareService.parseUrlHash();
    if (decodedSgf) {
      if (this.game.history.length > 2) {
        this.archiveCurrentGame();
      }
      const loaded = this.game.loadSgf(decodedSgf);
      if (loaded) {
        this.saveCurrentGame();
        this.render();
        this.showToast(`Loaded shared game (${this.game.history.length - 1} moves)! ♟️`);
        ShareService.clearUrlHash();
        return true;
      }
    }
    return false;
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // Silent catch for local non-HTTPS dev
      });
    }
  }
}

// Bootstrap
export function initApp() {
  if (!window.kiwiKifuApp && !window.simpleKifuApp) {
    const app = new KiwiKifuUI();
    window.kiwiKifuApp = app;
    window.simpleKifuApp = app;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
