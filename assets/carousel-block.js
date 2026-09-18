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
  const options = {
    slidesPerView: number(root.dataset.swiperColumnsMobile, 1),
    spaceBetween: number(root.dataset.swiperGapMobile, 12),
    breakpoints: { [desktopBreakpoint]: { slidesPerView: number(root.dataset.swiperColumnsDesktop, 4), spaceBetween: number(root.dataset.swiperGapDesktop, 16) } },
    controls: {
      scope: root,
      previous: '[data-carousel-previous]',
      next: '[data-carousel-next]'
    },
    ...(pagination ? { modules: [Pagination], pagination: { el: pagination, type: paginationType, clickable: paginationType === 'bullets' } } : {})
  };

  const swiper = createSwiperCarousel(viewport, options);
  if (!swiper) return;
  const state = {
    swiper,
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
  const slide = target.closest('.carousel-slide');
  const index = slide ? Array.from(state?.swiper.slides || []).indexOf(slide) : -1;
  if (index >= 0) state.swiper.slideTo(index, 0);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initializeRoot(), { once: true });
else initializeRoot();
