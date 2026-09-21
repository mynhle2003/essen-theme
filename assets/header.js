(() => {
  const HEADER_SELECTOR = '.header-top[data-header-root]';
  const headerStates = new Map();
  const headerResizeObservers = new Map();
  const submenuCloseTimers = new WeakMap();
  const menuToggleButtons = new WeakSet();
  const megaMenuBackdropControls = new WeakSet();
  const accountElements = new WeakSet();
  const localizationSheetDetails = new WeakSet();
  const footerLocalizationStates = new WeakMap();
  const openAccountSheets = new WeakSet();
  const mobileMegaMenuOrigins = new Map();
  let lastScrollY = window.scrollY;
  let frameId = null;

  const getHeaderRoot = (headerTop) => headerTop.closest('.shopify-section') || headerTop;

  const setHeaderMenuState = (header, isOpen) => {
    const container = header.querySelector('.header-top') || header;
    const drawer = container.querySelector('[data-header-mobile-drawer]');
    container.classList.toggle('header-top--menu-open', isOpen);
    document.body.classList.toggle('header-menu-open', isOpen && window.innerWidth <= 767);
    drawer?.setAttribute('aria-hidden', String(!isOpen));

    if (!isOpen) {
      closeLocalizationDialogs(header);
      drawer?.classList.remove('header__mobile-drawer--submenu-active');
      drawer?.querySelectorAll('.header__mobile-drawer-item.is-mobile-submenu-active').forEach((item) => {
        item.classList.remove('is-mobile-submenu-active');
        item.querySelector(':scope > .header__mobile-drawer-details')?.removeAttribute('open');
      });
      drawer?.querySelectorAll('[data-mobile-drawer-submenu-details]').forEach((details) => {
        details.classList.remove('is-mobile-submenu-active');
        details.removeAttribute('open');
      });
      drawer?.querySelectorAll('[data-header-menu-back]').forEach((back) => {
        back.hidden = true;
      });
      container.querySelector('.header-menu')?.querySelectorAll('.header-menu__details.is-mobile-submenu-active').forEach((details) => {
        details.classList.remove('is-mobile-submenu-active');
        details.closest('.header-menu__item')?.classList.remove('is-mobile-submenu-active');
        details.removeAttribute('open');
      });
    }

    container.querySelectorAll('[data-header-menu-toggle]').forEach((toggle) => {
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });
  };

  const closeSearchOverlay = () => {
    const overlay = document.querySelector('[data-search-overlay]');
    if (!overlay || overlay.hasAttribute('hidden')) return;
    overlay.querySelector('[data-search-overlay-close]')?.click();
  };

  const closeCartDrawer = () => {
    const drawer = document.querySelector('[data-cart-drawer]');
    if (!drawer?.classList.contains('is-open')) return;
    drawer.querySelector('.cart-drawer__close, [data-cart-drawer-close]')?.click();
  };

  const closeAccountSheet = (account) => {
    if (!openAccountSheets.has(account)) return;
    if (typeof account.close === 'function') {
      account.close();
      return;
    }
    account.querySelector('[slot="signed-out-avatar"]')?.click();
  };

  const getLocalizationDialog = (details) => {
    const id = details?.dataset.localizationDialogId;
    return id ? document.getElementById(id) : null;
  };

  const closeLocalizationDialogs = (header, activeDetails = null) => {
    header.querySelectorAll('.header-localization__details').forEach((details) => {
      if (details === activeDetails) return;
      const dialog = getLocalizationDialog(details);
      if (!dialog?.open) return;
      window.ThemeOverlay?.get(dialog)?.close({ restoreFocus: false });
    });
  };

  const closeLocalizationSheet = (details, { restoreFocus = false } = {}) => {
    const dialog = getLocalizationDialog(details);
    if (dialog?.open) {
      const overlay = window.ThemeOverlay?.get(dialog);
      if (overlay) overlay.close({ restoreFocus });
      else dialog.close();
      return;
    }

    details.classList.remove('is-submenu-closing');
    details.removeAttribute('open');
    if (restoreFocus) {
      details.querySelector(':scope > .header-localization__summary')?.focus({ preventScroll: true });
    }
    scheduleUpdate();
  };

  const releaseHoverSubmenuFocus = (details) => {
    if (details?.dataset.headerSubmenuTrigger !== 'hover') return;

    const summary = details.querySelector(':scope > summary');
    if (summary?.matches(':focus') && !summary.matches(':focus-visible')) {
      summary.blur();
    }
  };

  const closeHeaderDetails = (details) => {
    details.removeAttribute('open');
    details.classList.remove('is-submenu-closing');
    releaseHoverSubmenuFocus(details);
  };

  const closeHeaderSurfaces = (header, active = {}) => {
    closeLocalizationDialogs(header, active.details);
    header.querySelectorAll('details[open], details.is-submenu-closing').forEach((details) => {
      if (details === active.details) return;
      if (details.classList.contains('header-localization__details')) {
        closeLocalizationSheet(details);
        return;
      }
      closeHeaderDetails(details);
    });

    if (!active.menu) setHeaderMenuState(header, false);
    if (!active.search) closeSearchOverlay();
    if (!active.cart) closeCartDrawer();
    header.querySelectorAll('shopify-account').forEach((account) => {
      if (account !== active.account) closeAccountSheet(account);
    });
  };

  const updateHeaderHeight = (header) => {
    const height = `${header.offsetHeight}px`;
    header.style.setProperty('--header-height', height);
    document.documentElement.style.setProperty('--header-height', height);
  };

  const getStickyTarget = (header, stickyType) => {
    if (stickyType === 'top_header_only') {
      return header.querySelector('.header-top') || header;
    }

    if (stickyType === 'bottom_header_only') {
      return (
        header.querySelector('[data-header-region="bottom"]') ||
        header.querySelector('.header-top') ||
        header
      );
    }

    return header;
  };

  const synchronizeHeaderColorScheme = (header, useBaseScheme) => {
    const headerTop = header.querySelector('[data-header-transparent-scheme]');
    const transparentScheme = headerTop?.dataset.headerTransparentScheme;

    if (!headerTop || !transparentScheme) return;

    headerTop.classList.toggle('header-top--transparent-scheme', !useBaseScheme);
    headerTop.classList.toggle('section-color-scope', !useBaseScheme);
    headerTop.classList.toggle(transparentScheme, !useBaseScheme);
  };

  const hasOpenHeaderSubmenu = (header) => Boolean(header.querySelector('details[open], details:hover, details:focus-within, details.is-submenu-closing'));

  const hasOpenMegaMenu = (header) => Array.from(
    header.querySelectorAll('.header-menu__details--mega'),
  ).some((details) => {
    if (details.open || details.classList.contains('is-submenu-closing')) return true;

    // Hover/focus only opens a mega menu when this menu is configured to use
    // the hover trigger. In click mode, these states must not activate the
    // backdrop before the visitor opens the details element.
    return details.dataset.headerSubmenuTrigger === 'hover' && details.matches(':hover, :focus-within');
  });

  const synchronizeSubmenuOffsets = (header) => {
    const headerTop = header.querySelector('.header-top');
    if (!headerTop) return;

    const headerBottom = headerTop.getBoundingClientRect().bottom;
    header.querySelectorAll('.header-localization__details, .header-menu__details').forEach((details) => {
      const detailsBottom = details.getBoundingClientRect().bottom;
      details.style.setProperty('--header-submenu-offset', `${Math.max(0, headerBottom - detailsBottom)}px`);
    });

    const headerWidth = headerTop.getBoundingClientRect().width;
    header.querySelectorAll('.header-menu__details--mega').forEach((details) => {
      details.style.setProperty('--header-mega-inline-offset', `${Math.max(0, details.getBoundingClientRect().left)}px`);
      details.style.setProperty('--header-mega-width', `${headerWidth}px`);
    });
  };

  const updateHeaderState = (forceShow = false) => {
    const scrollY = Math.max(window.scrollY, 0);
    const scrollDelta = scrollY - lastScrollY;

    headerStates.forEach(({ header, stickyType }) => {
      synchronizeSubmenuOffsets(header);
      const isSticky = stickyType !== 'none';
      const isScrolled = isSticky && scrollY > 8;
      const isSubmenuOpen = hasOpenHeaderSubmenu(header);
      const isMegaMenuOpen = hasOpenMegaMenu(header);
      const isSearchOpen = header.classList.contains('header--search-open');
      const isCartOpen = header.classList.contains('header--cart-open');
      const headerTop = header.querySelector('.header-top');
      if (window.innerWidth >= 1150 && headerTop?.classList.contains('header-top--menu-open')) {
        setHeaderMenuState(header, false);
      } else if (window.innerWidth > 767) {
        document.body.classList.remove('header-menu-open');
      }
      header.classList.toggle('header--is-scrolled', isScrolled);
      header.classList.toggle('header--submenu-open', isSubmenuOpen);
      header.classList.toggle('header--mega-menu-open', isMegaMenuOpen);
      header.querySelectorAll('[data-header-mega-menu-backdrop]').forEach((backdrop) => {
        backdrop.setAttribute('aria-hidden', String(!isMegaMenuOpen));
      });
      synchronizeHeaderColorScheme(header, isScrolled || isSubmenuOpen || isSearchOpen || isCartOpen);

      if (stickyType !== 'scroll_up') {
        header.classList.remove('header--is-hidden');
        return;
      }

      const revealThreshold = Math.max(header.offsetHeight, 64);
      const shouldReveal =
        forceShow ||
        scrollY <= 8 ||
        scrollDelta < -2 ||
        header.contains(document.activeElement);

      if (shouldReveal) {
        header.classList.remove('header--is-hidden');
      } else if (scrollDelta > 2 && scrollY > revealThreshold) {
        header.classList.add('header--is-hidden');
      }
    });

    lastScrollY = scrollY;
    frameId = null;
  };

  const scheduleUpdate = () => {
    if (frameId === null) {
      frameId = window.requestAnimationFrame(() => updateHeaderState());
    }
  };

  const organizeHeaderLayout = (header) => {
    const headerTop = header.querySelector('.header-top[data-header-blocks]') || header.querySelector('.header-top');
    const blocks = headerTop?.querySelector('[data-header-blocks]');
    const leftColumn = headerTop?.querySelector('[data-header-column="left"]');
    const centerColumn = headerTop?.querySelector('[data-header-column="center"]');
    const rightColumn = headerTop?.querySelector('[data-header-column="right"]');

    if (!headerTop || !blocks || !leftColumn || !centerColumn || !rightColumn || headerTop.dataset.layoutReady === 'true') {
      return;
    }

    const items = Array.from(blocks.children);
    const logo = items.find((item) => item.matches('.header-logo'));
    const logoPosition = logo?.classList.contains('header-logo--left') ? 'left' : 'center';
    headerTop.dataset.logoPosition = logoPosition;

    items.forEach((item) => {
      if (item.matches('.header-logo')) {
        (logoPosition === 'left' ? leftColumn : centerColumn).append(item);
      } else if (item.matches('.header-menu')) {
        (logoPosition === 'left' ? centerColumn : leftColumn).append(item);
      } else if (item.matches('.header-menu-toggle')) {
        leftColumn.append(item);
      } else if (item.matches('.header__mobile-drawer')) {
        headerTop.append(item);
      } else {
        rightColumn.append(item);
      }
    });

    headerTop.dataset.layoutReady = 'true';
  };

  const initializeMegaMenus = (header) => {
    header.querySelectorAll('[data-header-mega-menu]').forEach((megaMenu) => {
      const trigger = megaMenu.dataset.megaMenuTrigger;
      if (!trigger) return;

      const menuItem = Array.from(header.querySelectorAll('.header-menu__item')).find(
        (item) => item.dataset.menuTitle === trigger,
      );
      const details = menuItem?.querySelector(':scope > .header-menu__details');
      if (!details) return;

      const submenu = details.querySelector(':scope > .header-menu__submenu');
      megaMenu.querySelector('[data-mega-menu-navigation]')?.append(submenu);
      menuItem.classList.toggle('header-menu__item--highlight', megaMenu.classList.contains('header-mega-menu--highlight'));
      menuItem.style.setProperty('--header-menu-highlight-color', megaMenu.style.getPropertyValue('--mega-menu-highlight-color'));
      details.classList.add('header-menu__details--mega');
      details.append(megaMenu);
      megaMenu.hidden = false;
    });
  };

  const initializeHeader = (headerTop) => {
    const header = getHeaderRoot(headerTop);
    if (headerStates.has(header)) return;

    const headerScheme = headerTop.dataset.headerScheme;
    const stickyType = headerTop.dataset.stickyType || 'none';

    header.classList.add('header', 'section-color-scope');
    if (headerScheme) header.classList.add(headerScheme);
    if (headerTop.hasAttribute('data-header-overlay')) header.classList.add('header--overlay');
    updateHeaderHeight(header);
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => updateHeaderHeight(header));
      observer.observe(header);
      headerResizeObservers.set(header, observer);
    }
    if (headerTop.hasAttribute('data-header-overlap-first-section')) {
      header.classList.add('header--overlap-first-section');
    }
    header.dataset.stickyType = stickyType;

    organizeHeaderLayout(header);
    initializeMegaMenus(header);
    const target = getStickyTarget(header, stickyType);

    if (target !== header) {
      target.dataset.headerStickyTarget = stickyType;
    }

    headerStates.set(header, { header, stickyType });
    initializeMenuToggles(header);
    initializeHeaderSubmenus(header);
    initializeMegaMenuBackdrops(header);
    initializeMobileDrawer(header);
    initializeLocalizationSheets(header);
    initializeAccountSheets(header);
    updateHeaderState(true);
  };

  const initializeHeaderSubmenus = (header) => {
    const clearSubmenuClose = (details) => {
      const timer = submenuCloseTimers.get(details);
      if (timer) window.clearTimeout(timer);
      submenuCloseTimers.delete(details);
      details.classList.remove('is-submenu-closing');
    };

    const scheduleSubmenuClose = (details) => {
      clearSubmenuClose(details);
      if (window.innerWidth <= 767) return;
      if (!details.open) return;
      const trigger = details.dataset.headerSubmenuTrigger || 'click';
      details.classList.add('is-submenu-closing');
      const timer = window.setTimeout(() => {
        const keepFocusOpen =
          details.matches(':focus-within') &&
          (trigger === 'click' || details.querySelector(':scope > summary')?.matches(':focus-visible'));
        if (!details.dataset.editorSelected && !details.matches(':hover') && !keepFocusOpen) {
          closeHeaderDetails(details);
          scheduleUpdate();
        }
      }, 100);
      submenuCloseTimers.set(details, timer);
    };

    header.querySelectorAll('details:not([data-mobile-drawer-details]):not([data-mobile-drawer-submenu-details])').forEach((details) => {
      const trigger = details.dataset.headerSubmenuTrigger || 'click';
      const summary = details.querySelector(':scope > summary');

      // `pointerout` bubbles whenever the pointer crosses child elements (such as
      // the chevron), which made the closing state flicker. These events only
      // fire when the pointer enters or leaves the complete details boundary.
      details.addEventListener('pointerenter', () => {
        if (window.innerWidth <= 767) return;
        if (trigger === 'hover') {
          closeHeaderSurfaces(header, { details });
          details.open = true;
        }
        clearSubmenuClose(details);
        scheduleUpdate();
      });

      details.addEventListener('pointerleave', () => {
        if (window.innerWidth <= 767) return;
        scheduleSubmenuClose(details);
        scheduleUpdate();
      });

      details.addEventListener('focusin', () => {
        if (window.innerWidth <= 767) return;
        if (trigger === 'hover') {
          closeHeaderSurfaces(header, { details });
          details.open = true;
        }
        clearSubmenuClose(details);
        scheduleUpdate();
      });

      details.addEventListener('focusout', (event) => {
        if (window.innerWidth <= 767) return;
        if (!details.contains(event.relatedTarget)) scheduleSubmenuClose(details);
        scheduleUpdate();
      });

      if (trigger === 'hover') {
        summary?.addEventListener('click', (event) => {
          if (window.innerWidth <= 767) return;
          if (event.defaultPrevented) return;
          // Keep the hover-mode dropdown open while the pointer remains inside;
          // otherwise the native details toggle would immediately close it.
          event.preventDefault();
          closeHeaderSurfaces(header, { details });
          details.open = true;
          clearSubmenuClose(details);
          scheduleUpdate();
        });
      }

      summary?.addEventListener('click', (event) => {
        if (window.innerWidth > 767) return;
        if (details.classList.contains('header-localization__details')) return;

        const menu = details.closest('.header-menu');
        if (!menu) return;
        event.preventDefault();

        menu.querySelectorAll('.header-menu__details.is-mobile-submenu-active').forEach((activeDetails) => {
          activeDetails.classList.remove('is-mobile-submenu-active');
          activeDetails.closest('.header-menu__item')?.classList.remove('is-mobile-submenu-active');
          if (activeDetails !== details) activeDetails.removeAttribute('open');
        });
        details.open = true;
        details.classList.add('is-mobile-submenu-active');
        details.closest('.header-menu__item')?.classList.add('is-mobile-submenu-active');
        menu.classList.add('header-menu--mobile-submenu-active');
        menu.querySelectorAll('[data-header-menu-back]').forEach((back) => {
          back.hidden = false;
        });
        scheduleUpdate();
      });

      details.addEventListener('toggle', () => {
        if (details.open) {
          closeHeaderSurfaces(header, window.innerWidth <= 767 ? { details, menu: true } : { details });
        }
        scheduleUpdate();
      });
    });

    header.addEventListener('toggle', scheduleUpdate, true);
  };

  const initializeMegaMenuBackdrops = (header) => {
    header.querySelectorAll('[data-header-mega-menu-backdrop]').forEach((backdrop) => {
      if (megaMenuBackdropControls.has(backdrop)) return;
      megaMenuBackdropControls.add(backdrop);

      backdrop.addEventListener('click', () => {
        closeHeaderSurfaces(header);
        scheduleUpdate();
      });
    });
  };

  const initializeMenuToggles = (header) => {
    header.querySelectorAll('[data-header-menu-toggle]').forEach((toggle) => {
      if (menuToggleButtons.has(toggle)) return;

      menuToggleButtons.add(toggle);
      const container = toggle.closest('.header-top') || header;
      const drawer = container.querySelector('[data-header-mobile-drawer]');

      toggle.addEventListener('click', () => {
        const isOpen = !container.classList.contains('header-top--menu-open');
        if (isOpen) closeHeaderSurfaces(header, { menu: true });
        setHeaderMenuState(header, isOpen);
      });

      drawer?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          setHeaderMenuState(header, false);
          toggle.focus();
        }
      });
    });
  };

  const initializeMobileDrawer = (header) => {
    const container = header.querySelector('.header-top') || header;
    const drawer = container.querySelector('[data-header-mobile-drawer]');
    if (!drawer || drawer.dataset.ready === 'true') return;
    drawer.dataset.ready = 'true';

    const setBackLabel = (title) => {
      drawer.querySelectorAll('[data-header-menu-back]').forEach((back) => { back.hidden = false; });
      drawer.querySelectorAll('[data-header-menu-back-label]').forEach((label) => {
        label.textContent = title || label.dataset.headerMenuBackDefaultLabel || 'Menu';
      });
    };

    const clearActiveSubmenu = () => {
      drawer.querySelectorAll('[data-mobile-drawer-submenu-details]').forEach((details) => {
        details.classList.remove('is-mobile-submenu-active');
        details.removeAttribute('open');
      });
      drawer.querySelectorAll('.header__mobile-drawer-item.is-mobile-submenu-active').forEach((item) => {
        item.classList.remove('is-mobile-submenu-active');
        item.querySelector(':scope > .header__mobile-drawer-details')?.removeAttribute('open');
      });
    };

    const resetSubmenu = (animate = true) => {
      drawer.classList.remove('header__mobile-drawer--submenu-active');
      drawer.querySelectorAll('[data-header-menu-back]').forEach((back) => { back.hidden = true; });
      drawer.querySelectorAll('[data-header-menu-back-label]').forEach((label) => {
        label.textContent = label.dataset.headerMenuBackDefaultLabel || 'Menu';
      });
      if (animate) window.setTimeout(clearActiveSubmenu, 320);
      else clearActiveSubmenu();
    };

    const backToParentSubmenu = () => {
      const activeNestedDetails = drawer.querySelector('[data-mobile-drawer-submenu-details].is-mobile-submenu-active');
      if (!activeNestedDetails) {
        resetSubmenu();
        return;
      }

      activeNestedDetails.classList.remove('is-mobile-submenu-active');
      activeNestedDetails.removeAttribute('open');
      const rootSummary = activeNestedDetails.closest('[data-mobile-drawer-details]')?.querySelector(':scope > summary');
      setBackLabel(rootSummary?.querySelector('span')?.textContent?.trim());
    };

    const moveMegaMenuToMobileDrawer = (item) => {
      const trigger = item.dataset.menuTitle;
      const featuredSlot = trigger
        ? drawer.querySelector(`[data-mobile-mega-featured-slot="${CSS.escape(trigger)}"]`)
        : null;
      const slot = trigger ? drawer.querySelector(`[data-mobile-mega-slot="${CSS.escape(trigger)}"]`) : null;
      const megaMenu = trigger
        ? Array.from(header.querySelectorAll('[data-header-mega-menu]')).find((menu) => menu.dataset.megaMenuTrigger === trigger)
        : null;
      const featured = megaMenu?.querySelector(':scope .header-mega-menu__featured');
      if (!featuredSlot || !slot || !megaMenu) return;

      if (!mobileMegaMenuOrigins.has(megaMenu)) {
        mobileMegaMenuOrigins.set(megaMenu, {
          parent: megaMenu.parentElement,
          featured,
          featuredParent: featured?.parentElement,
          featuredNextSibling: featured?.nextSibling,
        });
      }
      if (featured) featuredSlot.append(featured);
      slot.append(megaMenu);
      megaMenu.hidden = false;
      item.classList.add('has-mobile-mega');
    };

    drawer.querySelectorAll('[data-mobile-drawer-details] > summary').forEach((summary) => {
      summary.addEventListener('click', (event) => {
        if (window.innerWidth > 767) return;
        event.preventDefault();
        resetSubmenu(false);
        const details = summary.parentElement;
        const item = details?.closest('.header__mobile-drawer-item');
        if (!details || !item) return;
        moveMegaMenuToMobileDrawer(item);
        details.open = true;
        window.requestAnimationFrame(() => {
          item.classList.add('is-mobile-submenu-active');
          drawer.classList.add('header__mobile-drawer--submenu-active');
          setBackLabel(summary.querySelector('span')?.textContent?.trim());
        });
      });
    });

    drawer.querySelectorAll('[data-mobile-drawer-submenu-details] > summary').forEach((summary) => {
      summary.addEventListener('click', (event) => {
        if (window.innerWidth > 767) return;
        event.preventDefault();

        const details = summary.parentElement;
        const rootDetails = details?.closest('[data-mobile-drawer-details]');
        const rootItem = rootDetails?.closest('.header__mobile-drawer-item');
        if (!details || !rootItem?.classList.contains('is-mobile-submenu-active')) return;

        drawer.querySelectorAll('[data-mobile-drawer-submenu-details].is-mobile-submenu-active').forEach((activeDetails) => {
          if (activeDetails === details) return;
          activeDetails.classList.remove('is-mobile-submenu-active');
          activeDetails.removeAttribute('open');
        });

        details.open = true;
        window.requestAnimationFrame(() => {
          details.classList.add('is-mobile-submenu-active');
          setBackLabel(summary.querySelector('span')?.textContent?.trim());
        });
      });
    });

    drawer.querySelectorAll('[data-header-menu-back]').forEach((back) => {
      back.addEventListener('click', backToParentSubmenu);
    });
    drawer.querySelectorAll('[data-header-menu-backdrop]').forEach((backdrop) => {
      backdrop.addEventListener('click', () => setHeaderMenuState(header, false));
    });
    drawer.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link) return;

      // Let the anchor's default navigation run before collapsing the drawer.
      // Closing the active <details> during the same click event can remove the
      // active submenu before the browser activates a real child-link URL.
      window.setTimeout(() => setHeaderMenuState(header, false), 0);
    });
  };

  const restoreMobileMegaMenus = () => {
    if (window.innerWidth <= 767) return;
    mobileMegaMenuOrigins.forEach((origin, megaMenu) => {
      if (origin.featured?.isConnected && origin.featuredParent?.isConnected) {
        const nextSibling = origin.featuredNextSibling?.parentNode === origin.featuredParent
          ? origin.featuredNextSibling
          : null;
        origin.featuredParent.insertBefore(origin.featured, nextSibling);
      }
      if (origin.parent?.isConnected) origin.parent.append(megaMenu);
      mobileMegaMenuOrigins.delete(megaMenu);
    });
  };

  const initializeLocalizationSheets = (header) => {
    header.querySelectorAll('.header-localization__details').forEach((details) => {
      if (localizationSheetDetails.has(details)) return;
      localizationSheetDetails.add(details);

      const summary = details.querySelector(':scope > .header-localization__summary');
      summary?.addEventListener('click', (event) => {
        if (window.innerWidth > 767) return;
        event.preventDefault();

        const dialog = getLocalizationDialog(details);
        const overlay = dialog ? window.ThemeOverlay?.get(dialog) : null;
        if (!dialog || !overlay) return;

        if (dialog.open) {
          overlay.close({ restoreFocus: true });
          return;
        }

        closeHeaderSurfaces(header, { details, menu: true });
        overlay.open({ opener: summary });
        scheduleUpdate();
      });
    });

  };

  const initializeFooterLocalizations = (root = document) => {
    const localizations = [];
    if (root.matches?.('.localization-block')) localizations.push(root);
    root.querySelectorAll?.('.localization-block').forEach((localization) => localizations.push(localization));

    localizations.forEach((localization) => {
      initializeLocalizationSheets(localization);
      localization.querySelectorAll(':scope > .header-localization__details').forEach((details) => {
        if (footerLocalizationStates.has(details)) return;

        const controller = new AbortController();
        const state = { closeTimer: 0, controller };
        const clearCloseTimer = () => {
          if (!state.closeTimer) return;
          window.clearTimeout(state.closeTimer);
          state.closeTimer = 0;
        };
        const scheduleClose = () => {
          clearCloseTimer();
          state.closeTimer = window.setTimeout(() => {
            state.closeTimer = 0;
            if (!details.matches(':hover') && !details.matches(':focus-within')) {
              details.removeAttribute('open');
              details.classList.remove('is-submenu-closing');
            }
          }, 100);
        };
        const openOnHover = () => {
          if (window.innerWidth <= 767 || details.dataset.headerSubmenuTrigger !== 'hover') return;
          clearCloseTimer();
          details.classList.remove('is-submenu-closing');
          details.open = true;
        };
        const closeOnLeave = () => {
          if (window.innerWidth <= 767 || details.dataset.headerSubmenuTrigger !== 'hover' || !details.open) return;
          details.classList.add('is-submenu-closing');
          scheduleClose();
        };

        details.addEventListener('pointerenter', openOnHover, { signal: controller.signal });
        details.addEventListener('pointerleave', closeOnLeave, { signal: controller.signal });
        details.addEventListener('focusin', openOnHover, { signal: controller.signal });
        details.addEventListener('focusout', closeOnLeave, { signal: controller.signal });
        details.addEventListener('toggle', () => {
          if (details.open) {
            clearCloseTimer();
            details.classList.remove('is-submenu-closing');
            localization.querySelectorAll(':scope > .header-localization__details[open]').forEach((otherDetails) => {
              if (otherDetails !== details) otherDetails.removeAttribute('open');
            });
          }
          scheduleUpdate();
        }, { signal: controller.signal });
        footerLocalizationStates.set(details, state);
      });
    });
  };

  const removeFooterLocalizations = (root) => {
    const localizations = [];
    if (root.matches?.('.localization-block')) localizations.push(root);
    root.querySelectorAll?.('.localization-block').forEach((localization) => localizations.push(localization));

    localizations.forEach((localization) => {
      localization.querySelectorAll(':scope > .header-localization__details').forEach((details) => {
        const state = footerLocalizationStates.get(details);
        if (!state) return;
        state.controller.abort();
        if (state.closeTimer) window.clearTimeout(state.closeTimer);
        footerLocalizationStates.delete(details);
      });
    });
  };

  const destroyLocalizationOverlays = (root) => {
    const details = [];
    if (root.matches?.('.header-localization__details')) details.push(root);
    root.querySelectorAll?.('.header-localization__details').forEach((item) => details.push(item));

    details.forEach((item) => {
      const dialog = getLocalizationDialog(item);
      if (dialog?.parentElement !== document.body) return;
      window.ThemeOverlay?.get(dialog)?.destroy();
    });
  };

  const initializeAccountSheets = (header) => {
    header.querySelectorAll('shopify-account').forEach((account) => {
      if (accountElements.has(account)) return;
      accountElements.add(account);
      account.addEventListener('open', () => {
        openAccountSheets.add(account);
        const headerTop = header.querySelector('.header-top') || header;
        const keepMobileMenuOpen =
          window.innerWidth <= 767 && headerTop.classList.contains('header-top--menu-open');

        closeHeaderSurfaces(header, { account, menu: keepMobileMenuOpen });
        scheduleUpdate();
      });
      account.addEventListener('close', () => {
        openAccountSheets.delete(account);
        scheduleUpdate();
      });
    });
  };

  const initializeHeaders = (root = document) => {
    if (root.matches?.(HEADER_SELECTOR)) {
      initializeHeader(root);
    }

    root.querySelectorAll?.(HEADER_SELECTOR).forEach(initializeHeader);
  };

  const removeHeaders = (root) => {
    const headers = [];

    if (root.matches?.(HEADER_SELECTOR)) {
      headers.push(getHeaderRoot(root));
    }

    root.querySelectorAll?.(HEADER_SELECTOR).forEach((headerTop) => headers.push(getHeaderRoot(headerTop)));
    headers.forEach((header) => {
      headerStates.delete(header);
      headerResizeObservers.get(header)?.disconnect();
      headerResizeObservers.delete(header);
    });
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', () => {
    restoreMobileMegaMenus();
    scheduleUpdate();
  });

  document.addEventListener('focusin', (event) => {
    const headerTop = event.target.closest?.(HEADER_SELECTOR);
    const header = headerTop ? getHeaderRoot(headerTop) : null;
    header?.classList.remove('header--is-hidden');
  });

  document.addEventListener('search-overlay:open', (event) => {
    const header = event.detail?.header;
    if (!header) return;
    closeHeaderSurfaces(header, { search: true });
    header.classList.add('header--search-open');
    synchronizeHeaderColorScheme(header, true);
  });

  document.addEventListener('search-overlay:close', () => {
    headerStates.forEach(({ header }) => header.classList.remove('header--search-open'));
    scheduleUpdate();
  });

  document.addEventListener('cart-drawer:open', () => {
    headerStates.forEach(({ header }) => {
      closeHeaderSurfaces(header, { cart: true });
      header.classList.add('header--cart-open');
      synchronizeHeaderColorScheme(header, true);
    });
  });

  document.addEventListener('cart-drawer:close', () => {
    headerStates.forEach(({ header }) => header.classList.remove('header--cart-open'));
    scheduleUpdate();
  });

  document.addEventListener('shopify:section:load', (event) => {
    initializeHeaders(event.target);
    initializeFooterLocalizations(event.target);
  });

  document.addEventListener('shopify:section:unload', (event) => {
    destroyLocalizationOverlays(event.target);
    removeFooterLocalizations(event.target);
    removeHeaders(event.target);
  });

  document.addEventListener('shopify:block:select', (event) => {
    const megaMenu = event.target.closest?.('[data-header-mega-menu]');
    const details = megaMenu?.closest('.header-menu__details');
    if (!megaMenu || !details) return;

    megaMenu.dataset.editorSelected = 'true';
    details.dataset.editorSelected = 'true';
    details.open = true;
    details.classList.remove('is-submenu-closing');
    scheduleUpdate();
  });

  document.addEventListener('shopify:block:deselect', (event) => {
    const megaMenu = event.target.closest?.('[data-header-mega-menu]');
    const details = megaMenu?.closest('.header-menu__details');
    if (!megaMenu || !details) return;

    delete megaMenu.dataset.editorSelected;
    delete details.dataset.editorSelected;
    if (!details.matches(':hover') && !details.matches(':focus-within')) {
      details.removeAttribute('open');
    }
    scheduleUpdate();
  });

  initializeHeaders();
  initializeFooterLocalizations();
})();
