(() => {
  'use strict';
  if (window.__readingMode) return;
  window.__readingMode = true;
  let enabled = false;
  try { enabled = sessionStorage.getItem('reading-mode') === 'true'; } catch (_) { /* Storage can be disabled. */ }
  const icon = (paths) => `<svg class="reading-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const directoryIcon = icon('<path d="M9 5h11M9 12h11M9 19h11"/><path d="M4 5h.01M4 12h.01M4 19h.01"/>');
  const closeIcon = icon('<path d="m6 6 12 12M18 6 6 18"/>');
  const toggleMarkup = () => enabled
    ? `${icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16"/>')}<span>恢复原布局</span>`
    : `${icon('<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>')}<span>专注阅读</span>`;
  const launcherIcon = icon('<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15"/>');
  const resetIcon = icon('<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>');
  let toolPosition;
  let drag;
  let suppressClick = false;
  let statusTimer;
  const motions = new WeakMap();
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function showSurface(element, expanded, sheet = false) {
    if (!element || element.dataset.motionOpen === String(expanded)) return;
    element.dataset.motionOpen = String(expanded);
    motions.get(element)?.cancel();
    element.querySelector('.reading-directory-sheet')?.getAnimations().forEach(animation => animation.cancel());
    element.inert = !expanded;
    if (expanded) element.hidden = false;
    if (reducedMotion() || !element.animate || (!expanded && element.hidden)) {
      element.hidden = !expanded;
      return;
    }
    const frames = sheet
      ? [{opacity: 0}, {opacity: 1}]
      : [{opacity: 0, transform: 'translateY(6px) scale(.98)'}, {opacity: 1, transform: 'none'}];
    const animation = element.animate(expanded ? frames : [...frames].reverse(), {
      duration: expanded ? 180 : 130, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both'
    });
    motions.set(element, animation);
    if (sheet) element.querySelector('.reading-directory-sheet')?.animate(
      expanded ? [{transform: 'translateY(16px)'}, {transform: 'none'}]
        : [{transform: 'none'}, {transform: 'translateY(10px)'}],
      {duration: expanded ? 180 : 130, easing: 'cubic-bezier(.2,.7,.2,1)'}
    );
    animation.finished.then(() => {
      if (motions.get(element) !== animation) return;
      element.hidden = !expanded;
      animation.cancel();
      motions.delete(element);
    }).catch(() => { /* Opening/closing again cancels the previous motion. */ });
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem('reading-tools-position'));
    if (saved && [saved.x, saved.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) toolPosition = saved;
  } catch (_) { /* Use the safe default when storage is unavailable. */ }
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  function toolBounds(tools) {
    const viewport = window.visualViewport;
    const inset = document.getElementById('reading-tool-safe-area');
    const area = inset?.getBoundingClientRect();
    const left = Math.max(viewport?.offsetLeft || 0, area?.left || 0) + 12;
    const top = Math.max(viewport?.offsetTop || 0, area?.top || 0) + 12;
    const right = Math.min((viewport?.offsetLeft || 0) + (viewport?.width || innerWidth), area?.right || innerWidth) - 12;
    const bottom = Math.min((viewport?.offsetTop || 0) + (viewport?.height || innerHeight), area?.bottom || innerHeight) - 12;
    return {left, top, right, bottom, width: tools.offsetWidth, height: tools.offsetHeight};
  }
  function fitActions(tools) {
    const actions = tools.querySelector('.reading-tool-actions');
    const status = tools.querySelector('.reading-tool-status');
    if (!actions) return;
    const bounds = toolBounds(tools), box = tools.getBoundingClientRect();
    const width = Math.min(184, Math.max(0, bounds.right - bounds.left));
    actions.style.width = `${width}px`;
    actions.style.left = `${clamp(box.left, bounds.left, bounds.right - width) - box.left}px`;
    if (status) {
      status.style.width = `${width}px`;
      status.style.left = actions.style.left;
    }
    const above = box.top - bounds.top - 8, below = bounds.bottom - box.bottom - 8;
    tools.dataset.direction = above >= below ? 'up' : 'down';
    actions.style.maxHeight = `${Math.max(0, Math.max(above, below))}px`;
  }
  function placeTools(point) {
    const tools = document.querySelector('.reading-tools');
    if (!tools) return;
    const b = toolBounds(tools);
    let x = point?.x ?? b.left + (toolPosition?.x ?? 1) * Math.max(0, b.right - b.left - b.width);
    let y = point?.y ?? b.top + (toolPosition?.y ?? 1) * Math.max(0, b.bottom - b.top - b.height);
    x = clamp(x, b.left, b.right - b.width);
    y = clamp(y, b.top, b.bottom - b.height);
    const cookie = document.querySelector('.cc-window:not(.cc-invisible)');
    if (cookie && getComputedStyle(cookie).visibility !== 'hidden') {
      const c = cookie.getBoundingClientRect();
      if (x < c.right && x + b.width > c.left && y < c.bottom && y + b.height > c.top) y = clamp(c.top - b.height - 12, b.top, b.bottom - b.height);
    }
    tools.style.left = `${x}px`;
    tools.style.top = `${y}px`;
    fitActions(tools);
  }
  function rememberTools() {
    const tools = document.querySelector('.reading-tools');
    if (!tools) return;
    const b = toolBounds(tools), box = tools.getBoundingClientRect();
    toolPosition = {x: clamp((box.left - b.left) / Math.max(1, b.right - b.left - b.width), 0, 1), y: clamp((box.top - b.top) / Math.max(1, b.bottom - b.top - b.height), 0, 1)};
    try { sessionStorage.setItem('reading-tools-position', JSON.stringify(toolPosition)); } catch (_) { /* Keep the in-memory position. */ }
  }
  function resetTools() {
    const tools = document.querySelector('.reading-tools');
    const before = tools?.getBoundingClientRect();
    toolPosition = undefined;
    try { sessionStorage.removeItem('reading-tools-position'); } catch (_) { /* The default also works without storage. */ }
    placeTools();
    const after = tools?.getBoundingClientRect();
    const status = tools?.querySelector('.reading-tool-status');
    if (status) {
      clearTimeout(statusTimer);
      status.textContent = before && after && Math.hypot(before.left - after.left, before.top - after.top) < 1
        ? '图标已在默认位置' : '已移回右下角';
      statusTimer = setTimeout(() => { status.textContent = ''; }, 2400);
    }
  }
  function expandTools(expanded, focus = false) {
    const tools = document.querySelector('.reading-tools');
    if (!tools) return;
    const launcher = tools.querySelector('[data-reading-launcher]');
    launcher.setAttribute('aria-expanded', String(expanded));
    showSurface(tools.querySelector('.reading-tool-actions'), expanded);
    if (expanded) tools.querySelector('.reading-tool-status').textContent = '';
    fitActions(tools);
    if (focus) launcher.focus({preventScroll: true});
  }
  document.addEventListener('pointerdown', event => {
    const launcher = event.target.closest('[data-reading-launcher]');
    if (!launcher || event.button !== 0 || !event.isPrimary) return;
    suppressClick = false;
    const box = launcher.closest('.reading-tools').getBoundingClientRect();
    drag = {launcher, pointer: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false};
  });
  document.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    if (!drag.moved) drag.launcher.setPointerCapture(event.pointerId);
    drag.moved = true;
    suppressClick = true;
    expandTools(false);
    drag.launcher.closest('.reading-tools').classList.add('is-dragging');
    event.preventDefault();
    placeTools({x: drag.left + dx, y: drag.top + dy});
  }, {passive: false});
  function finishDrag(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const gesture = drag;
    if (gesture.moved) rememberTools();
    gesture.launcher.closest('.reading-tools')?.classList.remove('is-dragging');
    drag = undefined;
    // Touch browsers can delay or omit the compatibility click after a drag.
    // Handle a real tap on release, then ignore its possible duplicate click.
    // Keyboard and mouse clicks keep the normal semantic button path.
    if (event.type === 'pointerup' && event.pointerType === 'touch' && !gesture.moved) {
      gesture.launcher.click();
      suppressClick = true;
    }
  }
  document.addEventListener('pointerup', finishDrag);
  document.addEventListener('pointercancel', finishDrag);
  let opener;
  let chapters = [];
  let frame = 0;
  let resizeObserver;
  let mutationObserver;
  function stopTracking() {
    chapters = [];
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function updateCurrent() {
    frame = 0;
    if (!chapters.length) return;
    // Measure live positions: math, fonts and images may change section heights.
    const line = Math.min(96, window.innerHeight * .2);
    let current = chapters[0];
    for (const chapter of chapters) {
      if (chapter.heading.getBoundingClientRect().top <= line) current = chapter;
    }
    const content = chapters[0].heading.closest('.content');
    if (window.scrollY > 0 && content && content.getBoundingClientRect().bottom <= window.innerHeight + 1) current = chapters[chapters.length - 1];
    for (const chapter of chapters) {
      if (chapter === current) chapter.link.setAttribute('aria-current', 'location');
      else chapter.link.removeAttribute('aria-current');
      chapter.link.classList.remove('reading-current-parent');
    }
    // Highlight the exact subsection and give its ancestors a quieter cue.
    let list = current.link.parentElement.parentElement;
    while (list.parentElement.matches('li')) {
      list.parentElement.querySelector(':scope > a')?.classList.add('reading-current-parent');
      list = list.parentElement.parentElement;
    }
  }
  function scheduleCurrent() {
    if (chapters.length && !frame) frame = requestAnimationFrame(updateCurrent);
  }
  function track(content, panel) {
    chapters = [...panel.querySelectorAll('.reading-outline-link')].map(link => {
      let id;
      try { id = decodeURIComponent(link.hash.slice(1)); } catch (_) { return null; }
      const heading = document.getElementById(id);
      return heading && content.contains(heading) ? {link, heading} : null;
    }).filter(Boolean);
    if (!chapters.length) return;
    resizeObserver = new ResizeObserver(scheduleCurrent);
    resizeObserver.observe(content);
    mutationObserver = new MutationObserver(scheduleCurrent);
    mutationObserver.observe(content, {childList: true, subtree: true, characterData: true});
    scheduleCurrent();
  }
  function revealCurrent(panel) {
    updateCurrent();
    const link = panel.querySelector('[aria-current="location"]');
    const list = panel.querySelector('nav');
    if (!link || !list) return;
    const row = link.getBoundingClientRect(), box = list.getBoundingClientRect();
    // Scroll only the panel, once when opened. Never scroll the document or
    // override a reader who is browsing the outline themselves.
    list.scrollTop += row.top - box.top - (list.clientHeight - row.height) / 2;
  }
  const body = document.body;
  // Icarus replaces .searchbox during PJAX, while Insight keeps its original
  // root/input listeners. Retain that initialized node across page navigation.
  const searchRoot = document.querySelector('.searchbox');
  function restoreSearchRoot() {
    const replacement = document.querySelector('.searchbox');
    if (searchRoot && replacement && replacement !== searchRoot) replacement.replaceWith(searchRoot);
  }
  const close = (restore = false) => {
    const panel = document.getElementById('reading-directory');
    showSurface(panel, false, true);
    body.classList.remove('reading-directory-open');
    document.querySelector('[data-reading-directory]')?.setAttribute('aria-expanded', 'false');
    if (restore && opener?.isConnected) opener.focus({preventScroll: true});
  };
  function sync() {
    stopTracking();
    close();
    clearTimeout(statusTimer);
    document.querySelectorAll('.reading-tools, #reading-directory, #reading-tool-safe-area').forEach(el => el.remove());
    const article = document.querySelector('.column-main article.article');
    const isPost = !!article && !document.querySelector('.article-more') && !!document.querySelector('.post-navigation');
    body.classList.toggle('reading-mode', isPost && enabled);
    body.classList.toggle('reading-article', isPost);
    document.querySelectorAll('.reading-toc-column, .reading-toc-card').forEach(el => el.classList.remove('reading-toc-column', 'reading-toc-card'));
    if (!isPost) return;
    drag = undefined;
    const safeArea = document.createElement('div');
    safeArea.id = 'reading-tool-safe-area';
    safeArea.setAttribute('aria-hidden', 'true');
    body.append(safeArea);
    const tools = document.createElement('div');
    tools.className = 'reading-tools';
    tools.dataset.readingActive = String(enabled);
    tools.innerHTML = `<button type="button" class="reading-launcher" data-reading-launcher aria-label="阅读工具" aria-expanded="false" aria-controls="reading-tool-actions" aria-describedby="reading-tool-help" title="阅读工具（可拖动）">${launcherIcon}</button><div id="reading-tool-actions" class="reading-tool-actions" role="group" aria-label="阅读工具" hidden inert><button type="button" data-reading-toggle aria-pressed="${enabled}">${toggleMarkup()}</button><button type="button" data-reading-reset title="将拖动后的图标移回右下角">${resetIcon}<span>移回右下角</span></button><p class="reading-tool-hint">拖动图标可调整位置</p></div><span class="reading-tool-status" role="status" aria-live="polite" aria-atomic="true"></span><span id="reading-tool-help" class="reading-sr-only">点击展开或收起；可拖动移动。键盘可用 Alt 加方向键移动，Home 移回默认位置，Escape 收起。</span>`;
    // Keep fixed controls outside animated/transformed Icarus article cards.
    body.append(tools);
    placeTools();
    const toc = [...document.querySelectorAll('#toc')].find(el => !el.closest('.column-right-shadow'));
    if (!toc?.querySelector('a')) return;
    toc.classList.add('reading-toc-card');
    toc.closest('.column')?.classList.add('reading-toc-column');
    tools.querySelector('[data-reading-reset]').insertAdjacentHTML('beforebegin', `<button type="button" data-reading-directory aria-controls="reading-directory" aria-expanded="false">${directoryIcon}<span>目录</span></button>`);
    const panel = document.createElement('div');
    panel.id = 'reading-directory';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '文章目录');
    panel.innerHTML = `<div class="reading-directory-sheet"><div class="reading-directory-header"><strong>文章目录</strong><button type="button" data-reading-close aria-label="关闭目录" title="关闭目录">${closeIcon}</button></div><nav aria-label="文章章节"></nav></div>`;
    // Build a semantic outline instead of inheriting Bulma's level layout.
    // Keep each anchor's number, title and nested list as separate elements.
    function outline(source, depth = 0) {
      const list = document.createElement('ul');
      list.className = 'reading-outline';
      for (const item of source.children) {
        const original = item.querySelector(':scope > a');
        if (!original) continue;
        const row = document.createElement('li');
        const link = document.createElement('a');
        link.href = original.getAttribute('data-href') || original.getAttribute('href');
        link.className = 'reading-outline-link';
        link.style.setProperty('--outline-depth', depth);
        const parts = original.querySelectorAll('.level-item');
        const number = document.createElement('span');
        number.className = 'reading-outline-number';
        number.textContent = parts.length > 1 ? parts[0].textContent : '';
        const title = document.createElement('span');
        title.className = 'reading-outline-title';
        title.textContent = parts.length ? parts[parts.length - 1].textContent : original.textContent;
        link.append(number, title);
        row.append(link);
        const nested = item.querySelector(':scope > ul');
        if (nested) row.append(outline(nested, depth + 1));
        list.append(row);
      }
      return list;
    }
    const source = toc.querySelector('.menu > .menu-list');
    if (source) panel.querySelector('nav').append(outline(source));
    body.append(panel);
    track(article.querySelector('.content'), panel);
  }
  document.addEventListener('click', event => {
    const tools = document.querySelector('.reading-tools');
    if (tools && !tools.contains(event.target) && !event.target.closest('#reading-directory')) expandTools(false);
    const target = event.target.closest('button, a, #reading-directory');
    if (!target) return;
    if (target.matches('[data-reading-launcher]')) {
      if (suppressClick && event.detail !== 0) { event.preventDefault(); return; }
      expandTools(target.getAttribute('aria-expanded') !== 'true');
    } else if (target.matches('[data-reading-reset]')) {
      resetTools();
      expandTools(false, true);
    } else if (target.matches('[data-reading-toggle]')) {
      enabled = !enabled;
      try { sessionStorage.setItem('reading-mode', String(enabled)); } catch (_) { /* Keep the in-memory preference. */ }
      body.classList.toggle('reading-mode', enabled);
      target.setAttribute('aria-pressed', String(enabled));
      target.innerHTML = toggleMarkup();
      tools.dataset.readingActive = String(enabled);
      scheduleCurrent();
    } else if (target.matches('[data-reading-directory]')) {
      opener = tools.querySelector('[data-reading-launcher]');
      expandTools(false);
      const panel = document.getElementById('reading-directory');
      showSurface(panel, true, true);
      body.classList.add('reading-directory-open');
      target.setAttribute('aria-expanded', 'true');
      panel.querySelector('button').focus({preventScroll: true});
      revealCurrent(panel);
    } else if (target.matches('[data-reading-close]') || (target.id === 'reading-directory' && event.target === target)) close(true);
    else if (target.closest('#reading-directory') && target.matches('a')) {
      // Native hash navigation remains available without invoking PJAX.
      event.preventDefault();
      const id = decodeURIComponent(target.hash.slice(1));
      const heading = document.getElementById(id);
      close();
      if (heading) {
        history.replaceState(history.state, '', target.hash);
        heading.scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
        scheduleCurrent();
        heading.setAttribute('tabindex', '-1');
        heading.focus({preventScroll: true});
      }
    }
  });
  document.addEventListener('keydown', event => {
    const launcher = event.target.closest('[data-reading-launcher]');
    if (launcher && !body.classList.contains('reading-directory-open')) {
      if (event.key === 'Home') { event.preventDefault(); resetTools(); expandTools(false, true); }
      if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const box = launcher.closest('.reading-tools').getBoundingClientRect();
        placeTools({x: box.left + (event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0), y: box.top + (event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0)});
        rememberTools();
      }
    }
    if (event.key === 'Escape' && !body.classList.contains('reading-directory-open') && document.querySelector('[data-reading-launcher][aria-expanded="true"]')) { event.preventDefault(); expandTools(false, true); }
    if (!body.classList.contains('reading-directory-open')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (event.key === 'Tab') {
      const items = [...document.querySelectorAll('#reading-directory button, #reading-directory a[href]')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  // Cookie consent may arrive after the launcher. Keep its actions unobscured,
  // without observing our own style mutations or interfering with page scroll.
  let layoutFrame = 0;
  let observedCookie;
  let cookieObserver;
  function scheduleTools() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; placeTools(); });
  }
  function watchCookie() {
    const cookie = document.querySelector('.cc-window');
    if (cookie !== observedCookie) {
      cookieObserver?.disconnect();
      observedCookie = cookie;
      if (cookie) {
        cookieObserver = new MutationObserver(scheduleTools);
        cookieObserver.observe(cookie, {attributes: true, attributeFilter: ['class', 'style']});
      }
    }
    scheduleTools();
  }
  new MutationObserver(watchCookie).observe(body, {childList: true});
  watchCookie();
  window.addEventListener('scroll', scheduleCurrent, {passive: true});
  window.addEventListener('resize', () => { placeTools(); scheduleCurrent(); }, {passive: true});
  window.visualViewport?.addEventListener('resize', () => placeTools(), {passive: true});
  window.visualViewport?.addEventListener('scroll', () => placeTools(), {passive: true});
  window.addEventListener('orientationchange', () => requestAnimationFrame(() => placeTools()));
  window.addEventListener('popstate', scheduleCurrent);
  window.addEventListener('hashchange', scheduleCurrent);
  document.addEventListener('load', scheduleCurrent, true);
  document.fonts?.addEventListener('loadingdone', scheduleCurrent);
  document.addEventListener('pjax:send', () => { close(); stopTracking(); searchRoot?.classList.remove('show'); });
  document.addEventListener('pjax:complete', () => { restoreSearchRoot(); sync(); });
  window.addEventListener('pageshow', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
