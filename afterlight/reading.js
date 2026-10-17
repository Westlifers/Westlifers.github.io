(() => {
  const content = document.querySelector('[data-article-content]');
  if (!content) return;
  const tools = document.querySelector('.reading-tools'), launcher = tools?.querySelector('[data-reading-launcher]'), actions = tools?.querySelector('.reading-actions');
  const directory = document.getElementById('reading-directory');
  const focusButtons = [...document.querySelectorAll('[data-focus]')];
  let enabled = false, position, drag, suppressClick = false, frame, statusTimer;
  function announce(text) {
    const status = tools?.querySelector('[data-reading-status]'); if (!status) return;
    clearTimeout(statusTimer); status.textContent = text; status.classList.add('is-visible');
    statusTimer = setTimeout(() => status.classList.remove('is-visible'), 1800);
  }
  try {
    enabled = sessionStorage.getItem('afterlight-reading-focus') === 'true';
    const stored = JSON.parse(sessionStorage.getItem('afterlight-reading-position'));
    if (stored && [stored.x, stored.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) position = stored;
  } catch (_) {}
  function setFocus(value) {
    enabled = value;
    document.body.classList.toggle('focus-reading', enabled);
    focusButtons.forEach(button => { button.hidden = false; button.textContent = enabled ? '退出专注' : '专注阅读'; button.setAttribute('aria-pressed', String(enabled)); });
    try { sessionStorage.setItem('afterlight-reading-focus', String(enabled)); } catch (_) {}
    schedule();
  }
  function expand(value, restore = false) {
    if (!tools) return;
    actions.hidden = !value; launcher.setAttribute('aria-expanded', String(value));
    if (value) tools.querySelector('[data-reading-status]').classList.remove('is-visible');
    place();
    if (restore) launcher.focus({ preventScroll: true });
  }
  const clamp = (n, min, max) => Math.max(min, Math.min(n, Math.max(min, max)));
  function bounds() {
    const viewport = window.visualViewport;
    const style = getComputedStyle(document.documentElement);
    const safeTop = parseFloat(style.getPropertyValue('--safe-top')) || 0, safeBottom = parseFloat(style.getPropertyValue('--safe-bottom')) || 0;
    const left = (viewport?.offsetLeft || 0) + 12, top = (viewport?.offsetTop || 0) + 12 + safeTop;
    return { left, top, right: left + (viewport?.width || innerWidth) - 24, bottom: (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 12 - safeBottom };
  }
  function place(point) {
    if (!tools) return;
    const b = bounds(), w = launcher.offsetWidth, h = launcher.offsetHeight;
    const x = clamp(point?.x ?? b.left + (position?.x ?? 1) * (b.right - b.left - w), b.left, b.right - w);
    const y = clamp(point?.y ?? b.top + (position?.y ?? 1) * (b.bottom - b.top - h), b.top, b.bottom - h);
    tools.style.left = x + 'px'; tools.style.top = y + 'px';
    const width = Math.min(176, b.right - b.left);
    actions.style.width = width + 'px'; actions.style.left = clamp(x, b.left, b.right - width) - x + 'px';
    const status = tools.querySelector('[data-reading-status]');
    status.style.right = 'auto'; status.style.left = actions.style.left; status.style.width = width + 'px';
    const above = y - b.top - 8, below = b.bottom - y - h - 8;
    tools.dataset.direction = above > below ? 'up' : 'down';
    actions.style.maxHeight = Math.max(above, below, 0) + 'px';
  }
  function remember() {
    const b = bounds(), box = launcher.getBoundingClientRect();
    position = { x: clamp((box.left - b.left) / Math.max(1, b.right - b.left - box.width), 0, 1), y: clamp((box.top - b.top) / Math.max(1, b.bottom - b.top - box.height), 0, 1) };
    try { sessionStorage.setItem('afterlight-reading-position', JSON.stringify(position)); } catch (_) {}
  }
  function reset() {
    position = undefined; try { sessionStorage.removeItem('afterlight-reading-position'); } catch (_) {}
    place(); expand(false, true); announce('已移回右下角');
  }
  focusButtons.forEach(button => button.addEventListener('click', () => { setFocus(!enabled); expand(false, !!button.closest('.reading-tools')); announce(enabled ? '已进入专注阅读' : '已恢复页面布局'); }));
  const outline = document.querySelector('.article-outline details');
  if (outline && matchMedia('(max-width: 900px)').matches) outline.open = false;
  const chapters = [...document.querySelectorAll('.article-outline a, #reading-directory nav a')].map(link => {
    try { const heading = document.getElementById(decodeURIComponent(link.hash.slice(1))); return heading && content.contains(heading) ? { link, heading } : null; } catch (_) { return null; }
  }).filter(Boolean);
  function update() {
    frame = undefined;
    const headings = [...new Set(chapters.map(item => item.heading))];
    let current = headings[0];
    headings.forEach(heading => { if (heading.getBoundingClientRect().top < Math.min(150, innerHeight * .2)) current = heading; });
    if (scrollY > 0 && content.getBoundingClientRect().bottom <= innerHeight) current = headings[headings.length - 1];
    chapters.forEach(({ link, heading }) => {
      if (heading === current) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  if (tools) {
    tools.hidden = false; place();
    launcher.addEventListener('click', event => {
      if (suppressClick && event.detail !== 0) { event.preventDefault(); suppressClick = false; return; }
      expand(actions.hidden);
    });
    launcher.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick = false;
      const box = launcher.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false };
      launcher.setPointerCapture(event.pointerId);
    });
    launcher.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 7) return;
      if (!drag.moved) expand(false);
      drag.moved = true; suppressClick = true; event.preventDefault();
      place({ x: drag.left + dx, y: drag.top + dy });
    });
    const finish = event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.moved) remember();
      // Mobile browsers may omit the compatibility click after a previous drag.
      if (event.type === 'pointerup' && event.pointerType === 'touch' && !drag.moved) {
        expand(actions.hidden); suppressClick = true;
      }
      if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
      drag = undefined;
    };
    addEventListener('pointerup', finish); addEventListener('pointercancel', finish);
    tools.querySelector('[data-reading-reset]').addEventListener('click', reset);
    tools.querySelector('[data-reading-top]').addEventListener('click', () => { scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); expand(false, true); });
    tools.querySelector('[data-directory-open]')?.addEventListener('click', () => {
      expand(false); update(); window.afterlightDialogs.open(directory, launcher);
      const link = directory.querySelector('[aria-current]'), nav = directory.querySelector('nav');
      if (link) nav.scrollTop += link.getBoundingClientRect().top - nav.getBoundingClientRect().top - nav.clientHeight / 2;
    });
    directory?.querySelector('nav').addEventListener('click', event => {
      const link = event.target.closest('a'); if (!link) return;
      const chapter = chapters.find(item => item.link === link); if (!chapter) return;
      event.preventDefault(); directory.close();
      location.hash = link.hash;
      chapter.heading.scrollIntoView({ block: 'start' });
      // Focus after the dialog's close handler restores the launcher.
      requestAnimationFrame(() => { chapter.heading.tabIndex = -1; chapter.heading.focus({ preventScroll: true }); });
    });
    document.addEventListener('click', event => { if (!tools.contains(event.target)) expand(false); });
    launcher.addEventListener('keydown', event => {
      if (event.key === 'Home') { event.preventDefault(); reset(); }
      if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const box = launcher.getBoundingClientRect();
        place({ x: box.left + (event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0), y: box.top + (event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0) }); remember();
      }
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (actions && !actions.hidden) expand(false, true); else if (enabled) setFocus(false);
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => { place(); schedule(); });
  window.visualViewport?.addEventListener('resize', () => place());
  window.visualViewport?.addEventListener('scroll', () => place());
  addEventListener('hashchange', schedule); addEventListener('pageshow', () => { place(); schedule(); });
  document.addEventListener('load', schedule, true); document.fonts?.addEventListener('loadingdone', schedule);
  new ResizeObserver(schedule).observe(content);
  new MutationObserver(schedule).observe(content, { childList: true, subtree: true });
  setFocus(enabled);
})();
