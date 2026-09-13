/**
 * SimpleKifu - Screen Wake Lock API Service
 */

export class WakeLockService {
  constructor(onChangeCallback = () => {}) {
    this.wakeLock = null;
    this.wanted = false;
    this.onChange = onChangeCallback;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (this.wanted && document.visibilityState === 'visible' && !this.wakeLock) {
          this.request();
        }
      });
    }
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  isActive() {
    return !!this.wakeLock;
  }

  async toggle() {
    if (this.wakeLock) {
      await this.release();
      this.wanted = false;
      return false;
    } else {
      this.wanted = true;
      const ok = await this.request();
      return ok;
    }
  }

  async request() {
    if (!this.isSupported()) {
      this.onChange(false, 'Wake Lock not supported on this browser');
      return false;
    }
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
        this.onChange(false);
      });
      this.onChange(true, 'Screen will stay awake ☕');
      return true;
    } catch (err) {
      console.warn('Wake Lock request failed', err);
      this.wakeLock = null;
      this.onChange(false, 'Could not enable wake lock');
      return false;
    }
  }

  async release() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch (e) {}
      this.wakeLock = null;
      this.onChange(false, 'Screen awake: OFF');
    }
  }
}
