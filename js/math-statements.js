'use strict';
(() => {
  if (window.__mathStatementsInitialized) return;
  window.__mathStatementsInitialized = true;
  const mathJaxSrc = document.currentScript?.dataset.mathjaxSrc;
  const liveRoots = new Map();
  let mathReady;
  let typesetQueue = Promise.resolve();
  let scanFrame = 0;
  let firstScan = true;

  // Authors name the exact statement and proof part. Never infer an association
  // from adjacency: a theorem can have several proofs separated by lemmas.
  function linkProofs(root) {
    root.querySelectorAll('.proof[data-proof-of]').forEach(proof => {
      if (proof.dataset.proofLinked || !proof.id) return;
      const article = proof.closest('.math-article');
      const statement = [...(article?.querySelectorAll('.statement[id]:not(.proof)') || [])]
        .find(item => item.id === proof.dataset.proofOf);
      if (!statement) return;
      const label = statement.querySelector('.statement-label')?.textContent
        .trim().replace(/[.。]\s*$/, '') || '命题';
      const part = proof.dataset.proofPart;
      const summary = proof.querySelector(':scope > summary');
      const associated = [...article.querySelectorAll('.proof[data-proof-of]')]
        .filter(item => item.dataset.proofOf === statement.id);
      let previous = proof.previousSibling;
      // Whitespace/comments are formatting; headings, paragraphs and even raw
      // nonempty text are intervening content. Do not infer targets from them.
      while (previous && (previous.nodeType === Node.COMMENT_NODE ||
          (previous.nodeType === Node.TEXT_NODE && !previous.textContent.trim()))) {
        previous = previous.previousSibling;
      }
      if (associated.length === 1 && previous === statement && summary) {
        const target = document.createElement('a');
        target.href = '#' + encodeURIComponent(statement.id);
        target.textContent = label;
        target.setAttribute('aria-label', '返回' + label);
        summary.replaceChildren(document.createTextNode('证明：'), target);
        if (part) summary.append(document.createTextNode(' · ' + part));
        proof.dataset.proofLinked = 'true';
        return;
      }
      const context = document.createElement('p');
      context.className = 'proof-context';
      const lead = document.createElement('strong');
      lead.textContent = '证明目标：';
      const target = document.createElement('a');
      target.href = '#' + encodeURIComponent(statement.id);
      target.textContent = label;
      context.append(lead, target);
      if (part) context.append(document.createTextNode(' · ' + part));
      proof.before(context);
      if (summary) summary.textContent = '证明：' + (part || label);
      let nav = statement.querySelector(':scope > .statement-proofs');
      if (!nav) {
        nav = document.createElement('nav');
        nav.className = 'statement-proofs';
        nav.setAttribute('aria-label', label + '的证明位置');
        const title = document.createElement('span');
        title.textContent = '证明位置';
        nav.append(title, document.createElement('ul'));
        statement.append(nav);
      }
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#' + encodeURIComponent(proof.id);
      link.textContent = part || '完整证明';
      row.append(link);
      nav.querySelector('ul').append(row);
      proof.dataset.proofLinked = 'true';
    });
  }

  function getMathJax() {
    if (window.MathJax?.typesetPromise) {
      return Promise.resolve(window.MathJax.startup?.promise).then(() => window.MathJax);
    }
    if (window.MathJax?.startup?.promise) {
      return window.MathJax.startup.promise.then(() => window.MathJax);
    }
    if (mathReady) return mathReady;
    mathReady = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="tex-mml-chtml.js"]');
      const script = existing || document.createElement('script');
      script.addEventListener('load', () => {
        Promise.resolve(window.MathJax?.startup?.promise).then(() => {
          if (window.MathJax?.typesetPromise) resolve(window.MathJax);
          else reject(new Error('MathJax did not initialize'));
        }, reject);
      }, { once: true });
      script.addEventListener('error', () => reject(new Error('MathJax could not load')), { once: true });
      if (!existing) {
        window.MathJax = {
          tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
          chtml: { matchFontHeight: false },
          startup: { typeset: false }
        };
        script.src = mathJaxSrc;
        script.async = true;
        document.head.append(script);
      }
    });
    return mathReady;
  }
  function enhance(root) {
    if (root.matches('.math-article') || root.querySelector('mjx-container, .math.display, .tikzjax')) {
      root.classList.add('math-layout');
    }
    root.querySelectorAll('div.statement.proof').forEach(proof => {
      const details = document.createElement('details');
      for (const attr of proof.attributes) details.setAttribute(attr.name, attr.value);
      details.open = true;
      const summary = document.createElement('summary');
      const heading = proof.querySelector('.statement-heading');
      summary.textContent = heading ? heading.textContent : '证明';
      if (heading) heading.remove();
      const body = document.createElement('div');
      body.className = 'proof-body';
      body.append(...proof.childNodes);
      details.append(summary, body);
      proof.replaceWith(details);
    });
    linkProofs(root);
    const availableWidth = item => {
      const parent = item.parentElement;
      const block = parent?.closest('p, li, td, th, .proof-body, .statement') || root;
      const style = getComputedStyle(block);
      return block.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
    };
    // Inline formulae return to the text flow when their containing block grows.
    root.querySelectorAll('.math-scroll[data-math-inline]').forEach(wrapper => {
      const item = wrapper.firstElementChild;
      if (item?.getClientRects().length && item.getBoundingClientRect().width <= availableWidth(wrapper) + 1) {
        wrapper.replaceWith(item);
      }
    });
    root.querySelectorAll('mjx-container, .math.display, .tikzjax').forEach(item => {
      if (item.closest('.math-scroll')) return;
      const inline = item.matches('mjx-container:not([display="true"])');
      if (inline && (!item.getClientRects().length ||
          item.getBoundingClientRect().width <= availableWidth(item) + 1)) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'math-scroll';
      if (inline) wrapper.dataset.mathInline = 'true';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', item.matches('.tikzjax') ? '交换图，可横向滚动' : '公式，可横向滚动');
      item.before(wrapper);
      wrapper.append(item);
    });
  }
  function scanRoots() {
    scanFrame = 0;
    const themeOwnsInitialTypeset = firstScan && !!document.querySelector('script[src*="tex-mml-chtml.js"]');
    firstScan = false;
    let removedMath = false;
    for (const [root, observers] of liveRoots) {
      if (!root.isConnected) {
        observers.forEach(observer => observer.disconnect());
        window.MathJax?.typesetClear?.([root]);
        removedMath = removedMath || root.classList.contains('math-layout');
        liveRoots.delete(root);
      }
    }
    if (removedMath) window.MathJax?.texReset?.();
    document.querySelectorAll('article.article > .content').forEach(root => {
      if (liveRoots.has(root)) return;
      const mutations = new MutationObserver(() => enhance(root));
      const resize = new ResizeObserver(() => enhance(root));
      mutations.observe(root, { childList: true, subtree: true });
      resize.observe(root);
      liveRoots.set(root, [mutations, resize]);
      enhance(root);
      // A new article may arrive with a fragment before PJAX/typesetting ends.
      // Ordinary DOM changes must not scroll back to a stale fragment.
      if (location.hash && root.querySelector('.math-article')) {
        const fragment = location.hash;
        requestAnimationFrame(() => {
          if (root.isConnected && location.hash === fragment) revealTarget();
        });
      }
      if (!themeOwnsInitialTypeset &&
          (window.MathJax?.typesetPromise || root.querySelector('.math-article, .math.display, .quantaloid-equation'))) {
        typesetQueue = typesetQueue.then(() => getMathJax()).then(math => {
          if (root.isConnected) return math.typesetPromise([root]);
        }).then(() => { if (root.isConnected) { enhance(root); if (location.hash) revealTarget(); } })
          .catch(error => console.error('Mathematical typesetting:', error));
      }
    });
  }
  function queueScan() {
    if (!scanFrame) scanFrame = requestAnimationFrame(scanRoots);
  }
  new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('pjax:complete', queueScan);
  scanRoots();
  // Cross-references also reveal a target inside a previously collapsed proof.
  function revealTarget() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    let target = document.getElementById(id);
    // Icarus' PJAX cache buster can land after the fragment in a cross-page URL.
    // Repair only its numeric suffix when the original fragment has no target.
    if (!target && /\?t=\d+$/.test(id)) {
      const cleanId = id.replace(/\?t=\d+$/, '');
      const cleanTarget = document.getElementById(cleanId);
      if (cleanTarget?.closest('.math-article')) {
        id = cleanId;
        target = cleanTarget;
        history.replaceState(history.state, '', location.pathname + location.search + '#' + encodeURIComponent(id));
      }
    }
    if (!target || !target.closest('.math-article')) return;
    for (let p = target; p; p = p.parentElement) {
      if (p.matches('details')) p.open = true;
    }
    target.scrollIntoView({ block: 'start' });
  }
  addEventListener('hashchange', revealTarget);
  addEventListener('popstate', revealTarget);
  document.addEventListener('pjax:complete', () => requestAnimationFrame(revealTarget));
  if (location.hash) revealTarget();
})();
