/* ==========================================================================
   Meraki Table - shared behaviour
   Vanilla JavaScript, no dependencies, no build step.

   Modules
   01. Boot helpers
   02. Sticky header shadow + back to top (IntersectionObserver, no scroll spam)
   03. Mobile drawer
   04. Section reveal on entry
   05. FAQ / accordion
   06. Recipe index: search + filters
   07. Header + hero search handoff
   08. Recipe page: unit toggle, servings scaler, checkboxes, print, save
   09. Forms: inline validation and success states
   10. Cookie consent
   ========================================================================== */
(function () {
  'use strict';

  /* 01. BOOT HELPERS ====================================================== */
  var root = document.documentElement;
  root.classList.add('js');

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* Safe localStorage wrapper. Private browsing can throw on access. */
  var store = {
    get: function (key) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    },
    remove: function (key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  /* 02. STICKY HEADER SHADOW + BACK TO TOP ================================ */
  function initScrollWatchers() {
    var header = $('.site-header');
    var toTop = $('.back-to-top');
    if (!header && !toTop) { return; }

    /* A zero-height sentinel at the top of the document tells us when the
       page has scrolled, without listening to every scroll frame. */
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none;';
    document.body.prepend(sentinel);

    if (!('IntersectionObserver' in window)) { return; }

    var observer = new IntersectionObserver(function (entries) {
      var atTop = entries[0].isIntersecting;
      if (header) { header.classList.toggle('is-stuck', !atTop); }
      if (toTop) { toTop.classList.toggle('is-visible', !atTop); }
      /* A positive top margin grows the root upwards, so the sentinel stays
         "intersecting" until the page has actually scrolled 160px. A negative
         value here would shrink the root instead and report "scrolled" while
         still at the top of the document. */
    }, { rootMargin: '160px 0px 0px 0px', threshold: 0 });

    observer.observe(sentinel);

    if (toTop) {
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        var skip = $('#main');
        if (skip) { skip.setAttribute('tabindex', '-1'); skip.focus({ preventScroll: true }); }
      });
    }
  }

  /* 03. MOBILE DRAWER ===================================================== */
  function initDrawer() {
    var toggle = $('.hamburger');
    var drawer = $('#site-drawer');
    if (!toggle || !drawer) { return; }

    var closeBtn = $('.drawer-close', drawer);
    var lastFocused = null;

    function open() {
      lastFocused = document.activeElement;
      drawer.classList.add('is-open');
      drawer.removeAttribute('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('no-scroll');
      if (closeBtn) { closeBtn.focus(); }
    }

    function close() {
      drawer.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('no-scroll');
      if (lastFocused) { lastFocused.focus(); }
    }

    toggle.addEventListener('click', function () {
      if (drawer.classList.contains('is-open')) { close(); } else { open(); }
    });
    if (closeBtn) { closeBtn.addEventListener('click', close); }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) { close(); }
    });

    /* Keep focus inside the drawer while it is open. */
    drawer.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !drawer.classList.contains('is-open')) { return; }
      var focusables = $$('a[href], button:not([disabled]), input, select, textarea', drawer)
        .filter(function (el) { return el.offsetParent !== null; });
      if (!focusables.length) { return; }
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    /* Reset the drawer if the viewport grows past the desktop breakpoint. */
    window.matchMedia('(min-width: 1024px)').addEventListener('change', function (ev) {
      if (ev.matches && drawer.classList.contains('is-open')) { close(); }
    });
  }

  /* 04. SECTION REVEAL ON ENTRY ===========================================
     Content is visible by default in CSS. This only adds the rise-and-fade
     when motion is welcome and IntersectionObserver exists. */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) { return; }
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* 05. FAQ / ACCORDION =================================================== */
  function initAccordions() {
    $$('.faq-q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.faq-item');
        var expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        item.classList.toggle('is-open', !expanded);
      });
    });
  }

  /* 06. RECIPE INDEX: SEARCH + FILTERS ==================================== */
  function initRecipeFilters() {
    var grid = $('#recipe-results');
    if (!grid) { return; }

    var cards = $$('[data-recipe]', grid);
    var searchInput = $('#recipe-search');
    var countEl = $('#result-count');
    var emptyEl = $('#no-results');
    var chips = $$('.chip[data-filter-group]');
    var clearBtn = $('#clear-filters');

    var active = { category: 'all', cuisine: 'all', diet: 'all', time: 'all' };

    function matches(card) {
      var q = (searchInput && searchInput.value || '').trim().toLowerCase();
      if (q) {
        var haystack = (card.getAttribute('data-keywords') || '') + ' ' + card.textContent;
        if (haystack.toLowerCase().indexOf(q) === -1) { return false; }
      }
      for (var group in active) {
        if (active[group] === 'all') { continue; }
        var val = card.getAttribute('data-' + group) || '';
        if (group === 'time') {
          var mins = parseInt(card.getAttribute('data-time'), 10) || 999;
          if (active.time === 'under30' && mins > 30) { return false; }
          if (active.time === 'under60' && mins > 60) { return false; }
          if (active.time === 'over60' && mins <= 60) { return false; }
        } else if (val.split(' ').indexOf(active[group]) === -1) {
          return false;
        }
      }
      return true;
    }

    function apply() {
      var shown = 0;
      cards.forEach(function (card) {
        var ok = matches(card);
        card.hidden = !ok;
        if (ok) { shown++; }
      });
      if (countEl) {
        countEl.textContent = shown === cards.length
          ? 'Showing all ' + cards.length + ' recipes'
          : 'Showing ' + shown + ' of ' + cards.length + ' recipes';
      }
      if (emptyEl) { emptyEl.hidden = shown !== 0; }
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var group = chip.getAttribute('data-filter-group');
        var value = chip.getAttribute('data-filter-value');
        active[group] = value;
        $$('.chip[data-filter-group="' + group + '"]').forEach(function (c) {
          c.setAttribute('aria-pressed', String(c === chip));
        });
        apply();
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', apply);
      var form = searchInput.closest('form');
      if (form) { form.addEventListener('submit', function (e) { e.preventDefault(); apply(); }); }
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        active = { category: 'all', cuisine: 'all', diet: 'all', time: 'all' };
        if (searchInput) { searchInput.value = ''; }
        $$('.chip[data-filter-group]').forEach(function (c) {
          c.setAttribute('aria-pressed', String(c.getAttribute('data-filter-value') === 'all'));
        });
        apply();
      });
    }

    /* Accept ?q= and ?category= from the header search and category tiles. */
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    var cat = params.get('category');
    if (q && searchInput) { searchInput.value = q; }
    if (cat) {
      var preset = $('.chip[data-filter-group="category"][data-filter-value="' + cat + '"]');
      if (preset) { preset.click(); }
    }
    apply();
  }

  /* 07. HEADER + HERO SEARCH HANDOFF ======================================
     Every search field on the site resolves to the recipe index with the
     query pre-filled, so no search ever leads to a dead end. */
  function initSearchHandoff() {
    $$('form[data-search-handoff]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        var input = $('input[type="search"]', form);
        if (!input) { return; }
        e.preventDefault();
        var base = form.getAttribute('data-search-handoff');
        var value = input.value.trim();
        window.location.href = base + (value ? '?q=' + encodeURIComponent(value) : '');
      });
    });
  }

  /* 08. RECIPE PAGE ======================================================= */

  /* Format a decimal as an kitchen-friendly fraction. */
  function toFraction(value) {
    if (!isFinite(value) || value <= 0) { return '0'; }
    var whole = Math.floor(value);
    var frac = value - whole;
    var table = [
      [0.125, '1/8'], [0.25, '1/4'], [0.333, '1/3'], [0.375, '3/8'],
      [0.5, '1/2'], [0.625, '5/8'], [0.667, '2/3'], [0.75, '3/4'], [0.875, '7/8']
    ];
    var best = null;
    var bestDiff = 0.06;
    for (var i = 0; i < table.length; i++) {
      var diff = Math.abs(frac - table[i][0]);
      if (diff < bestDiff) { bestDiff = diff; best = table[i][1]; }
    }
    if (frac < 0.06) { return String(whole); }
    if (frac > 0.94) { return String(whole + 1); }
    if (!best) { return (Math.round(value * 100) / 100).toString(); }
    return whole > 0 ? whole + ' ' + best : best;
  }

  /* Round metric amounts the way a cook would actually measure them. */
  function roundMetric(value, unit) {
    if (!isFinite(value)) { return '0'; }
    var solidLiquid = (unit === 'g' || unit === 'ml');
    if (solidLiquid) {
      if (value >= 100) { return String(Math.round(value / 10) * 10); }
      if (value >= 20) { return String(Math.round(value / 5) * 5); }
      if (value >= 5) { return String(Math.round(value)); }
      return String(Math.round(value * 2) / 2);
    }
    if (unit === 'kg' || unit === 'litre' || unit === 'litres') {
      return String(Math.round(value * 100) / 100);
    }
    /* Counts, tablespoons, teaspoons and similar read better as fractions. */
    return toFraction(value);
  }

  function initRecipeTools() {
    /* A page can hold one recipe (a recipe page) or several (a collection
       page). Each recipe scales independently, while the Metric / Cups
       toggle in the utility bar converts every quantity on the page. */
    var articles = $$('[data-recipe-article]');
    if (!articles.length) { return; }

    var unitMode = 'metric';

    var recipes = articles.map(function (article) {
      var base = parseFloat(article.getAttribute('data-base-servings')) || 4;
      return {
        el: article,
        base: base,
        servings: base,
        quantities: $$('.qty', article),
        output: $('.js-servings-out', article),
        yieldEl: $('.js-yield', article),
        minus: $('.js-servings-minus', article),
        plus: $('.js-servings-plus', article)
      };
    });

    function renderOne(r) {
      var factor = r.servings / r.base;
      r.quantities.forEach(function (el) {
        var metric = parseFloat(el.getAttribute('data-m'));
        var metricUnit = el.getAttribute('data-mu') || '';
        var cups = el.getAttribute('data-c');
        var cupsUnit = el.getAttribute('data-cu') || '';

        if (unitMode === 'cups' && cups !== null && cups !== '') {
          el.textContent = (toFraction(parseFloat(cups) * factor) + ' ' + cupsUnit).trim();
        } else if (!isNaN(metric)) {
          el.textContent = (roundMetric(metric * factor, metricUnit) + ' ' + metricUnit).trim();
        }
      });
      if (r.output) { r.output.textContent = String(r.servings); }
      if (r.yieldEl) {
        /* Recipes that make cookies or loaves declare their own yield noun. */
        var one = r.el.getAttribute('data-yield-singular') || 'serve';
        var many = r.el.getAttribute('data-yield-plural') || 'serves';
        r.yieldEl.textContent = r.servings + ' ' + (r.servings === 1 ? one : many);
      }
      if (r.minus) { r.minus.disabled = r.servings <= 1; }
      if (r.plus) { r.plus.disabled = r.servings >= 48; }
    }

    function renderAll() { recipes.forEach(renderOne); }

    recipes.forEach(function (r) {
      if (r.minus) {
        r.minus.addEventListener('click', function () {
          r.servings = Math.max(1, r.servings - 1);
          renderOne(r);
        });
      }
      if (r.plus) {
        r.plus.addEventListener('click', function () {
          r.servings = Math.min(48, r.servings + 1);
          renderOne(r);
        });
      }
    });

    /* Metric / Cups toggle in the sticky utility bar. */
    $$('[data-unit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        unitMode = btn.getAttribute('data-unit');
        $$('[data-unit]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        $$('.js-unit-note-metric').forEach(function (n) { n.hidden = unitMode !== 'metric'; });
        $$('.js-unit-note-cups').forEach(function (n) { n.hidden = unitMode !== 'cups'; });
        renderAll();
      });
    });

    renderAll();

    /* Print. Uses the print stylesheet, opens no windows and downloads nothing. */
    var printBtn = $('#print-recipe');
    if (printBtn) {
      printBtn.addEventListener('click', function () { window.print(); });
    }

    /* Save. Stores a recipe slug locally only after the reader clicks Save. */
    var saveBtn = $('#save-recipe');
    if (saveBtn) {
      var slug = articles[0].getAttribute('data-recipe-slug') || window.location.pathname;
      var KEY = 'sp-saved-recipes';

      function readSaved() {
        try { return JSON.parse(store.get(KEY) || '[]'); } catch (e) { return []; }
      }
      function paint(list) {
        var isSaved = list.indexOf(slug) !== -1;
        saveBtn.setAttribute('aria-pressed', String(isSaved));
        saveBtn.textContent = isSaved ? 'Saved' : 'Save';
      }
      paint(readSaved());

      saveBtn.addEventListener('click', function () {
        var list = readSaved();
        var idx = list.indexOf(slug);
        if (idx === -1) { list.push(slug); } else { list.splice(idx, 1); }
        store.set(KEY, JSON.stringify(list));
        paint(list);
      });
    }

    /* Tick off ingredients. State is per visit and never leaves the browser. */
    articles.forEach(function (article) {
      var checkedCount = $('.js-checked-count', article);
      var boxes = $$('.ing-check input[type="checkbox"]', article);
      if (!checkedCount || !boxes.length) { return; }
      var update = function () {
        var done = boxes.filter(function (b) { return b.checked; }).length;
        checkedCount.textContent = done + ' of ' + boxes.length + ' ticked';
      };
      boxes.forEach(function (b) { b.addEventListener('change', update); });
      update();
    });
  }

  /* 09. FORMS ============================================================= */
  function initForms() {
    $$('form[data-validate]').forEach(function (form) {
      var successId = form.getAttribute('data-success');
      var success = successId ? document.getElementById(successId) : null;

      function fieldOf(input) { return input.closest('.field') || input.closest('.check-field'); }

      function validateInput(input) {
        var wrap = fieldOf(input);
        if (!wrap) { return true; }
        var errorEl = $('.field-error', wrap);
        var value = (input.value || '').trim();
        var message = '';

        if (input.hasAttribute('required')) {
          if (input.type === 'checkbox' && !input.checked) {
            message = errorEl && errorEl.getAttribute('data-required') || 'Please tick this box to continue.';
          } else if (input.type !== 'checkbox' && !value) {
            message = errorEl && errorEl.getAttribute('data-required') || 'This field is required.';
          }
        }
        if (!message && input.type === 'email' && value) {
          if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) {
            message = 'Enter an email address in the format name@example.com.';
          }
        }
        if (!message && input.hasAttribute('minlength') && value) {
          var min = parseInt(input.getAttribute('minlength'), 10);
          if (value.length < min) {
            message = 'Please write at least ' + min + ' characters so we can help properly.';
          }
        }

        if (message) {
          wrap.classList.add('has-error');
          input.setAttribute('aria-invalid', 'true');
          if (errorEl) { errorEl.textContent = message; }
          return false;
        }
        wrap.classList.remove('has-error');
        input.removeAttribute('aria-invalid');
        return true;
      }

      var inputs = $$('input, textarea, select', form).filter(function (el) {
        return el.type !== 'submit' && el.type !== 'button' && el.type !== 'hidden';
      });

      inputs.forEach(function (input) {
        input.addEventListener('blur', function () { validateInput(input); });
        input.addEventListener('input', function () {
          var wrap = fieldOf(input);
          if (wrap && wrap.classList.contains('has-error')) { validateInput(input); }
        });
        if (input.type === 'checkbox') {
          input.addEventListener('change', function () { validateInput(input); });
        }
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var firstBad = null;
        inputs.forEach(function (input) {
          if (!validateInput(input) && !firstBad) { firstBad = input; }
        });
        if (firstBad) { firstBad.focus(); return; }

        /* PLACEHOLDER - REPLACE WITH REAL VERIFIED INFORMATION BEFORE LAUNCH
           Connect this submit handler to the real form endpoint or mail
           service before the site goes live. */
        form.hidden = true;
        if (success) {
          success.classList.add('is-visible');
          success.setAttribute('tabindex', '-1');
          success.focus({ preventScroll: false });
        }
      });
    });
  }

  /* 10. COOKIE CONSENT ====================================================
     No non-essential cookie or tracking script runs before a choice is made.
     The banner records the choice locally and never blocks the page. */
  function initCookieConsent() {
    var banner = $('#cookie-banner');
    if (!banner) { return; }
    var KEY = 'sp-cookie-consent';
    var existing = store.get(KEY);

    if (!existing) {
      banner.classList.add('is-visible');
    }

    function decide(choice) {
      store.set(KEY, JSON.stringify({ choice: choice, at: new Date().toISOString() }));
      banner.classList.remove('is-visible');
      /* PLACEHOLDER - REPLACE WITH REAL VERIFIED INFORMATION BEFORE LAUNCH
         Load advertising and analytics tags here only when choice === 'accept'
         or when the matching preference toggle is on. */
    }

    var acceptBtn = $('#cookie-accept', banner);
    var rejectBtn = $('#cookie-reject', banner);
    var manageBtn = $('#cookie-manage', banner);
    var savePrefs = $('#cookie-save-prefs', banner);
    var prefs = $('#cookie-prefs', banner);

    if (acceptBtn) { acceptBtn.addEventListener('click', function () { decide('accept'); }); }
    if (rejectBtn) { rejectBtn.addEventListener('click', function () { decide('reject'); }); }
    if (manageBtn) {
      manageBtn.addEventListener('click', function () {
        var open = prefs.classList.toggle('is-visible');
        manageBtn.setAttribute('aria-expanded', String(open));
      });
    }
    if (savePrefs) {
      savePrefs.addEventListener('click', function () {
        var chosen = $$('input[name="cookie-pref"]:checked', prefs).map(function (i) { return i.value; });
        decide(chosen.length ? 'custom:' + chosen.join(',') : 'reject');
      });
    }

    /* Any "Cookie settings" link on the site reopens the banner. */
    $$('[data-open-cookie-settings]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        store.remove(KEY);
        banner.classList.add('is-visible');
        if (prefs) { prefs.classList.add('is-visible'); }
        if (manageBtn) { manageBtn.setAttribute('aria-expanded', 'true'); }
        banner.setAttribute('tabindex', '-1');
        banner.focus();
      });
    });
  }

  /* BOOT ================================================================== */
  function boot() {
    initScrollWatchers();
    initDrawer();
    initReveal();
    initAccordions();
    initRecipeFilters();
    initSearchHandoff();
    initRecipeTools();
    initForms();
    initCookieConsent();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
