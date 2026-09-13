/**
 * SimpleKifu - Share & QR Code Service
 */

export class ShareService {
  static buildShareUrl(sgf) {
    const url = new URL(window.location.href);
    url.hash = 'sgf=' + encodeURIComponent(sgf);
    return url.toString();
  }

  static parseUrlHash() {
    if (typeof window === 'undefined' || !window.location.hash) return null;
    if (window.location.hash.startsWith('#sgf=')) {
      try {
        const raw = window.location.hash.slice(5);
        const decoded = decodeURIComponent(raw);
        if (decoded && decoded.trim().startsWith('(')) {
          return decoded.trim();
        }
      } catch (err) {
        console.warn('Failed to parse URL hash SGF', err);
      }
    }
    return null;
  }

  static clearUrlHash() {
    try {
      if (typeof history !== 'undefined' && history.replaceState) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch (e) {}
  }

  static generateQrSvg(text) {
    if (typeof qrcode === 'undefined') {
      return { ok: false, html: '<p class="section-note">QR generator loading...<br>Use Copy Share Link.</p>' };
    }
    try {
      // Type number 0 = auto-detect, 'L' = 7% error correction (maximum data capacity)
      const qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
      return { ok: true, html: qr.createSvgTag(4, 2) };
    } catch (err) {
      console.warn('QR generation capacity exceeded', err);
      return {
        ok: false,
        html: '<p class="section-note" style="padding:10px;">Kifu is too large for a camera QR code.<br>Use <strong>Copy Share Link</strong> below!</p>'
      };
    }
  }

  static async copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    throw new Error('Clipboard API not available');
  }

  static isNativeShareSupported() {
    return typeof navigator !== 'undefined' && !!navigator.share;
  }

  static async nativeShare(data) {
    if (this.isNativeShareSupported()) {
      return navigator.share(data);
    }
    throw new Error('Web Share API not supported');
  }
}
