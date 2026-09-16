import { EffectFade, Pagination, Thumbs } from './swiper-loader.js';
import { createSwiperCarousel, destroySwiperCarousel } from './swiper-carousel.js';

class ProductMediaGallery extends HTMLElement {
  connectedCallback() {
    if (this.abortController) return;

    this.abortController = new AbortController();
    this.signal = this.abortController.signal;
    this.mobileQuery = window.matchMedia('(max-width: 767.98px)');
    this.productInformation = this.closest('[data-product-information]');

    this.handleClick = this.handleClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleBreakpoint = this.handleBreakpoint.bind(this);
    this.handleVariantChange = this.handleVariantChange.bind(this);

    this.addEventListener('click', this.handleClick, { signal: this.signal });
    this.addEventListener('keydown', this.handleKeydown, { signal: this.signal });
    this.mobileQuery.addEventListener('change', this.handleBreakpoint, { signal: this.signal });
    this.productInformation?.addEventListener('variant:change', this.handleVariantChange, { signal: this.signal });
    this.lightbox?.addEventListener('close', () => this.destroyLightbox(), { signal: this.signal });
    this.lightbox?.addEventListener('click', (event) => {
      if (event.target === this.lightbox) this.lightbox.close();
    }, { signal: this.signal });

    this.syncThumbnailVisibility();
    this.initializeGallery();
    this.initializeShopifyMedia();
  }

  disconnectedCallback() {
    window.requestAnimationFrame(() => {
      if (this.isConnected) return;

      this.abortController?.abort();
      this.abortController = null;
      this.destroyGallery();
      this.destroyLightbox();
    });
  }

  get mainElement() {
    return this.querySelector('[data-product-main-swiper]');
  }

  get thumbnailElement() {
    return this.querySelector('[data-product-thumbnail-swiper]');
  }

  get lightbox() {
    return this.querySelector('[data-product-media-lightbox]');
  }

  get galleryMode() {
    if (this.mobileQuery.matches) return 'mobile';
    return ['left_thumbnails', 'bottom_thumbnails'].includes(this.dataset.desktopLayout) ? 'desktop-carousel' : 'desktop-static';
  }

  visibleSlides() {
    return Array.from(this.querySelectorAll('[data-product-media]')).filter((slide) => !slide.hidden);
  }

  destroyGallery() {
    destroySwiperCarousel(this.mainSwiper);
    destroySwiperCarousel(this.thumbnailSwiper);
    this.mainSwiper = null;
    this.thumbnailSwiper = null;
    this.activeGalleryMode = null;
  }

  initializeGallery(preferredMediaId = '') {
    const main = this.mainElement;
    if (!main) return;

    const mode = this.galleryMode;
    if (mode === 'desktop-static') {
      this.destroyGallery();
      if (preferredMediaId) this.scrollToMedia(preferredMediaId, true);
      return;
    }

    if (this.mainSwiper && this.activeGalleryMode === mode) {
      this.thumbnailSwiper?.update();
      this.mainSwiper.update();
      if (preferredMediaId) this.showMedia(preferredMediaId, true);
      return;
    }

    this.destroyGallery();
    this.activeGalleryMode = mode;
    const isMobile = mode === 'mobile';
    const showThumbnails = !isMobile || this.dataset.mobileLayout === 'thumbnails';
    const showPagination = isMobile && this.dataset.mobileLayout === 'slider';
    const gapProperty = isMobile ? '--product-media-gap-mobile' : '--product-media-gap';
    const gap = Number.parseFloat(getComputedStyle(this).getPropertyValue(gapProperty)) || 0;

    if (showThumbnails && this.thumbnailElement) {
      this.thumbnailSwiper = createSwiperCarousel(this.thumbnailElement, {
        slidesPerView: 'auto',
        spaceBetween: gap,
        direction: !isMobile && this.dataset.desktopLayout === 'left_thumbnails' ? 'vertical' : 'horizontal',
        watchSlidesProgress: true,
        slideToClickedSlide: true,
        a11y: { enabled: true },
      });
    }

    const pagination = this.querySelector('[data-product-media-pagination]');
    this.mainSwiper = createSwiperCarousel(main, {
      modules: showPagination ? [Pagination, Thumbs] : [Thumbs],
      slidesPerView: 1,
      spaceBetween: gap,
      speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
      watchOverflow: true,
      controls: {
        scope: this,
        previous: '[data-product-media-previous]',
        next: '[data-product-media-next]'
      },
      ...(showPagination && pagination ? { pagination: { el: pagination, clickable: true } } : {}),
      ...(this.thumbnailSwiper ? { thumbs: { swiper: this.thumbnailSwiper, autoScrollOffset: 1 } } : {}),
      a11y: { enabled: true },
    });

    if (preferredMediaId) this.showMedia(preferredMediaId, true);
  }

  handleBreakpoint() {
    const activeMediaId = this.mainSwiper?.slides?.[this.mainSwiper.activeIndex]?.dataset.mediaId || '';
    this.initializeGallery(activeMediaId);
  }

