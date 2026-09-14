/**
 * Kiwi Kifu - Ambient Idle Dimmer Service (Battery Saver)
 */

const KEY_DIM_ENABLED = 'kiwikifu_dim_enabled';
const KEY_DIM_LEVEL = 'kiwikifu_dim_level';

export class DimmerService {
  constructor(overlayEl, onStateChange = () => {}) {
    this.overlay = overlayEl;
    this.onStateChange = onStateChange;

    this.enabled = this.loadEnabled();
    this.level = this.loadLevel(); // integer 30 to 90
    this.idleTimeoutMs = 45000; // 45s of idle before dimming
    this.idleTimer = null;
    this.previewTimer = null;
    this.isDimmed = false;

    this.applyLevelCSS();
    this.attachActivityListeners();
    this.resetTimer();
  }

  loadEnabled() {
    try {
      if (typeof localStorage === 'undefined') return true;
      const val = localStorage.getItem(KEY_DIM_ENABLED);
      return val === null ? true : val === 'true';
    } catch (e) {
      return true;
    }
  }

  loadLevel() {
    try {
      if (typeof localStorage === 'undefined') return 70;
      const val = localStorage.getItem(KEY_DIM_LEVEL);
      if (val !== null) {
        const num = parseInt(val, 10);
        if (!isNaN(num)) return Math.max(30, Math.min(90, num));
      }
      return 70;
    } catch (e) {
      return 70;
    }
  }

  saveSettings() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(KEY_DIM_ENABLED, String(this.enabled));
      localStorage.setItem(KEY_DIM_LEVEL, String(this.level));
    } catch (e) {}
  }

  setLevel(newLevel, preview = false) {
    this.level = Math.max(30, Math.min(90, parseInt(newLevel, 10) || 70));
    this.applyLevelCSS();
    this.saveSettings();

    if (preview && this.enabled) {
      this.showPreview();
    }
  }

  applyLevelCSS() {
    if (this.overlay && this.overlay.style) {
      this.overlay.style.setProperty('--dim-opacity', (this.level / 100).toFixed(2));
    }
  }

  toggleEnabled() {
    this.enabled = !this.enabled;
    this.saveSettings();
    if (!this.enabled) {
      this.wakeUp(true);
      this.clearTimer();
    } else {
      this.resetTimer();
    }
    return this.enabled;
  }

  attachActivityListeners() {
    if (typeof window === 'undefined') return;

    const onActivity = () => {
      if (this.isDimmed) {
        this.wakeUp();
      }
      this.resetTimer();
    };

    window.addEventListener('touchstart', onActivity, { passive: true });
    window.addEventListener('mousedown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
  }

  resetTimer() {
    this.clearTimer();
    if (!this.enabled) return;

    this.idleTimer = setTimeout(() => {
      this.dimScreen();
    }, this.idleTimeoutMs);

    if (this.idleTimer && typeof this.idleTimer.unref === 'function') {
      this.idleTimer.unref();
    }
  }

  clearTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  dimScreen() {
    if (!this.enabled || !this.overlay) return;
    this.isDimmed = true;
    this.overlay.classList.remove('waking');
    this.overlay.classList.add('dimmed');
    this.onStateChange(true);
  }

  wakeUp(instant = false) {
    if (!this.overlay) return;
    this.isDimmed = false;
    if (instant) {
      this.overlay.classList.remove('dimmed', 'waking');
    } else {
      this.overlay.classList.add('waking');
      this.overlay.classList.remove('dimmed');
      setTimeout(() => {
        if (!this.isDimmed && this.overlay) {
          this.overlay.classList.remove('waking');
        }
      }, 200);
    }
    this.onStateChange(false);
  }

  showPreview() {
    if (!this.overlay) return;
    this.dimScreen();
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.wakeUp();
    }, 1200);
  }
}
