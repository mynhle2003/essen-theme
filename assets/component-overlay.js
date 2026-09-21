/* Shared presentation lifecycle. Feature controllers own only their content. */
(() => {
  const mobile = window.matchMedia('(max-width: 767.98px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const instances = new WeakMap();
  const duration = (element) => {
    const style = getComputedStyle(element);
    const milliseconds = (value) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000) || 0;
    const delays = style.transitionDelay.split(',').map(milliseconds);
    return Math.max(0, ...style.transitionDuration.split(',').map((value, i) => milliseconds(value) + delays[i % delays.length]));
  };

  class SheetGesture {
    constructor({ panel, header, enabled, close, delegated = false }) {
      Object.assign(this, { panel, header, enabled, close });
      this.controller = new AbortController();
      const options = { signal: this.controller.signal };
      if (!delegated) header?.addEventListener('pointerdown', (event) => this.start(event), options);
      header?.addEventListener('pointermove', (event) => this.move(event), options);
      header?.addEventListener('pointerup', (event) => this.end(event), options);
      header?.addEventListener('pointercancel', (event) => this.end(event, true), options);
      header?.addEventListener('lostpointercapture', () => { if (this.drag) this.reset(); }, options);
      mobile.addEventListener('change', () => this.reset(), options);
    }

    start(event) {
      if (!this.enabled() || !event.isPrimary || event.button !== 0 || event.target.closest('button, a, input, select, textarea')) return;
      this.reset();
      this.drag = { id: event.pointerId, start: event.clientY, last: event.clientY, time: performance.now(), distance: 0, velocity: 0 };
      this.panel.classList.add('is-sheet-dragging');
      this.panel.style.transition = 'none';
      this.panel.style.transform = 'translateY(0)';
      this.header.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    move(event) {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const now = performance.now();
      drag.velocity = (event.clientY - drag.last) / Math.max(1, now - drag.time);
      drag.last = event.clientY;
      drag.time = now;
      drag.distance = Math.max(0, event.clientY - drag.start);
      this.panel.style.transform = `translateY(${drag.distance}px)`;
      event.preventDefault();
    }

    end(event, cancelled = false) {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const dismiss = !cancelled && (drag.distance >= Math.min(140, this.panel.offsetHeight * 0.2) || (drag.distance >= 32 && drag.velocity > 0.55 && performance.now() - drag.time < 100));
      this.drag = null;
      if (this.header.hasPointerCapture(drag.id)) this.header.releasePointerCapture(drag.id);
      this.panel.classList.remove('is-sheet-dragging');
      this.panel.style.transition = reduced.matches ? 'none' : 'transform var(--motion-duration-standard) var(--motion-ease-standard)';
      if (dismiss) this.close();
      if (reduced.matches) { this.reset(); return; }
      this.frame = requestAnimationFrame(() => {
        this.panel.style.transform = dismiss ? 'translateY(100%)' : 'translateY(0)';
        this.timer = setTimeout(() => this.reset(), duration(this.panel) + 50);
      });
    }

    reset() {
      clearTimeout(this.timer);
      cancelAnimationFrame(this.frame);
      const drag = this.drag;
      this.drag = null;
      if (drag && this.header.hasPointerCapture(drag.id)) this.header.releasePointerCapture(drag.id);
      this.panel.classList.remove('is-sheet-dragging');
      this.panel.style.removeProperty('transition');
      this.panel.style.removeProperty('transform');
    }

    destroy() { this.reset(); this.controller.abort(); }
  }

  class Overlay {
    constructor(dialog) {
      this.dialog = dialog;
      this.controller = new AbortController();
      const options = { signal: this.controller.signal };
      this.gesture = new SheetGesture({
        panel: dialog,
        header: dialog.querySelector('.component-overlay__header'),
        enabled: () => mobile.matches && dialog.dataset.mobileLayout === 'bottom_sheet' && dialog.dataset.state === 'open',
        close: () => this.close({ fromGesture: true }),
      });
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); this.close(); }, options);
      dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, iframe, [tabindex]')]
          .filter((element) => !element.disabled && element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus({ preventScroll: true });
        }
      }, options);
      dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-overlay-close]')) this.close();
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
      }, options);
      dialog.addEventListener('close', () => {
        // Native close events are queued; a reopened dialog owns the new state.
        if (dialog.open) return;
        this.finishClose();
      }, options);
    }

    finishClose() {
        clearTimeout(this.timer);
        this.gesture.reset();
        this.dialog.dataset.state = 'closed';
        this.opener?.setAttribute('aria-expanded', 'false');
        if (this.restoreFocus && this.opener?.isConnected && !this.opener.hidden) this.opener.focus({ preventScroll: true });
        this.opener = null;
    }

    open({ opener = document.activeElement, focus = true } = {}) {
      clearTimeout(this.timer);
      this.gesture.reset();
      if (this.dialog.open && this.dialog.dataset.state === 'open') return;
      this.opener = opener;
      this.restoreFocus = true;
      this.opener?.setAttribute('aria-expanded', 'true');
      this.dialog.dataset.state = 'opening';
      if (!this.dialog.open) this.dialog.showModal();
      void this.dialog.offsetHeight;
      this.dialog.dataset.state = 'open';
      if (focus) this.dialog.querySelector('[data-overlay-close]')?.focus({ preventScroll: true });
    }

    close({ restoreFocus = true, immediate = false, fromGesture = false } = {}) {
      if (!this.dialog.open) return;
      clearTimeout(this.timer);
      this.restoreFocus = restoreFocus;
      if (!fromGesture) this.gesture.reset();
      this.dialog.dataset.state = 'closing';
      const finish = () => {
        if (!this.dialog.open) return;
        this.dialog.close();
        this.finishClose();
      };
      if (immediate || reduced.matches) finish();
      else this.timer = setTimeout(finish, duration(this.dialog) + 50);
    }

    destroy() {
      this.close({ immediate: true, restoreFocus: false });
      this.gesture.destroy();
      this.controller.abort();
      instances.delete(this.dialog);
    }
  }

  window.ThemeOverlay = {
    mobile,
    SheetGesture,
    get(dialog) {
      if (!dialog) return null;
      if (!instances.has(dialog)) instances.set(dialog, new Overlay(dialog));
      return instances.get(dialog);
    },
  };
})();
