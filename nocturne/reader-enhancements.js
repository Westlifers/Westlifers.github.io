(() => {
  'use strict';
  const page = document.querySelector('[data-reading-page]');
  const content = page?.querySelector('[data-article-content]');
  const reader = window.Nocturne?.reader;
  if (!page || !content || !reader) return;
  const { toast } = window.Nocturne;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 760px)');
  const canDialog = typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, className = '') => {
    const node = make('button', className, label);
    node.type = 'button';
    return node;
  };
  const canonical = new URL($('link[rel="canonical"]')?.href || location.href);
  canonical.hash = '';
  function address(id) {
    const url = new URL(canonical);
    url.hash = id ? encodeURIComponent(id) : '';
    return url.href;
  }
  function focusTarget(target) {
    if (!target.hasAttribute('tabindex')) {
      target.tabIndex = -1;
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    }
    target.focus({ preventScroll: true });
  }

  // Panels are created after app.js initializes, so they own their focus and
  // scroll lifecycle instead of competing with the site's search/lightbox.
  let modal = null, panelNumber = 0;
  function createPanel(title, extraClass = '') {
    const dialog = make('dialog', 'reader-panel ' + extraClass);
    dialog.dataset.readerDialog = '';
    const heading = make('h2', '', title);
    heading.id = 'reader-panel-title-' + ++panelNumber;
    dialog.setAttribute('aria-labelledby', heading.id);
    const header = make('div', 'reader-panel-header');
    const close = button('关闭', 'reader-panel-close');
    close.addEventListener('click', () => dialog.close());
    header.append(heading, close);
    dialog.append(header);
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (modal?.dialog !== dialog) return;
      const state = modal;
      modal = null;
      const restore = () => {
        document.body.style.overflow = state.overflow;
        if (state.returnTarget?.isConnected) state.returnTarget.focus({ preventScroll: true });
      };
      if (state.preserve) reader.preservePosition(restore, state.position);
      else restore();
      // close is asynchronous. Navigation must measure the document after its
      // scrollbar is restored and the resulting math/line wrapping has run.
      if (state.afterClose) requestAnimationFrame(() => requestAnimationFrame(state.afterClose));
    });
    document.body.append(dialog);
    return dialog;
  }
  function openPanel(dialog, trigger) {
    if (!canDialog || $('dialog[open]')) return false;
    modal = { dialog, returnTarget: trigger || document.activeElement, overflow: document.body.style.overflow,
      position: reader.capturePosition(), preserve: true };
    reader.preservePosition(() => {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      $('.reader-panel-close', dialog).focus({ preventScroll: true });
    }, modal.position);
    return true;
  }
  document.addEventListener('keydown', event => {
    // Keep global search shortcuts from stacking a second modal over a reader
    // panel. Typing and all native dialog keys retain their normal behavior.
    if (modal && (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'))) event.stopPropagation();
  }, true);

  let manualCopy;
  async function copy(text, message, trigger) {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch (_) {
      if (!canDialog) { toast('无法自动复制，请从地址栏复制链接。'); return; }
      if (!manualCopy) {
        manualCopy = createPanel('手动复制');
        const label = make('label', 'reader-copy-label', '浏览器未允许自动复制。选中下方内容后复制即可。');
        const area = make('textarea', 'reader-copy-field');
        area.readOnly = true;
        area.rows = 7;
        area.id = 'reader-copy-text';
        label.htmlFor = area.id;
        manualCopy.append(label, area);
      }
      const area = $('textarea', manualCopy);
      area.value = text;
      if (openPanel(manualCopy, trigger)) { area.focus(); area.select(); }
    }
  }

  // Settings preserve the paragraph currently on screen, including after
  // asynchronous formula layout. Existing size preferences are kept intact.
  const oldFontButton = $('[data-font-size]', page);
  if (canDialog && oldFontButton) {
    const settingsButton = button('阅读排版');
    settingsButton.setAttribute('aria-haspopup', 'dialog');
    oldFontButton.after(settingsButton);
    oldFontButton.hidden = true;
    const settings = createPanel('阅读排版', 'reader-settings');
    const preview = make('p', 'reader-type-preview');
    const sample = $$('[data-reader-paragraph]', content).find(node => !node.querySelector('mjx-container, math, .math') && !/\$|\\[([]/.test(node.textContent));
    preview.textContent = sample?.textContent.trim().slice(0, 130) || page.dataset.title;
    const groups = [
      { key: 'size', label: '字号', choices: [[17, '标准'], [19, '稍大'], [21, '大字']] },
      { key: 'leading', label: '行距', choices: [['compact', '紧凑'], ['normal', '默认'], ['relaxed', '舒展']] }
    ];
    const choices = [];
    for (const group of groups) {
      const field = make('fieldset', 'reader-setting-group');
      field.append(make('legend', '', group.label));
      const row = make('div', 'reader-setting-options');
      for (const [value, label] of group.choices) {
        const control = button(label);
        control.setAttribute('aria-pressed', 'false');
        if (group.key === 'size') control.setAttribute('aria-label', `${label}，${value} 像素`);
        control.addEventListener('click', () => { reader.setTypography({ [group.key]: value }, modal?.position); syncSettings(); });
        choices.push({ control, key: group.key, value });
        row.append(control);
      }
      field.append(row);
      settings.append(field);
    }
    const reset = button('恢复默认', 'reader-settings-reset');
    reset.addEventListener('click', () => { reader.setTypography({ size: 17, leading: 'normal' }, modal?.position); syncSettings(); });
    settings.append(preview, reset);
    function syncSettings() {
      const values = reader.getTypography();
      choices.forEach(({ control, key, value }) => control.setAttribute('aria-pressed', String(values[key] === value)));
      preview.style.fontSize = values.size + 'px';
      preview.style.lineHeight = ({ compact: 1.8, normal: 2, relaxed: 2.15 })[values.leading];
    }
    settingsButton.addEventListener('click', () => { syncSettings(); openPanel(settings, settingsButton); });
  }

  const outline = $('.article-outline', page);
  const sourceLinks = outline ? $$('a[href^="#"]', outline) : [];
  const seen = new Set();
  const entries = sourceLinks.flatMap(link => {
    let heading;
    try { heading = document.getElementById(decodeURIComponent(link.hash.slice(1))); } catch (_) { return []; }
    if (!heading || !content.contains(heading) || seen.has(heading.id)) return [];
    seen.add(heading.id);
    return [{ heading, title: heading.textContent.trim(), links: [link], top: 0 }];
  });
  const chapter = $('[data-reader-chapter]', page);
  const dock = $('[data-reader-dock]');
  let outlinePanel, current = -1, positioned = [], contentStart = 0, contentEnd = 0, frame = 0, measureNeeded = true;
  function navigate(entry) {
    if (!entry) return;
    reader.cancelPositionRestore();
    reader.startReading();
    const fromPanel = Boolean(modal);
    const go = () => {
      reader.cancelPositionRestore();
      for (let node = entry.heading.parentElement; node && node !== content; node = node.parentElement) if (node.matches('details')) node.open = true;
      const hash = '#' + encodeURIComponent(entry.heading.id);
      if (location.hash !== hash) history.pushState(null, '', hash);
      focusTarget(entry.heading);
      entry.heading.scrollIntoView({ behavior: fromPanel || reduced.matches ? 'instant' : 'smooth', block: 'start' });
      if (fromPanel) reader.preservePosition(() => {}, { element: entry.heading, top: entry.heading.getBoundingClientRect().top });
      queue(true);
    };
    if (fromPanel) {
      modal.returnTarget = null;
      modal.preserve = false;
      modal.afterClose = go;
      modal.dialog.close();
      return;
    }
    go();
  }
  for (const entry of entries) {
    entry.links[0].addEventListener('click', event => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(entry);
    });
    // The link mark lives outside the text measure and has no selectable text,
    // so copying a heading never acquires a decorative section sign.
    const share = button('', 'reader-heading-link');
    share.setAttribute('aria-label', `复制“${entry.title}”的链接`);
    share.title = '复制本节链接';
    share.addEventListener('click', () => copy(address(entry.heading.id), '本节链接已复制。', share));
    entry.heading.classList.add('reader-linked-heading');
    entry.heading.append(share);
  }
  if (entries.length && canDialog && dock) {
    outlinePanel = createPanel('本篇目录', 'reader-outline-panel');
    const nav = $('nav', outline).cloneNode(true);
    nav.className = 'reader-panel-outline';
    nav.setAttribute('aria-label', '跳转到章节');
    $$('[id]', nav).forEach(node => node.removeAttribute('id'));
    $$('a', nav).forEach(link => {
      let id;
      try { id = decodeURIComponent(link.hash.slice(1)); } catch (_) { return; }
      const entry = entries.find(item => item.heading.id === id);
      if (!entry) return;
      entry.links.push(link);
      link.addEventListener('click', event => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(entry);
      });
    });
    outlinePanel.append(nav);
    $('[data-reader-outline-open]', dock).addEventListener('click', event => {
      if (!openPanel(outlinePanel, event.currentTarget)) return;
      const active = $('[aria-current="location"]', nav);
      if (active) {
        active.focus({ preventScroll: true });
        nav.scrollTop = active.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop - nav.clientHeight / 3;
      }
    });
  }
  function sectionIndex() {
    const position = scrollY + Math.min(160, innerHeight * .22);
    let found = -1;
    for (const entry of positioned) {
      if (entry.top > position) break;
      found = entries.indexOf(entry);
    }
    return found;
  }
  function update() {
    frame = 0;
    if (measureNeeded) {
      contentStart = content.getBoundingClientRect().top + scrollY;
      contentEnd = contentStart + content.getBoundingClientRect().height;
      positioned = entries.filter(entry => entry.heading.getClientRects().length).map(entry => {
        entry.top = entry.heading.getBoundingClientRect().top + scrollY;
        return entry;
      });
      measureNeeded = false;
    }
    current = sectionIndex();
    const entry = entries[current];
    const title = entry?.title || '开篇';
    const next = positioned.find(item => item.top > (entry?.top ?? contentStart));
    const start = entry?.top ?? contentStart;
    const fraction = Math.max(0, Math.min(1, (scrollY + Math.min(160, innerHeight * .22) - start) / Math.max(1, (next?.top ?? contentEnd) - start)));
    entries.forEach(item => item.links.forEach(link => {
      const active = item === entry;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    }));
    $$('[data-reader-current]').forEach(node => { if (node.textContent !== title) node.textContent = title; });
    $$('[data-reader-chapter-progress]').forEach(node => { node.style.width = (fraction * 100) + '%'; });
    const percent = $('[data-reader-section-percent]');
    if (percent) percent.textContent = '本节 ' + Math.round(fraction * 100) + '%';
    $$('[data-reader-previous]').forEach(node => { node.disabled = current <= 0; });
    $$('[data-reader-next]').forEach(node => {
      node.disabled = current >= entries.length - 1;
      node.setAttribute('aria-label', entries[current + 1] ? '下一节：' + entries[current + 1].title : '已是最后一节');
    });
    if (dock) {
      dock.hidden = !outlinePanel || !compact.matches || contentStart > scrollY + 100 || contentEnd < scrollY + innerHeight * .3 || Boolean(selectedQuote);
      $('[data-reader-outline-open]', dock).setAttribute('aria-label', '打开目录，当前：' + title);
    }
  }
  function queue(measure = false) {
    if (measure === true) measureNeeded = true;
    if (!frame) frame = requestAnimationFrame(update);
  }
  if (entries.length) {
    if (chapter) chapter.hidden = false;
    $$('[data-reader-previous]').forEach(node => node.addEventListener('click', () => navigate(entries[current - 1])));
    $$('[data-reader-next]').forEach(node => node.addEventListener('click', () => navigate(entries[current + 1])));
    addEventListener('scroll', () => queue(), { passive: true });
    addEventListener('resize', () => queue(true));
    addEventListener('hashchange', () => queue(true));
    compact.addEventListener('change', () => queue(true));
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => queue(true)).observe(content);
    content.addEventListener('toggle', () => queue(true), true);
    document.fonts?.ready.then(() => queue(true));
  }

  // Keep ordinary browser selection intact. Quotes are explicit user actions;
  // neither copying a paragraph nor selecting text rewrites its contents.
  let selectedQuote = null, selectionTimer;
  const quoteTools = make('aside', 'reader-quote-tools');
  quoteTools.hidden = true;
  quoteTools.setAttribute('aria-label', '所选文字');
  const quoteLabel = make('span', 'reader-quote-label', '所选文字');
  const quoteCopy = button('复制摘录');
  quoteCopy.setAttribute('aria-keyshortcuts', 'Alt+Shift+C');
  quoteCopy.title = '复制摘录（Alt + Shift + C）';
  const quoteLink = button('复制段落链接');
  const quoteClose = button('×', 'reader-quote-close');
  quoteClose.setAttribute('aria-label', '关闭摘录工具');
  quoteTools.append(quoteLabel, quoteCopy, quoteLink, quoteClose);
  document.body.append(quoteTools);
  function quoteTarget(range) {
    let node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer.childNodes[range.startOffset] || range.startContainer : range.startContainer.parentElement;
    if (node?.nodeType !== Node.ELEMENT_NODE) node = node?.parentElement;
    const target = node?.closest('[data-reader-paragraph][id], .statement[id], h1[id], h2[id], h3[id], h4[id], p[id]');
    if (target && content.contains(target)) return target.id;
    const top = node?.getBoundingClientRect().top ?? 0;
    return entries.filter(entry => entry.heading.getBoundingClientRect().top <= top).at(-1)?.heading.id || '';
  }
  function readSelection() {
    if (modal || quoteTools.contains(document.activeElement)) return;
    const selection = getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) { dismissQuote(); return; }
    const range = selection.getRangeAt(0);
    if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) { dismissQuote(); return; }
    const text = selection.toString().trim();
    if (text.length < 2) { dismissQuote(); return; }
    const hasMath = $$('mjx-container, math, .math, .tikzjax, svg', content).some(node => range.intersectsNode(node));
    selectedQuote = { text, id: quoteTarget(range), hasMath };
    quoteLabel.textContent = hasMath ? '含公式 · 可分享所在位置' : '所选文字';
    quoteCopy.hidden = hasMath;
    quoteLink.textContent = selectedQuote.id ? '复制段落链接' : '复制文章链接';
    quoteTools.hidden = false;
    queue();
  }
  function dismissQuote() { selectedQuote = null; quoteTools.hidden = true; queue(); }
  function closeQuote() {
    const target = selectedQuote?.id && document.getElementById(selectedQuote.id);
    const restore = quoteTools.contains(document.activeElement);
    dismissQuote();
    if (restore) focusTarget(target || content);
  }
  function copyQuote(trigger) {
    if (!selectedQuote || selectedQuote.hasMath) return;
    const text = selectedQuote.text.split(/\r?\n/).map(line => '> ' + line).join('\n') + '\n\n' + page.dataset.title + '\n' + address(selectedQuote.id);
    copy(text, '摘录与出处已复制。', trigger);
  }
  quoteCopy.addEventListener('click', () => copyQuote(quoteCopy));
  quoteLink.addEventListener('click', () => { if (selectedQuote) copy(address(selectedQuote.id), '阅读位置链接已复制。', quoteLink); });
  quoteClose.addEventListener('click', closeQuote);
  document.addEventListener('selectionchange', () => { clearTimeout(selectionTimer); selectionTimer = setTimeout(readSelection, 180); });
  document.addEventListener('keydown', event => {
    if (modal) return;
    if (event.key === 'Escape' && selectedQuote) { closeQuote(); return; }
    if (event.altKey && event.shiftKey && event.code === 'KeyC' && selectedQuote && !selectedQuote.hasMath) {
      event.preventDefault();
      copyQuote(document.activeElement);
    }
  });
  page.classList.add('reader-enhanced');
  queue(true);
})();
