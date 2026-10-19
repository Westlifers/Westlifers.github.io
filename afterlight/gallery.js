(() => {
  const root = document.querySelector('[data-article-content]');
  if (!root) return;
  // Preserve links to other pages; only plain pictures or original-image links open here.
  const images = [...root.querySelectorAll('img')].filter(img => {
    if (img.closest('[data-no-gallery], .no-gallery, .not-gallery-item, .tikzjax, mjx-container')) return false;
    const link = img.closest('a');
    if (!link) return true;
    const url = new URL(link.href, location.href);
    return url.href === img.src || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname);
  });
  if (!images.length) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'afterlight-dialog gallery-dialog'; dialog.setAttribute('aria-label', '图片浏览');
  dialog.innerHTML = '<div class="dialog-heading"><span data-gallery-count></span><button type="button" data-dialog-close aria-label="关闭图片">×</button></div><div class="gallery-stage"><img alt=""></div><p data-gallery-caption></p><p data-gallery-status role="status"></p><div class="gallery-controls"><button type="button" data-gallery-prev aria-label="上一张图片">←</button><a data-gallery-original target="_blank" rel="noopener">查看原图 ↗</a><button type="button" data-gallery-next aria-label="下一张图片">→</button></div>';
  document.body.append(dialog); window.afterlightDialogs.bind(dialog);
  const preview = dialog.querySelector('img'), status = dialog.querySelector('[data-gallery-status]');
  const stage = dialog.querySelector('.gallery-stage');
  let current = 0;
  function ready() {
    stage.setAttribute('aria-busy', 'false');
    preview.getAnimations().forEach(motion => motion.cancel());
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) preview.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 180 });
  }
  function show(index) {
    current = (index + images.length) % images.length;
    const image = images[current], source = image.closest('a')?.href || image.currentSrc || image.src;
    status.textContent = '';
    stage.setAttribute('aria-busy', 'true');
    preview.alt = image.alt || '文章图片'; preview.src = source;
    if (preview.complete && preview.naturalWidth) ready();
    dialog.querySelector('[data-gallery-count]').textContent = `${current + 1} / ${images.length}`;
    dialog.querySelector('[data-gallery-caption]').textContent = image.closest('figure')?.querySelector('figcaption')?.textContent || image.alt;
    dialog.querySelector('[data-gallery-original]').href = source;
  }
  preview.addEventListener('load', ready);
  preview.addEventListener('error', () => { stage.setAttribute('aria-busy', 'false'); status.textContent = '图片未能加载，可尝试打开原图。'; });
  let swipe;
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary) { swipe = undefined; return; }
    if (event.pointerType === 'touch') swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = undefined;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.6) show(current + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { swipe = undefined; });
  images.forEach((image, index) => {
    const trigger = image.closest('a') || image;
    if (trigger === image) { image.tabIndex = 0; image.setAttribute('role', 'button'); image.setAttribute('aria-label', '放大图片：' + (image.alt || `第 ${index + 1} 张`)); }
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.classList.add('gallery-trigger');
    trigger.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); show(index); window.afterlightDialogs.open(dialog, trigger);
    });
    if (trigger === image) trigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); trigger.click(); }
    });
  });
  for (const [selector, step] of [['[data-gallery-prev]', -1], ['[data-gallery-next]', 1]]) {
    const button = dialog.querySelector(selector); button.disabled = images.length < 2;
    button.addEventListener('click', () => show(current + step));
  }
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); show(current + (event.key === 'ArrowLeft' ? -1 : 1)); }
  });
})();
