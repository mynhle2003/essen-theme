import { Pagination } from './swiper-loader.js';
import { createSwiperCarousel, destroySwiperCarousel } from './swiper-carousel.js';

const instances = new WeakMap();
const desktopBreakpoint = 768;

const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const bindCarouselAutoplay = (swiper, root, delay, pauseOnHover) => {
  if (!swiper || swiper.destroyed || prefersReducedMotion()) return () => {};

  const interval = window.setInterval(() => {
    if (
      document.hidden ||
      swiper.destroyed ||
      swiper.isLocked ||
      (pauseOnHover && swiper.wrapperEl?.matches(':hover')) ||
      root.contains(document.activeElement)
    ) return;

    swiper.isEnd ? swiper.slideTo(0) : swiper.slideNext();
  }, Math.min(60000, Math.max(1000, number(delay, 4000))));

  return () => window.clearInterval(interval);
};

const initialize = (root) => {
  if (!root || instances.has(root)) return;
  const viewport = root.querySelector('[data-swiper-carousel]');
  const wrapper = viewport?.querySelector('.swiper-wrapper');
  if (!viewport || !wrapper) return;

  const pagination = viewport.querySelector('.swiper-pagination');
  const showDesktop = root.dataset.swiperPaginationDesktop === 'true';
  const showMobile = root.dataset.swiperPaginationMobile === 'true';
  if (pagination) {
    pagination.dataset.paginationVisibleDesktop = String(showDesktop);
    pagination.dataset.paginationVisibleMobile = String(showMobile);
  }

  const paginationType = root.dataset.swiperPaginationType === 'progress_bar' ? 'progressbar' : 'bullets';
  const autoplay = root.dataset.swiperAutoplay === 'true';
  const fractionControls = root.dataset.carouselControlsStyle === 'fraction';
  const loop = root.dataset.carouselLoop === 'true';
  const options = {
    loop,
    slidesPerView: number(root.dataset.swiperColumnsMobile, 1),
    spaceBetween: number(root.dataset.swiperGapMobile, 12),
    breakpoints: { [desktopBreakpoint]: { slidesPerView: number(root.dataset.swiperColumnsDesktop, 4), spaceBetween: number(root.dataset.swiperGapDesktop, 16) } },
    controls: {
      scope: root,
      previous: fractionControls ? '[data-carousel-fraction-previous]' : '[data-carousel-previous]',
      next: fractionControls ? '[data-carousel-fraction-next]' : '[data-carousel-next]'
    },
    ...(pagination ? { modules: [Pagination], pagination: { el: pagination, type: paginationType, clickable: paginationType === 'bullets' } } : {})
  };

  const swiper = createSwiperCarousel(viewport, options);
  if (!swiper) return;
  const testimonialItem = root.querySelector('.testimonial-item');
  let testimonialGapCleanup = null;
  if (testimonialItem) {
    const syncTestimonialGap = () => {
      const styles = window.getComputedStyle(testimonialItem);
      const gap = Number.parseFloat(styles.getPropertyValue('--testimonial-gap-desktop'));
      if (Number.isFinite(gap)) root.style.setProperty('--testimonial-controls-gap-half', `${gap / 2}px`);
    };
    syncTestimonialGap();
    window.addEventListener('resize', syncTestimonialGap);
    testimonialGapCleanup = () => window.removeEventListener('resize', syncTestimonialGap);
  }
  const updateLockedState = () => {
    if (!swiper.destroyed) root.classList.toggle('carousel-block--locked', Boolean(swiper.isLocked));
  };
  swiper.on('resize breakpoint update observerUpdate', updateLockedState);
  updateLockedState();
  const lockedCleanup = () => swiper.off('resize breakpoint update observerUpdate', updateLockedState);
  let fractionCleanup = null;
  if (fractionControls) {
    const current = root.querySelector('[data-carousel-fraction-current]');
    const total = root.querySelector('[data-carousel-fraction-total]');
    const updateFraction = () => {
      if (swiper.destroyed) return;
      const realSlides = swiper.slides.filter((slide) => !slide.classList.contains('swiper-slide-duplicate'));
      const slideCount = loop ? realSlides.length : swiper.slides.length;
      const currentIndex = loop ? swiper.realIndex + 1 : swiper.activeIndex + 1;
      if (current) current.textContent = String(currentIndex);
      if (total) total.textContent = String(slideCount);
    };
    swiper.on('init slideChange update', updateFraction);
    updateFraction();
    fractionCleanup = () => swiper.off('init slideChange update', updateFraction);
  }
  const state = {
    swiper,
    testimonialGapCleanup,
    lockedCleanup,
    fractionCleanup,
    autoplayCleanup: autoplay
      ? bindCarouselAutoplay(
          swiper,
          root,
          number(root.dataset.swiperAutoplayDelay, 4000),
          root.dataset.swiperAutoplayPauseOnHover !== 'false'
        )
      : null
  };
  instances.set(root, state);
};

const destroy = (root) => {
  const state = instances.get(root);
  if (!state) return;
  state.autoplayCleanup?.();
  state.testimonialGapCleanup?.();
  state.lockedCleanup?.();
  state.fractionCleanup?.();
  destroySwiperCarousel(state.swiper);
  instances.delete(root);
};

const initializeRoot = (root = document) => {
  if (root.matches?.('[data-carousel-block]')) initialize(root);
  root.querySelectorAll?.('[data-carousel-block]').forEach(initialize);
};
const destroyRoot = (root) => {
  if (root.matches?.('[data-carousel-block]')) destroy(root);
  root.querySelectorAll?.('[data-carousel-block]').forEach(destroy);
};

document.addEventListener('shopify:section:load', (event) => initializeRoot(event.target));
document.addEventListener('shopify:section:select', (event) => initializeRoot(event.target));
document.addEventListener('shopify:section:unload', (event) => destroyRoot(event.target));
document.addEventListener('shopify:block:select', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const root = target?.closest('[data-carousel-block]');
  if (!root) return initializeRoot(target || event.target);

  initialize(root);
  const state = instances.get(root);
  const slide = target.closest('.carousel-slide, .testimonial-item');
  const index = slide ? Array.from(state?.swiper.slides || []).indexOf(slide) : -1;
  if (index >= 0) state.swiper.slideTo(index, 0);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initializeRoot(), { once: true });
else initializeRoot();
