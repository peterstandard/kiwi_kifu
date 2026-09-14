/**
 * SimpleKifu - Touch & Mouse Gestures (Pinch-to-zoom, Pan, Tap Detection)
 */

export class BoardGestures {
  constructor(svgElement, getMetricsFn, callbacks = {}) {
    this.svg = svgElement;
    this.getMetrics = getMetricsFn;
    this.callbacks = {
      onTap: callbacks.onTap || (() => {}),
      onTransformChange: callbacks.onTransformChange || (() => {})
    };

    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Touch & Gesture Tracking
    this.isPinching = false;
    this.pinchStartDist = 0;
    this.pinchStartScale = 1.0;
    this.pinchFocalBoardX = 0;
    this.pinchFocalBoardY = 0;
    this.pinchEndedTime = 0;

    this.isDragging = false;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.lastTouchX = 0;
    this.lastTouchY = 0;
    this.touchStartTime = 0;
    this.lastTouchEndTime = 0;

    // Mouse Tracking (Desktop)
    this.isMouseDown = false;
    this.mouseStartX = 0;
    this.mouseStartY = 0;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.isMouseDragging = false;

    this.attach();
  }

  attach() {
    if (!this.svg) return;

    // Mobile Touch Gestures
    this.svg.addEventListener('touchstart', (e) => { this.handleTouchStart(e); }, { passive: false });
    this.svg.addEventListener('touchmove', (e) => { this.handleTouchMove(e); }, { passive: false });
    this.svg.addEventListener('touchend', (e) => { this.handleTouchEnd(e); });
    this.svg.addEventListener('touchcancel', (e) => { this.handleTouchEnd(e); });

    // Desktop Mouse Drag & Wheel
    this.svg.addEventListener('mousedown', (e) => { this.handleMouseDown(e); });
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', (e) => { this.handleMouseMove(e); });
      window.addEventListener('mouseup', (e) => { this.handleMouseUp(e); });
    }
    this.svg.addEventListener('wheel', (e) => { this.handleWheel(e); }, { passive: false });
  }

  getScreenToSvgScale() {
    if (this.svg && this.svg.getScreenCTM) {
      try {
        const ctm = this.svg.getScreenCTM();
        if (ctm && ctm.a) {
          return 1 / ctm.a;
        }
      } catch (e) {}
    }
    const rect = this.svg.getBoundingClientRect();
    const { width, height } = this.getMetrics();
    const viewW = width;
    const viewH = height || width;
    const scale = Math.min((rect.width || 1) / viewW, (rect.height || 1) / viewH);
    return 1 / (scale || 1);
  }

  screenToSvg(clientX, clientY) {
    if (this.svg && this.svg.getScreenCTM && this.svg.createSVGPoint) {
      try {
        const ctm = this.svg.getScreenCTM();
        if (ctm) {
          const pt = this.svg.createSVGPoint();
          pt.x = clientX;
          pt.y = clientY;
          const svgPt = pt.matrixTransform(ctm.inverse());
          return { x: svgPt.x, y: svgPt.y };
        }
      } catch (e) {
        // Fall back below
      }
    }

    const rect = this.svg.getBoundingClientRect();
    const { width, height } = this.getMetrics();
    const viewW = width;
    const viewH = height || width;

    // Handle preserveAspectRatio="xMidYMid meet" letterboxing / pillarboxing
    const scale = Math.min((rect.width || 1) / viewW, (rect.height || 1) / viewH);
    const renderW = viewW * scale;
    const renderH = viewH * scale;
    const offsetX = rect.left + ((rect.width || 1) - renderW) / 2;
    const offsetY = rect.top + ((rect.height || 1) - renderH) / 2;

    return {
      x: (clientX - offsetX) / (scale || 1),
      y: (clientY - offsetY) / (scale || 1)
    };
  }

  getBoardCoordinatesFromScreen(clientX, clientY) {
    const { size, margin, cellSize } = this.getMetrics();
    const svgPt = this.screenToSvg(clientX, clientY);

    const boardX = (svgPt.x - this.panX) / this.scale;
    const boardY = (svgPt.y - this.panY) / this.scale;

    const x = Math.round((boardX - margin) / cellSize);
    const y = Math.round((boardY - margin) / cellSize);

    if (x >= 0 && x < size && y >= 0 && y < size) {
      const targetX = margin + x * cellSize;
      const targetY = margin + y * cellSize;
      const dist = Math.hypot(boardX - targetX, boardY - targetY);
      if (dist <= cellSize * 0.55) {
        return { x, y };
      }
    }
    return null;
  }

  clampPan(scale, panX, panY) {
    if (scale <= 1.02) {
      return { panX: 0, panY: 0 };
    }
    const { width, height } = this.getMetrics();
    const minPanX = width * (1 - scale);
    const maxPanX = 0;
    const minPanY = height * (1 - scale);
    const maxPanY = 0;

    return {
      panX: Math.max(minPanX, Math.min(maxPanX, panX)),
      panY: Math.max(minPanY, Math.min(maxPanY, panY))
    };
  }

  setZoom(newScale, focalX = null, focalY = null) {
    const { width, height } = this.getMetrics();
    const clampedScale = Math.max(1.0, Math.min(3.5, newScale));

    if (clampedScale <= 1.02) {
      this.scale = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.notifyTransform();
      return;
    }

    const fx = focalX !== null ? focalX : width / 2;
    const fy = focalY !== null ? focalY : height / 2;

    const bx = (fx - this.panX) / this.scale;
    const by = (fy - this.panY) / this.scale;

    const newPanX = fx - bx * clampedScale;
    const newPanY = fy - by * clampedScale;

    const clamped = this.clampPan(clampedScale, newPanX, newPanY);
    this.scale = clampedScale;
    this.panX = clamped.panX;
    this.panY = clamped.panY;
    this.notifyTransform();
  }

  resetZoom() {
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.notifyTransform();
  }

  notifyTransform() {
    this.callbacks.onTransformChange(this.scale, this.panX, this.panY);
  }

  handleTouchStart(e) {
    this.lastTouchEndTime = Date.now();
    if (e.touches.length === 1) {
      if (Date.now() - this.pinchEndedTime < 300) {
        this.isDragging = true;
        return;
      }
      const t = e.touches[0];
      this.touchStartTime = Date.now();
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
      this.isDragging = false;
      this.isPinching = false;
    } else if (e.touches.length === 2) {
      this.isPinching = true;
      this.isDragging = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      this.pinchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      this.pinchStartScale = this.scale;

      const midClientX = (t1.clientX + t2.clientX) / 2;
      const midClientY = (t1.clientY + t2.clientY) / 2;
      const svgFocal = this.screenToSvg(midClientX, midClientY);
      this.pinchFocalBoardX = (svgFocal.x - this.panX) / this.scale;
      this.pinchFocalBoardY = (svgFocal.y - this.panY) / this.scale;
    }
  }

  handleTouchMove(e) {
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 2 && this.isPinching) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (this.pinchStartDist <= 0) return;

      const scaleFactor = dist / this.pinchStartDist;
      const newScale = Math.max(1.0, Math.min(3.5, this.pinchStartScale * scaleFactor));

      const midClientX = (t1.clientX + t2.clientX) / 2;
      const midClientY = (t1.clientY + t2.clientY) / 2;
      const currentFocalSvg = this.screenToSvg(midClientX, midClientY);

      if (newScale <= 1.02) {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
      } else {
        const newPanX = currentFocalSvg.x - this.pinchFocalBoardX * newScale;
        const newPanY = currentFocalSvg.y - this.pinchFocalBoardY * newScale;
        const clamped = this.clampPan(newScale, newPanX, newPanY);
        this.scale = newScale;
        this.panX = clamped.panX;
        this.panY = clamped.panY;
      }
      this.notifyTransform();
    } else if (e.touches.length === 1 && !this.isPinching) {
      const t = e.touches[0];
      const moved = Math.hypot(t.clientX - this.touchStartX, t.clientY - this.touchStartY);
      if (moved > 8) {
        this.isDragging = true;
        if (this.scale > 1.05) {
          const svgScale = this.getScreenToSvgScale();
          const dx = (t.clientX - this.lastTouchX) * svgScale;
          const dy = (t.clientY - this.lastTouchY) * svgScale;

          this.panX += dx;
          this.panY += dy;
          const clamped = this.clampPan(this.scale, this.panX, this.panY);
          this.panX = clamped.panX;
          this.panY = clamped.panY;
          this.notifyTransform();
        }
      }
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
    }
  }

  handleTouchEnd(e) {
    this.lastTouchEndTime = Date.now();

    if (this.isPinching) {
      if (e.touches.length === 0) {
        this.isPinching = false;
        this.pinchEndedTime = Date.now();
      }
      return;
    }

    if (e.touches.length > 0) return;
    if (Date.now() - this.pinchEndedTime < 300) return;
    if (this.isDragging) {
      this.isDragging = false;
      return;
    }

    const duration = Date.now() - this.touchStartTime;
    if (duration < 500) {
      this.callbacks.onTap(this.touchStartX, this.touchStartY);
    }
  }

  handleMouseDown(e) {
    if (e.button !== 0) return;
    if (Date.now() - this.lastTouchEndTime < 600) return;
    this.isMouseDown = true;
    this.mouseStartX = e.clientX;
    this.mouseStartY = e.clientY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.isMouseDragging = false;
  }

  handleMouseMove(e) {
    if (!this.isMouseDown) return;
    const moved = Math.hypot(e.clientX - this.mouseStartX, e.clientY - this.mouseStartY);
    if (moved > 5) {
      this.isMouseDragging = true;
      if (this.scale > 1.05) {
        const svgScale = this.getScreenToSvgScale();
        const dx = (e.clientX - this.lastMouseX) * svgScale;
        const dy = (e.clientY - this.lastMouseY) * svgScale;

        this.panX += dx;
        this.panY += dy;
        const clamped = this.clampPan(this.scale, this.panX, this.panY);
        this.panX = clamped.panX;
        this.panY = clamped.panY;
        this.notifyTransform();
      }
    }
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  handleMouseUp(e) {
    if (!this.isMouseDown) return;
    this.isMouseDown = false;
    if (Date.now() - this.lastTouchEndTime < 600) return;
    if (this.isMouseDragging) {
      this.isMouseDragging = false;
      return;
    }
    this.callbacks.onTap(e.clientX, e.clientY);
  }

  handleWheel(e) {
    e.preventDefault();
    const focalSvg = this.screenToSvg(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.18 : 0.85;
    this.setZoom(this.scale * factor, focalSvg.x, focalSvg.y);
  }
}