  handleVariantChange(event) {
    const mediaId = event.detail?.variant?.featured_media?.id;
    window.requestAnimationFrame(() => {
      this.syncThumbnailVisibility();
      if (this.galleryMode === 'desktop-static') {
        if (mediaId) this.scrollToMedia(String(mediaId), true);
        return;
      }
      this.mainSwiper?.update();
      this.thumbnailSwiper?.update();
      if (mediaId) this.showMedia(String(mediaId), true);
    });
  }

  handleClick(event) {
    if (event.target.closest('[data-product-lightbox-close]')) {
      this.lightbox?.close();
      return;
    }

    const thumbnail = event.target.closest('[data-product-media-thumbnail]');
    if (thumbnail) {
      this.galleryMode === 'desktop-static'
        ? this.scrollToMedia(thumbnail.dataset.mediaId)
        : this.showMedia(thumbnail.dataset.mediaId);
      return;
    }

    const media = event.target.closest('[data-product-media-content]');
    if (!media) return;
    this.activateMedia(media);
  }

  handleKeydown(event) {
    const media = event.target.closest('[data-product-media-content]');
    if (!media || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    this.activateMedia(media);
  }

  activateMedia(media) {
    if (!media.classList.contains('product-media--interactive')) return;
    if (this.dataset.zoom === 'open_lightbox') this.openLightbox(media.dataset.mediaId, media);
    if (this.dataset.zoom === 'click_hover') media.classList.toggle('is-zoomed');
  }

  syncThumbnailVisibility() {
    const slides = Array.from(this.querySelectorAll('[data-product-media]'));
    this.querySelectorAll('[data-product-media-thumbnail]').forEach((thumbnail) => {
      const slide = slides.find((item) => item.dataset.mediaId === thumbnail.dataset.mediaId);
      thumbnail.hidden = Boolean(slide?.hidden);
      thumbnail.setAttribute('aria-hidden', String(Boolean(slide?.hidden)));
    });
  }

  showMedia(mediaId, instant = false) {
    const slides = Array.from(this.mainSwiper?.slides || []);
    const index = slides.findIndex((slide) => String(slide.dataset.mediaId) === String(mediaId));
    if (index >= 0) this.mainSwiper.slideTo(index, instant ? 0 : undefined);
  }

  scrollToMedia(mediaId, instant = false) {
    const target = Array.from(this.querySelectorAll('[data-product-media]')).find(
      (media) => String(media.dataset.mediaId) === String(mediaId),
    );
    if (!target || target.hidden) return;
    target.scrollIntoView({
      behavior: instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
    });
    this.querySelectorAll('[data-product-media-thumbnail]').forEach((thumbnail) => {
      thumbnail.setAttribute('aria-current', String(thumbnail.dataset.mediaId === String(mediaId)));
    });
  }

  openLightbox(mediaId, opener) {
    if (!this.lightbox?.showModal) return;
    this.lightboxOpener = opener;
    this.destroyLightbox(false);
    this.lightbox.showModal();
    document.documentElement.classList.add('product-media-lightbox-open');

    const viewport = this.querySelector('[data-product-lightbox-swiper]');
    if (!viewport) return;
    this.lightboxSwiper = createSwiperCarousel(viewport, {
      modules: [EffectFade],
      effect: 'fade',
      fadeEffect: { crossFade: true },
      speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240,
      controls: {
        scope: this.lightbox,
        previous: '[data-product-lightbox-previous]',
        next: '[data-product-lightbox-next]'
      },
      a11y: { enabled: true },
    });
    const index = Array.from(this.lightboxSwiper.slides).findIndex(
      (slide) => String(slide.dataset.mediaId) === String(mediaId),
    );
    if (index >= 0) this.lightboxSwiper.slideTo(index, 0);
    this.updateLightboxCounter();
    this.lightboxSwiper.on('slideChange', () => this.updateLightboxCounter());
  }

  updateLightboxCounter() {
    const current = this.querySelector('[data-product-lightbox-current]');
    const total = this.querySelector('[data-product-lightbox-total]');
    if (current) current.textContent = String((this.lightboxSwiper?.realIndex || 0) + 1);
    if (total) total.textContent = String(this.lightboxSwiper?.slides?.length || 0);
  }

  destroyLightbox(restoreFocus = true) {
    destroySwiperCarousel(this.lightboxSwiper);
    this.lightboxSwiper = null;
    document.documentElement.classList.remove('product-media-lightbox-open');
    if (restoreFocus && this.lightboxOpener?.isConnected) this.lightboxOpener.focus();
    if (restoreFocus) this.lightboxOpener = null;
  }

  initializeShopifyMedia() {
    const modelViewers = this.querySelectorAll('model-viewer');
    if (!modelViewers.length || !window.Shopify?.loadFeatures) return;
    window.Shopify.loadFeatures([
      {
        name: 'model-viewer-ui',
        version: '1.0',
        onLoad: (error) => {
          if (error || !window.Shopify?.ModelViewerUI) return;
          modelViewers.forEach((modelViewer) => {
            if (modelViewer.dataset.modelViewerInitialized === 'true') return;
            new window.Shopify.ModelViewerUI(modelViewer);
            modelViewer.dataset.modelViewerInitialized = 'true';
          });
        },
      },
    ]);
  }
}

if (!customElements.get('product-media-gallery')) {
  customElements.define('product-media-gallery', ProductMediaGallery);
}
