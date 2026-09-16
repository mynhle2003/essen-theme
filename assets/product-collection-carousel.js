import { Pagination } from './swiper-loader.js';
import { createSwiperCarousel, destroySwiperCarousel } from './swiper-carousel.js';

const instances = new WeakMap();
const carouselSelector = '[data-product-carousel][data-layout="carousel"]';
const desktopBreakpoint = 768;

const toNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const getCarouselScope = (carousel) =>
  carousel.closest('[data-product-list], [data-collection-tab-carousel], [data-collection-card-list]') ||
  carousel.parentElement ||
  carousel;

const getSlidesPerView = (value, showPreview) => {
  const slidesPerView = Math.min(6, toNumber(value, 1));
  return showPreview ? slidesPerView + 0.15 : slidesPerView;
};

const getPaginationType = (value) => (value === 'progress_bar' ? 'progressbar' : 'bullets');

const getControls = (carousel, scope) => {
  const previousSelector = carousel.dataset.swiperPreviousSelector;
  const nextSelector = carousel.dataset.swiperNextSelector;
  if (!previousSelector && !nextSelector) return null;

  return {
    scope,
    previous: previousSelector,
    next: nextSelector,
  };
};

const getFirstDataValue = (elements, key) => {
  for (const element of elements) {
    const value = element?.dataset?.[key];
    if (value !== undefined && value !== '') return value;
  }

  return null;
};

const buildOptions = (carousel, scope) => {
  const showPreview = carousel.dataset.nextSlidePreview === 'true';
  const pagination = carousel.querySelector('[data-product-collection-pagination]');
  const paginationType = getPaginationType(pagination?.dataset.paginationType || carousel.dataset.swiperPaginationType);
  const options = {
    slidesPerView: getSlidesPerView(carousel.dataset.swiperColumnsMobile, false),
    spaceBetween: toNumber(carousel.dataset.swiperGapMobile, 0),
    breakpoints: {
      [desktopBreakpoint]: {
        slidesPerView: getSlidesPerView(carousel.dataset.swiperColumnsDesktop, showPreview),
        spaceBetween: toNumber(carousel.dataset.swiperGapDesktop, 0),
      },
    },
    controls: getControls(carousel, scope),
  };

  if (pagination) {
    options.modules = [Pagination];
    options.pagination = {
      el: pagination,
      type: paginationType,
      clickable: paginationType === 'bullets',
    };
  }

  return options;
};

const getAutoplaySettings = (carousel, scope) => {
  const section = scope.closest('[data-collection-tabs]');
  const settingsSources = [carousel, scope, section];
  const autoplay = getFirstDataValue(settingsSources, 'swiperAutoplay');
  const pauseOnHover = getFirstDataValue(settingsSources, 'swiperAutoplayPauseOnHover');
  const delay = getFirstDataValue(settingsSources, 'swiperAutoplayDelay');
  const legacyAutoplay =
    scope.matches('[data-collection-tab-carousel]') &&
    scope.dataset.autoplay === 'true' &&
    section?.dataset.autoplay === 'true';

  return {
    enabled: (autoplay === null ? legacyAutoplay : autoplay === 'true') && !prefersReducedMotion(),
    pauseOnHover: pauseOnHover !== 'false',
    delay: Math.min(60000, Math.max(1000, toNumber(delay, 4000))),
  };
};

const isVisible = (element) => element.getClientRects().length > 0;

const startAutoplay = (state) => {
  const autoplay = getAutoplaySettings(state.carousel, state.scope);
  if (!autoplay.enabled) return;

  state.interval = window.setInterval(() => {
    if (
      document.hidden ||
      !isVisible(state.carousel) ||
      (autoplay.pauseOnHover && state.scope.matches(':hover')) ||
      state.scope.contains(document.activeElement) ||
      state.swiper.isLocked
    ) {
      return;
    }

    if (state.swiper.isEnd) {
      state.swiper.slideTo(0);
    } else {
      state.swiper.slideNext();
    }
  }, autoplay.delay);
};

const observeVisibility = (state) => {
  const panel = state.carousel.closest('[data-collection-tab-panel]');
  if (!panel || typeof MutationObserver === 'undefined') return;

  state.visibilityObserver = new MutationObserver(() => {
    if (!panel.hidden) window.requestAnimationFrame(() => state.swiper.update());
  });
  state.visibilityObserver.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
};

const observeSize = (state) => {
  if (typeof ResizeObserver === 'undefined') return;

  state.resizeObserver = new ResizeObserver(() => {
    if (isVisible(state.carousel)) state.swiper.update();
  });
  state.resizeObserver.observe(state.carousel);
};

const initialize = (carousel) => {
  if (!carousel || instances.has(carousel)) return;

  const scope = getCarouselScope(carousel);
  const swiper = createSwiperCarousel(carousel, buildOptions(carousel, scope));
  if (!swiper) return;

  const state = {
    carousel,
    scope,
    swiper,
    interval: null,
    resizeObserver: null,
    visibilityObserver: null,
  };
  instances.set(carousel, state);
  startAutoplay(state);
  observeSize(state);
  observeVisibility(state);
};

const initializeRoot = (root = document) => {
  if (root.matches?.(carouselSelector)) initialize(root);
  root.querySelectorAll?.(carouselSelector).forEach(initialize);
};

const destroy = (carousel) => {
  const state = instances.get(carousel);
  if (!state) return;

  if (state.interval) window.clearInterval(state.interval);
  state.resizeObserver?.disconnect();
  state.visibilityObserver?.disconnect();
  destroySwiperCarousel(state.swiper);
  instances.delete(carousel);
};

const destroyRoot = (root) => {
  const carousels = [];
  if (root.matches?.(carouselSelector)) carousels.push(root);
  root.querySelectorAll?.(carouselSelector).forEach((carousel) => carousels.push(carousel));
  carousels.forEach(destroy);
};

document.addEventListener('shopify:section:load', (event) => initializeRoot(event.target));
document.addEventListener('shopify:section:select', (event) => initializeRoot(event.target));
document.addEventListener('shopify:section:unload', (event) => destroyRoot(event.target));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initializeRoot(), { once: true });
} else {
  initializeRoot();
}
