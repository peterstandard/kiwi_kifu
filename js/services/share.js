/**
 * SimpleKifu - Share & QR Code Service
 */

export class ShareService {
  /**
   * Compresses SGF text using Deflate-raw into a URL-safe Base64 string.
   */
  static async compressText(text) {
    if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') {
      return null;
    }
    try {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buffer = await new Response(stream).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } catch (err) {
      console.warn('CompressionStream failed, using fallback', err);
      return null;
    }
  }

  /**
   * Decompresses a URL-safe Base64 string into SGF text using Deflate-raw.
   */
  static async decompressText(b64url) {
    if (typeof DecompressionStream === 'undefined' || typeof Response === 'undefined') {
      return null;
    }
    try {
      let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    } catch (err) {
      console.warn('DecompressionStream failed', err);
      return null;
    }
  }

  static async buildShareUrl(sgf) {
    const url = new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
    const compressed = await this.compressText(sgf);
    if (compressed) {
      url.hash = 'z=' + compressed;
    } else {
      url.hash = 'sgf=' + encodeURIComponent(sgf);
    }
    return url.toString();
  }

  static async parseUrlHash(explicitHash = null) {
    const hash = explicitHash !== null ? explicitHash : (typeof window !== 'undefined' ? window.location.hash : '');
    if (!hash) return null;

    // Compressed format: #z=...
    if (hash.startsWith('#z=')) {
      try {
        const raw = hash.slice(3);
        const decompressed = await this.decompressText(raw);
        if (decompressed && decompressed.trim().startsWith('(')) {
          return decompressed.trim();
        }
      } catch (err) {
        console.warn('Failed to decompress URL hash', err);
      }
    }

    // Legacy uncompressed format: #sgf=...
    if (hash.startsWith('#sgf=')) {
      try {
        const raw = hash.slice(5);
        const decoded = decodeURIComponent(raw);
        if (decoded && decoded.trim().startsWith('(')) {
          return decoded.trim();
        }
      } catch (err) {
        console.warn('Failed to parse legacy URL hash SGF', err);
      }
    }

    return null;
  }

  static clearUrlHash() {
    try {
      if (typeof history !== 'undefined' && history.replaceState && typeof window !== 'undefined') {
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
