# Shared Swiper carousel

The theme exposes a reusable Swiper rendering and lifecycle contract for
slideshow, featured collection, content list, and product media surfaces.

## Liquid markup

Capture direct `.swiper-slide` items and render the shared viewport:

```liquid
{% capture slides %}
  {% for item in items %}
    <article class="swiper-slide content-card">
      {{ item.title }}
    </article>
  {% endfor %}
{% endcapture %}

{% capture pagination %}
  <div class="swiper-pagination" data-swiper-pagination></div>
{% endcapture %}

{% render 'swiper-carousel',
  id: 'FeaturedContent',
  content: slides,
  root_class: 'content-list__carousel',
  aria_label: 'Featured content',
  pagination: pagination
%}
```

The snippet owns the `.swiper` and `.swiper-wrapper` contract. The caller owns
slide markup, controls, pagination markup, and section-specific styling.
Pass `layout: 'grid'` when the same items should render as a responsive grid;
that mode keeps the markup contract but skips Swiper initialization. Set
`--swiper-carousel-grid-columns` and `--swiper-carousel-grid-gap` from the
owning section or block when using grid mode.
Render `swiper-stylesheet` once in the owning section or layout where the
component is used.

The built-in Product List block and Collection Tab block use the same
`product-collection-grid` renderer. Their `grid` option keeps the existing CSS
grid, while `carousel` adds Swiper slide markup and delegates initialization to
`product-collection-carousel.js`.

Autoplay is an opt-in component contract. Pass `autoplay`, `pause_on_hover`,
and `autoplay_delay` to `swiper-carousel`; it exposes the normalized values as
`data-swiper-autoplay`, `data-swiper-autoplay-pause-on-hover`, and
`data-swiper-autoplay-delay` on the Swiper root. The runtime respects reduced
motion preferences, pauses on hover when configured, and uses the delay in
milliseconds.

## JavaScript

Use the shared factory from a section or feature module:

```js
import { Pagination } from './swiper-loader.js';
import { bindSwiperControls, createSwiperCarousel } from './swiper-carousel.js';

const root = document.querySelector('[data-content-list]');
const swiper = createSwiperCarousel(root.querySelector('[data-swiper-carousel]'), {
  modules: [Pagination],
  slidesPerView: 1,
  spaceBetween: 16,
  breakpoints: { 768: { slidesPerView: 3 } },
  pagination: { el: root.querySelector('[data-swiper-pagination]'), clickable: true }
});

bindSwiperControls(swiper, {
  scope: root,
  previous: '[data-swiper-previous]',
  next: '[data-swiper-next]'
});
```

`createSwiperCarousel` adds the shared A11y module, enables `watchOverflow`,
deduplicates modules, and is idempotent per element. Use
`destroySwiperCarousel` during section unload or component disconnect. The
factory returns the native Swiper instance so existing product/media behavior
can keep using `slideTo`, `slidePrev`, `slideNext`, `update`, and Swiper events.
