(() => {
  'use strict';

  const roots = document.querySelectorAll('[data-atlas]');
  if (!roots.length) return;

  const NS = 'http://www.w3.org/2000/svg';
  const topics = {
    mathematics: { label: '数学', color: '#c8b5f3' },
    essays: { label: '随笔', color: '#e9c8a0' },
    poetry: { label: '诗与声音', color: '#e4abbe' },
    fieldnotes: { label: '人间漫游', color: '#a8c8c0' }
  };
  const svgElement = (tag, attrs = {}, text) => {
    const element = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const plain = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const names = value => (Array.isArray(value) ? value.flat(Infinity) : value ? [value] : [])
    .map(item => plain(item && typeof item === 'object' ? item.name || item.label : item)).filter(Boolean);
  const shortened = (value, limit) => Array.from(value).length > limit
    ? `${Array.from(value).slice(0, limit).join('')}…` : value;
  const labelFor = (title, mobile) => {
    const chapter = title.match(/Munkres.*?(?:Chapter\s*(\d+)|(Preface))/i);
    if (chapter) return chapter[1] ? `Munkres · ${chapter[1]}` : 'Munkres · 序';
    if (/Integral quantaloid/i.test(title)) return 'Quantaloid / Topos';
    if (/有界 Q-valued/i.test(title)) return 'Q-valued sets';
    return shortened(title, mobile ? 10 : 18);
  };
  const safeURL = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  };

  roots.forEach((root, rootIndex) => {
    const stage = root.querySelector('.atlas-stage');
    if (!stage) return;
    const status = root.querySelector('[data-atlas-status]') || element('p', 'atlas-status');
    if (!status.parentElement) root.append(status);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const media = window.matchMedia('(max-width: 640px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const filters = [...root.querySelectorAll('[data-atlas-filter]')];
    const toolbar = root.querySelector('[data-atlas-toolbar]');
    const relationToggle = root.querySelector('[data-atlas-relations]');
    const copyButton = root.querySelector('[data-atlas-copy]');
    const shareInput = root.querySelector('[data-atlas-share-url]');
    const plot = element('div', 'atlas-plot');
    const detail = element('div', 'atlas-detail');
    detail.id = `atlas-detail-${rootIndex}`;
    detail.setAttribute('role', 'region');
    detail.setAttribute('aria-label', '选中内容与关联');
    const selection = element('div', 'atlas-selection');
    selection.id = `atlas-selection-${rootIndex}`;
    selection.hidden = true;
    selection.setAttribute('role', 'group');
    selection.setAttribute('aria-label', '已选内容');
    const selectionCard = element('div', 'atlas-selection-card');
    const selectionTitle = element('span', 'atlas-selection-title');
    const selectionOpen = element('button', 'atlas-selection-open', '查看介绍');
    selectionOpen.type = 'button';
    selectionOpen.setAttribute('aria-controls', detail.id);
    const selectionClear = element('button', 'atlas-selection-clear', '×');
    selectionClear.type = 'button';
    selectionClear.setAttribute('aria-label', '清除星图选择');
    selectionCard.append(selectionTitle, selectionOpen, selectionClear);
    selection.append(selectionCard);
    const alternative = element('details', 'atlas-alternative');
    const summary = element('summary', '', '以文章列表浏览');
    const list = element('ul', 'atlas-list');
    alternative.append(summary, list);
    stage.append(plot, detail, alternative);
    let entries = [];
    let visible = [];
    let edges = [];
    let selected = null;
    let filter = 'all';
    let filterWasChosen = false;
    let explicitOnly = false;
    let loading = false;
    let loaded = false;
    let graph = null;
    let world = null;
    let nodeElements = new Map();
    let nodeContents = [];
    let groupElements = new Map();
    let plotted = [];
    let width = 1000;
    let height = 600;
    let camera = { x: 0, y: 0, scale: 1 };
    let cameraTarget = camera;
    let cameraFrame = 0;
    let inViewport = true;
    let selectionAnimation = null;

    const articleKey = article => {
      const url = new URL(article.url);
      return url.origin === window.location.origin ? url.pathname + url.search : url.href;
    };
    const viewURL = (share = false) => {
      const url = new URL(share ? root.dataset.atlasUrl || window.location.href : window.location.href, window.location.href);
      const article = entries.find(entry => entry.id === selected);
      for (const [key, value] of [['atlas', filter === 'all' ? null : filter], ['star', article ? articleKey(article) : null], ['relations', explicitOnly ? 'explicit' : null]]) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      if (!share && !root.classList.contains('atlas-page') && !url.hash) url.hash = 'atlas';
      return url;
    };
    const writeView = (mode = 'replace') => {
      const url = viewURL();
      if (url.href !== window.location.href) {
        try { window.history[mode === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', url.href); } catch (_) { /* Local previews may restrict history. Sharing still works. */ }
      }
      if (shareInput) { shareInput.value = viewURL(true).href; shareInput.hidden = true; }
    };
    const readView = () => {
      const params = new URL(window.location.href).searchParams;
      filter = Object.hasOwn(topics, params.get('atlas')) ? params.get('atlas') : 'all';
      explicitOnly = params.get('relations') === 'explicit';
      const requestedURL = safeURL(params.get('star'));
      const requestedKey = requestedURL ? articleKey({ url: requestedURL }) : null;
      const requested = entries.find(entry => articleKey(entry) === requestedKey);
      selected = requested?.id || null;
      if (requested && filter !== 'all' && requested.kind !== filter) filter = requested.kind;
    };
    const countEntries = (items, compact = false) => {
      const pages = items.filter(item => item.entryType === 'page');
      const posts = items.length - pages.length;
      const pageLabel = !compact && pages.length === 1 && /\/about(?:\/index\.html|\/)?$/.test(new URL(pages[0].url).pathname)
        ? '关于页' : `${pages.length} ${compact ? '页' : '个页面'}`;
      return [posts || !pages.length ? `${posts} ${compact ? '篇' : '篇文章'}` : '', pages.length ? pageLabel : ''].filter(Boolean).join(' + ');
    };
    const baseStatus = () => `${filter === 'all' ? '整个宇宙' : topics[filter]?.label || filter} · ${countEntries(visible)}${entries.length > 40 ? ' · 图中显示 40 项' : ''}`;
    const cancelSelectionAnimation = () => {
      selectionAnimation?.cancel();
      selectionAnimation = null;
    };
    const positionSelection = () => {
      if (!selected || selection.hidden) return;
      const core = nodeElements.get(selected)?.querySelector('.atlas-node-core');
      if (!core) return;
      // Screen-space centres include SVG letterboxing and the animated camera.
      // The card stays outside that transform, so its text never scales.
      const bounds = plot.getBoundingClientRect(), star = core.getBoundingClientRect();
      const cardWidth = selection.offsetWidth, cardHeight = selection.offsetHeight;
      if (!bounds.width || !bounds.height || !cardWidth || !cardHeight) return;
      const x = star.left + star.width / 2 - bounds.left;
      const y = star.top + star.height / 2 - bounds.top;
      const padding = 12, gap = 18;
      const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
      const left = clamp(x - cardWidth / 2, padding, bounds.width - cardWidth - padding);
      const fitsAbove = y - cardHeight - gap >= padding;
      const fitsBelow = y + gap + cardHeight <= bounds.height - padding;
      // Keep its side while the camera travels, unless that side runs out of room.
      const above = selection.dataset.placement === 'below' ? !fitsBelow && fitsAbove : fitsAbove;
      const top = clamp(above ? y - cardHeight - gap : y + gap, padding, bounds.height - cardHeight - padding);
      selection.dataset.placement = above ? 'above' : 'below';
      selection.style.transform = `translate3d(${left.toFixed(2)}px, ${top.toFixed(2)}px, 0)`;
      selection.style.setProperty('--atlas-tip-x', `${clamp(x - left, 20, cardWidth - 20).toFixed(2)}px`);
    };
    const hideSelection = (immediate = false) => {
      cancelSelectionAnimation();
      selection.inert = true;
      selection.setAttribute('aria-hidden', 'true');
      const finish = () => {
        selection.hidden = true;
        selection.dataset.state = 'closed';
      };
      if (selection.hidden || immediate || reducedMotion.matches || document.hidden || !selectionCard.animate) { finish(); return; }
      selection.dataset.state = 'closing';
      const offset = selection.dataset.placement === 'below' ? -5 : 5;
      const animation = selectionCard.animate([
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: `translateY(${offset}px) scale(.975)` }
      ], { duration: 150, easing: 'ease-out', fill: 'both' });
      selectionAnimation = animation;
      animation.onfinish = () => { if (selectionAnimation === animation) { finish(); cancelSelectionAnimation(); } };
    };
    const showSelection = () => {
      const switching = !selection.hidden && selection.dataset.state === 'open';
      cancelSelectionAnimation();
      selection.hidden = false;
      selection.inert = false;
      selection.removeAttribute('aria-hidden');
      selection.dataset.state = 'open';
      delete selection.dataset.placement;
      positionSelection();
      if (reducedMotion.matches || document.hidden || !selectionCard.animate) return;
      const offset = selection.dataset.placement === 'below' ? -8 : 8;
      const animation = selectionCard.animate([
        { opacity: 0, transform: `translateY(${switching ? offset / 2 : offset}px) scale(${switching ? '.985' : '.96'})` },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], { duration: switching ? 220 : 300, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      selectionAnimation = animation;
      animation.onfinish = () => { if (selectionAnimation === animation) cancelSelectionAnimation(); };
    };
    const resetDetail = () => {
      delete root.dataset.atlasSelected;
      hideSelection();
      detail.replaceChildren();
      detail.classList.remove('has-selection');
    };
    selectionOpen.addEventListener('click', () => {
      const title = detail.querySelector('.atlas-detail-title');
      if (!title) return;
      title.focus({ preventScroll: true });
      title.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
    const clearSelection = () => {
      const node = nodeElements.get(selected);
      selected = null;
      resetDetail();
      illuminate(null);
      writeView();
      node?.focus({ preventScroll: true });
    };
    selectionClear.addEventListener('click', clearSelection);
    selection.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); clearSelection(); }
      else if (event.key === 'Tab' && event.shiftKey && event.target === selectionOpen) {
        event.preventDefault(); nodeElements.get(selected)?.focus({ preventScroll: true });
      }
    });
    const connectionsFor = id => edges.filter(edge => (!explicitOnly || edge.explicit) && (edge.a.id === id || edge.b.id === id));
    const chooseBackbone = () => {
      // Keep the full evidence graph for exploration. The overview is only a
      // sparse forest of real edges: explicit evidence first, shorter lines
      // within each tier, and topic-only edges only when they connect islands.
      const parents = new Map(plotted.map(article => [article.id, article.id]));
      const find = id => {
        let rootId = id;
        while (parents.get(rootId) !== rootId) rootId = parents.get(rootId);
        while (parents.get(id) !== id) { const next = parents.get(id); parents.set(id, rootId); id = next; }
        return rootId;
      };
      const ranked = edges.map((edge, order) => ({ edge, order,
        tier: edge.tags.length ? 0 : edge.categories.length ? 1 : 2,
        length: Math.hypot(edge.a.x - edge.b.x, edge.a.y - edge.b.y)
      })).sort((a, b) => a.tier - b.tier || a.length - b.length || a.order - b.order);
      let count = 0;
      ranked.forEach(({ edge }) => {
        const a = find(edge.a.id), b = find(edge.b.id);
        edge.backbone = a !== b;
        if (edge.backbone) { parents.set(a, b); count++; }
        edge.element.classList.toggle('is-backbone', edge.backbone);
      });
      root.dataset.atlasBackboneEdges = String(count);
      root.dataset.atlasRelationEdges = String(edges.length);
    };
    const illuminate = id => {
      if (!graph) return;
      const connections = id ? connectionsFor(id) : [];
      const related = new Set(id ? [id] : []);
      connections.forEach(edge => { related.add(edge.a.id); related.add(edge.b.id); });
      graph.classList.toggle('has-focus', Boolean(id));
      nodeElements.forEach((node, key) => {
        node.classList.toggle('is-related', related.has(key));
        node.classList.toggle('is-active', key === id);
        node.classList.toggle('is-selected', key === selected);
        const labeled = media.matches ? key === id || key === selected
          : id ? related.has(key) || key === selected
            : filter === 'all' ? node.classList.contains('is-landmark') : node.dataset.atlasKind === filter;
        node.classList.toggle('is-labeled', labeled);
        node.setAttribute('aria-pressed', String(key === selected));
      });
      let drawn = 0;
      edges.forEach(edge => {
        const enabled = !explicitOnly || edge.explicit;
        const related = Boolean(id && (edge.a.id === id || edge.b.id === id));
        const shown = enabled && (id ? related : edge.backbone);
        edge.element.classList.toggle('is-related', enabled && related);
        edge.element.classList.toggle('is-drawn', shown);
        if (shown) drawn++;
      });
      root.dataset.atlasDrawnEdges = String(drawn);
      if (id) {
        const article = entries.find(entry => entry.id === id);
        status.textContent = `${article.title} · ${connections.length} 项关联`;
      } else status.textContent = baseStatus();
    };
    const select = (article, options = {}) => {
      selected = article.id;
      root.dataset.atlasSelected = articleKey(article);
      if (filter !== 'all' && article.kind !== filter) {
        filter = article.kind;
        applyFilter();
      }
      selectionTitle.textContent = article.title;
      selectionTitle.title = article.title;
      selectionOpen.setAttribute('aria-label', `查看介绍：${article.title}`);
      selection.style.setProperty('--atlas-selection-accent', article.color || topics[article.kind]?.color || '#e9c8a0');
      showSelection();
      const meta = element('p', 'atlas-detail-meta', `${article.entryType === 'page' ? '页面' : article.kindLabel}${article.date ? ` / ${article.date}` : ''}`);
      const title = element('h3', 'atlas-detail-title', article.title);
      title.tabIndex = -1;
      const excerpt = element('p', 'atlas-detail-excerpt', shortened(article.summary || article.text || '从这里继续阅读这篇文章。', 130));
      const link = element('a', 'atlas-detail-link', article.entryType === 'page' ? '打开页面' : '阅读全文');
      link.href = article.url;
      link.setAttribute('aria-label', `${article.entryType === 'page' ? '打开页面' : '阅读全文'}：${article.title}`);
      detail.replaceChildren(meta, title, excerpt, link);
      const connections = connectionsFor(article.id).sort((a, b) => Number(b.explicit) - Number(a.explicit) || b.tags.length - a.tags.length);
      const relationArea = element('div', 'atlas-relations');
      relationArea.append(element('h4', 'atlas-relations-title', connections.length ? `沿着关联继续读 · ${connections.length}` : '这颗星暂时独自发光'));
      if (!connections.length) relationArea.append(element('p', 'atlas-relations-empty', explicitOnly ? '暂无共同标签或原文分类，可关闭筛选查看同主题的文字。' : '暂无关联，可选择其他星点。'));
      const makeRelations = values => {
        const relatedList = element('ul', 'atlas-related-list');
        values.forEach(edge => {
          const neighbor = edge.a.id === article.id ? edge.b : edge.a;
          const item = element('li');
          const button = element('button', 'atlas-related-choice');
          button.type = 'button';
          button.dataset.atlasNeighbor = articleKey(neighbor);
          button.setAttribute('aria-label', `在星图中选择《${neighbor.title}》。${edge.reasons.join('；')}`);
          button.append(element('span', 'atlas-related-name', neighbor.title), element('span', 'atlas-related-reason', edge.reasons.join('；')));
          button.addEventListener('click', () => select(neighbor, { focusDetail: true }));
          button.addEventListener('pointerenter', () => illuminate(neighbor.id));
          button.addEventListener('pointerleave', () => illuminate(selected));
          item.append(button); relatedList.append(item);
        });
        return relatedList;
      };
      relationArea.append(makeRelations(connections.slice(0, 4)));
      if (connections.length > 4) {
        const more = element('details', 'atlas-more-relations');
        more.append(element('summary', '', `展开另外 ${connections.length - 4} 项`), makeRelations(connections.slice(4)));
        relationArea.append(more);
      }
      detail.append(relationArea);
      detail.classList.add('has-selection');
      illuminate(selected);
      if (options.write !== false) writeView();
      if (options.focusDetail) title.focus({ preventScroll: true });
    };

    // Only the camera moves on topic changes. Article positions and elements persist.
    const paintCamera = state => {
      camera = state;
      if (!world) return;
      world.setAttribute('transform', `translate(${state.x.toFixed(3)} ${state.y.toFixed(3)}) scale(${state.scale.toFixed(5)})`);
      nodeContents.forEach(content => content.setAttribute('transform', `scale(${(1 / state.scale).toFixed(5)})`));
      root.dataset.cameraScale = state.scale.toFixed(3);
      positionSelection();
    };
    const stopCamera = () => {
      if (cameraFrame) cancelAnimationFrame(cameraFrame);
      cameraFrame = 0;
      root.dataset.cameraRunning = 'false';
    };
    const moveCamera = (target, animate = true) => {
      stopCamera();
      cameraTarget = target;
      if (!animate || reducedMotion.matches || document.hidden || !inViewport) {
        paintCamera(target);
        return;
      }
      const from = { ...camera };
      if (Math.abs(from.x - target.x) + Math.abs(from.y - target.y) + Math.abs(from.scale - target.scale) < .001) return;
      const started = performance.now();
      root.dataset.cameraRunning = 'true';
      const frame = now => {
        const elapsed = Math.min(1, (now - started) / 920);
        // Quintic ease-in-out makes camera arrivals soft, without overshooting.
        const t = elapsed < .5 ? 16 * elapsed ** 5 : 1 - (-2 * elapsed + 2) ** 5 / 2;
        paintCamera({ x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t, scale: from.scale + (target.scale - from.scale) * t });
        if (elapsed < 1) cameraFrame = requestAnimationFrame(frame);
        else stopCamera();
      };
      cameraFrame = requestAnimationFrame(frame);
    };
    const targetFor = () => {
      if (filter === 'all') return { x: 0, y: 0, scale: 1 };
      const group = plotted.filter(article => article.kind === filter);
      if (!group.length) return { x: 0, y: 0, scale: 1 };
      const xs = group.map(article => article.x);
      const ys = group.map(article => article.y);
      const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
      // Labels remain screen-sized. Reserve their room before fitting the subgraph.
      const scale = Math.min(media.matches ? 2.05 : 2.45, (width - (media.matches ? 160 : 300)) / Math.max(110, right - left), (height - 150) / Math.max(110, bottom - top));
      return { x: width / 2 - (left + right) / 2 * scale, y: height / 2 - (top + bottom) / 2 * scale, scale };
    };
    const applyFilter = (animate = true) => {
      if (!loaded) return;
      visible = entries.filter(entry => filter === 'all' || entry.kind === filter);
      if (!visible.some(entry => entry.id === selected)) selected = null;
      if (!selected) resetDetail();
      list.replaceChildren();
      visible.forEach(article => {
        const item = element('li');
        const link = element('a', '', article.title);
        link.href = article.url;
        item.append(link, element('span', '', article.entryType === 'page' ? '页面' : article.kindLabel));
        list.append(item);
      });
      summary.textContent = `以列表浏览（${countEntries(visible)}）`;
      root.dataset.atlasView = filter;
      root.dataset.atlasRelations = explicitOnly ? 'explicit' : 'all';
      filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.atlasFilter === filter)));
      relationToggle?.setAttribute('aria-pressed', String(explicitOnly));
      graph?.classList.toggle('has-explicit-only', explicitOnly);
      graph?.classList.toggle('has-topic-focus', filter !== 'all');
      plotted.forEach(article => {
        const active = filter === 'all' || article.kind === filter;
        const node = nodeElements.get(article.id);
        node.classList.toggle('is-outside', !active);
        node.setAttribute('tabindex', active ? '0' : '-1');
      });
      groupElements.forEach((group, kind) => {
        group.classList.toggle('is-outside', filter !== 'all' && kind !== filter);
        group.classList.toggle('is-current', kind === filter);
      });
      edges.forEach(edge => {
        const both = edge.a.kind === filter && edge.b.kind === filter;
        const either = edge.a.kind === filter || edge.b.kind === filter;
        edge.element.classList.toggle('is-within', filter !== 'all' && both);
        edge.element.classList.toggle('is-bridge', filter !== 'all' && either && !both);
        edge.element.classList.toggle('is-outside', filter !== 'all' && !either);
        edge.element.classList.toggle('is-suppressed', explicitOnly && !edge.explicit);
      });
      illuminate(selected);
      moveCamera(targetFor(), animate);
    };

    const render = () => {
      if (!loaded) return;
      stopCamera();
      hideSelection(true);
      plotted = entries.slice(0, 40);
      const requested = entries.find(article => article.id === selected);
      if (requested && !plotted.includes(requested)) plotted = [...plotted.slice(0, 39), requested];
      plot.replaceChildren();
      edges = [];
      nodeElements = new Map();
      nodeContents = [];
      groupElements = new Map();
      if (!plotted.length) {
        graph = null;
        plot.append(element('p', 'atlas-empty', '这个主题暂时没有文章，试试其他主题。'));
        status.textContent = '当前主题暂无文章';
        return;
      }
      const mobile = media.matches;
      width = mobile ? 600 : 1000;
      height = mobile ? 650 : 600;
      const titleId = `atlas-title-${rootIndex}`;
      const descId = `atlas-desc-${rootIndex}`;
      graph = svgElement('svg', { class: 'atlas-svg', viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-labelledby': `${titleId} ${descId}` });
      graph.append(svgElement('title', { id: titleId }, '文章星图'),
        svgElement('desc', { id: descId }, '每颗星对应一篇文章或一个页面。实线表示共同标签或原文分类，虚线仅表示同主题。按 Tab 在星点间移动，回车或空格选择，再按“查看介绍”阅读摘要，方向键寻找对应方向的星点。Escape 清除选择，也可使用下方列表。'));
      const defs = svgElement('defs');
      Object.entries(topics).forEach(([kind, topic]) => {
        const gradient = svgElement('radialGradient', { id: `atlas-field-${rootIndex}-${kind}` });
        gradient.append(svgElement('stop', { offset: '0%', 'stop-color': topic.color, 'stop-opacity': '.17' }), svgElement('stop', { offset: '60%', 'stop-color': topic.color, 'stop-opacity': '.05' }), svgElement('stop', { offset: '100%', 'stop-color': topic.color, 'stop-opacity': '0' }));
        defs.append(gradient);
      });
      const field = svgElement('g', { class: 'atlas-deep-field', 'aria-hidden': 'true' });
      for (let index = 0; index < 28; index++) {
        field.append(svgElement('circle', { cx: (index * 157.37 + 29) % width, cy: (index * 91.19 + 53) % height, r: index % 7 === 0 ? .9 : .55, opacity: .07 + (index % 5) * .02 }));
      }
      world = svgElement('g', { class: 'atlas-world' });
      const orbitLayer = svgElement('g', { class: 'atlas-orbits', 'aria-hidden': 'true' });
      const edgeLayer = svgElement('g', { class: 'atlas-edges', 'aria-hidden': 'true' });
      const nodeLayer = svgElement('g', { class: 'atlas-nodes' });
      world.append(orbitLayer, edgeLayer, nodeLayer);
      graph.append(defs, field, world);
      const groupKeys = [...new Set(plotted.map(entry => entry.kind))];
      const layouts = mobile
        ? [[176, 220, 111, 142], [425, 218, 100, 126], [180, 505, 96, 70], [428, 505, 96, 76]]
        : [[275, 245, 147, 148], [728, 222, 137, 135], [470, 470, 108, 62], [800, 464, 100, 68]];
      const canonicalOrder = Object.keys(topics);
      groupKeys.forEach((kind, groupIndex) => {
        const group = plotted.filter(entry => entry.kind === kind);
        const slot = canonicalOrder.indexOf(kind);
        let [cx, cy, rx, ry] = layouts[slot < 0 ? groupIndex % layouts.length : slot];
        if (groupKeys.length === 1) {
          cx = width / 2; cy = height / 2;
          rx = mobile ? 180 : 315; ry = mobile ? 180 : 175;
        }
        const region = svgElement('g', { class: 'atlas-region', style: `--atlas-region-color: ${(topics[kind] || topics.essays).color}` });
        region.append(svgElement('ellipse', { cx, cy, rx: rx * 1.8, ry: ry * 1.8, fill: `url(#atlas-field-${rootIndex}-${topics[kind] ? kind : 'essays'})`, class: 'atlas-region-field' }));
        region.append(svgElement('ellipse', { cx, cy, rx, ry, class: 'atlas-orbit', 'vector-effect': 'non-scaling-stroke' }));
        region.append(svgElement('text', { x: cx, y: cy - 5, class: 'atlas-topic', 'text-anchor': 'middle' }, group[0].kindLabel));
        region.append(svgElement('text', { x: cx, y: cy + 17, class: 'atlas-topic-count', 'text-anchor': 'middle' }, countEntries(group, true)));
        orbitLayer.append(region);
        groupElements.set(kind, region);
        group.forEach((article, index) => {
          const angle = -Math.PI / 2 + index / group.length * Math.PI * 2 + (groupIndex % 2 ? .15 : -.12);
          const breathing = 1 + .07 * Math.sin(index * 2.4 + groupIndex);
          article.x = cx + Math.cos(angle) * rx * breathing;
          article.y = cy + Math.sin(angle) * ry * breathing;
          article.angle = angle;
          article.landmark = index === 0 || (group.length > 3 && index === Math.floor(group.length / 2));
          article.color = (topics[kind] || topics.essays).color;
        });
      });

      plotted.forEach((a, i) => {
        plotted.slice(i + 1).forEach(b => {
          const sharedTags = a.tags.filter(tag => b.tags.includes(tag));
          const sharedCategories = a.categories.filter(category => b.categories.includes(category));
          const explicit = Boolean(sharedTags.length || sharedCategories.length);
          const reasons = [];
          if (sharedTags.length) reasons.push(`共同标签：${sharedTags.join('、')}`);
          if (sharedCategories.length) reasons.push(`同属原文分类：${sharedCategories.join('、')}`);
          if (!explicit && a.kind === b.kind) reasons.push(`同属主题：${a.kindLabel}`);
          if (!reasons.length) return;
          const bend = (a.x + b.x) / 2 + (b.y - a.y) * .09;
          const rise = (a.y + b.y) / 2 - (b.x - a.x) * .09;
          const path = svgElement('path', { d: `M ${a.x} ${a.y} Q ${bend} ${rise} ${b.x} ${b.y}`, class: `atlas-edge ${explicit ? 'atlas-edge-explicit' : 'atlas-edge-topic'}${sharedTags.length ? ' atlas-edge-tag' : ''}`, 'vector-effect': 'non-scaling-stroke', style: `--atlas-edge-color: ${a.kind === b.kind ? a.color : '#e9c8a0'}` });
          path.dataset.relation = explicit ? 'explicit' : 'topic';
          path.dataset.atlasA = a.id;
          path.dataset.atlasB = b.id;
          edgeLayer.append(path);
          edges.push({ a, b, reasons, tags: sharedTags, categories: sharedCategories, explicit, element: path });
        });
      });
      chooseBackbone();

      plotted.forEach((article, index) => {
        const node = svgElement('g', { class: 'atlas-node', transform: `translate(${article.x} ${article.y})`, tabindex: '0', role: 'button', 'aria-label': `${article.title}，${article.kindLabel}。展开文章介绍`, 'aria-controls': `${selection.id} ${detail.id}`, 'aria-pressed': 'false', style: `--atlas-star: ${article.color}` });
        node.classList.toggle('is-landmark', article.landmark);
        node.dataset.articleId = article.id;
        node.dataset.atlasKind = article.kind;
        const content = svgElement('g', { class: 'atlas-node-content' });
        nodeContents.push(content);
        node.append(svgElement('title', {}, article.title));
        content.append(svgElement('circle', { r: mobile ? 36 : 22, class: 'atlas-node-hit' }));
        content.append(svgElement('circle', { r: 19, class: 'atlas-node-halo' }));
        content.append(svgElement('circle', { r: 8, class: 'atlas-node-ring' }));
        content.append(svgElement('circle', { r: 3.8, class: 'atlas-node-core' }));
        content.append(svgElement('path', { d: 'M -12 0 H -7 M 7 0 H 12 M 0 -12 V -7 M 0 7 V 12', class: 'atlas-node-rays' }));
        const nearVertical = Math.abs(Math.cos(article.angle)) < .4;
        const toLeft = Math.cos(article.angle) < 0;
        const text = labelFor(article.title, mobile);
        const estimatedWidth = Array.from(text).reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : .54), 0) * (mobile ? 16 : 12);
        let anchor = nearVertical ? 'middle' : toLeft ? 'end' : 'start';
        let tx = nearVertical ? 0 : toLeft ? -15 : 15;
        let ty = nearVertical ? (Math.sin(article.angle) < 0 ? -18 : 26) : 5;
        if ((anchor === 'end' && article.x - estimatedWidth - 15 < 12) || (anchor === 'start' && article.x + estimatedWidth + 15 > width - 12)) {
          anchor = 'middle'; tx = 0; ty = 27;
        }
        content.append(svgElement('text', { x: tx, y: ty, class: 'atlas-node-label', 'text-anchor': anchor, 'aria-hidden': 'true' }, text));
        node.append(content);
        node.addEventListener('pointerenter', () => illuminate(article.id));
        node.addEventListener('pointerleave', () => illuminate(selected));
        node.addEventListener('focus', () => illuminate(article.id));
        node.addEventListener('blur', () => illuminate(selected));
        node.addEventListener('click', () => select(article));
        node.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); select(article);
          } else if (event.key === 'Tab' && !event.shiftKey && selected === article.id && !selection.hidden) {
            event.preventDefault(); selectionOpen.focus({ preventScroll: true });
          } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const navigable = plotted.filter(item => filter === 'all' || item.kind === filter);
            let target = article;
            if (event.key === 'Home') target = navigable[0];
            else if (event.key === 'End') target = navigable[navigable.length - 1];
            else {
              const [dx, dy] = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
              const candidates = navigable.map(other => {
                const x = other.x - article.x, y = other.y - article.y;
                const forward = x * dx + y * dy;
                return { article: other, forward, score: Math.hypot(x, y) + Math.abs(x * dy - y * dx) * 1.5 };
              }).filter(candidate => candidate.forward > 1).sort((a, b) => a.score - b.score);
              if (candidates.length) target = candidates[0].article;
            }
            nodeElements.get(target?.id)?.focus({ preventScroll: true });
          } else if (event.key === 'Escape') {
            selected = null; resetDetail(); illuminate(null); writeView();
          }
        });
        nodeElements.set(article.id, node);
        nodeLayer.append(node);
      });
      plot.append(graph, selection);
      paintCamera({ x: 0, y: 0, scale: 1 });
      applyFilter(false);
      if (selected) select(entries.find(article => article.id === selected), { write: false });
    };

    const load = async () => {
      if (loading || loaded) return;
      loading = true;
      plot.replaceChildren(element('p', 'atlas-loading', '正在展开文章星图…'));
      root.setAttribute('aria-busy', 'true');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(root.dataset.index || '/nocturne/search.json', { signal: controller.signal, credentials: 'same-origin' });
        if (!response.ok) throw new Error('Article index unavailable');
        const data = await response.json();
        const raw = Array.isArray(data) ? data : data.posts || data.entries || [];
        if (!Array.isArray(raw)) throw new Error('Invalid article index');
        entries = raw.filter(item => item && typeof item === 'object').map((item, index) => {
          const rawKind = typeof item.kind === 'object' && item.kind ? item.kind.key : item.kind;
          const kind = rawKind || 'essays';
          return {
            id: `article-${index}`, title: plain(item.title), url: safeURL(item.url || item.path),
            summary: plain(item.summary), text: plain(item.text), tags: names(item.tags), categories: names(item.categories),
            entryType: item.entryType === 'page' ? 'page' : 'post',
            kind, kindLabel: plain(typeof item.kind === 'object' && item.kind ? item.kind.label : '') || topics[kind]?.label || kind,
            date: plain(item.date).slice(0, 10)
          };
        }).filter(item => item.title && item.url).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
        loaded = true;
        if (!filterWasChosen) readView();
        render();
        if (filterWasChosen) writeView();
        if (toolbar) toolbar.hidden = false;
      } catch (_) {
        plot.replaceChildren(element('p', 'atlas-error', '星图暂时无法展开。你仍可通过文章归档继续浏览。'));
        const retry = element('button', 'atlas-retry', '重新加载星图');
        retry.type = 'button';
        retry.addEventListener('click', load);
        plot.append(retry);
        status.textContent = '文章索引加载失败，请重试。';
      } finally {
        window.clearTimeout(timeout);
        loading = false;
        root.removeAttribute('aria-busy');
      }
    };

    filters.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.atlasFilter === filter));
      button.addEventListener('click', () => {
        filter = button.dataset.atlasFilter || 'all';
        filterWasChosen = true;
        filters.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        applyFilter();
        if (loaded) writeView('push');
      });
    });
    relationToggle?.addEventListener('click', () => {
      explicitOnly = !explicitOnly;
      applyFilter();
      if (selected) select(entries.find(article => article.id === selected), { write: false });
      writeView('push');
    });
    copyButton?.addEventListener('click', async () => {
      const url = viewURL(true).href;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        status.textContent = '星图链接已复制，包含当前主题、连线模式和选中文章。';
      } catch (_) {
        if (shareInput) { shareInput.hidden = false; shareInput.value = url; shareInput.focus(); shareInput.select(); }
        status.textContent = '链接已显示，请复制下方链接。';
      }
    });
    window.addEventListener('popstate', () => {
      if (!loaded) return;
      readView();
      if (selected && !nodeElements.has(selected)) render();
      else {
        applyFilter();
        if (selected) select(entries.find(article => article.id === selected), { write: false });
      }
    });
    resetDetail();
    if ('ResizeObserver' in window) {
      const resize = new ResizeObserver(positionSelection);
      resize.observe(plot);
      resize.observe(selectionCard);
    } else window.addEventListener('resize', positionSelection);
    if (media.addEventListener) media.addEventListener('change', render);
    else media.addListener(render);
    const settleCamera = () => { stopCamera(); paintCamera(cameraTarget); };
    const settleSelection = () => {
      if (selection.dataset.state === 'closing') hideSelection(true);
      else { cancelSelectionAnimation(); positionSelection(); }
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) { settleCamera(); settleSelection(); } });
    if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { settleCamera(); settleSelection(); } });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(observations => {
        inViewport = observations.some(observation => observation.isIntersecting);
        if (inViewport) load();
        else settleCamera();
      }, { rootMargin: '300px' });
      observer.observe(root);
    } else load();
  });
})();
