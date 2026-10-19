'use strict';
(() => {
  const root = document.querySelector('[data-article-content]');
  if (!root) return;
  const mathSource = document.currentScript.dataset.mathSrc;
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

  function revealTarget() {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const target = document.getElementById(id);
    if (!target || !root.contains(target)) return;
    for (let node = target; node && node !== root; node = node.parentElement) {
      if (node.matches('details')) node.open = true;
    }
    target.scrollIntoView({ block: 'start' });
  }
  let frame;
  function queueEnhance() {
    if (!frame) frame = requestAnimationFrame(() => { frame = undefined; enhance(root); });
  }
  enhance(root);
  new ResizeObserver(queueEnhance).observe(root);
  new MutationObserver(queueEnhance).observe(root, { childList: true, subtree: true });
  root.addEventListener('toggle', queueEnhance, true);
  addEventListener('hashchange', revealTarget);
  addEventListener('popstate', revealTarget);
  // Re-clicking the same anchor must also reveal a newly collapsed proof.
  root.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (link && link.pathname === location.pathname && link.hash && link.hash === location.hash) requestAnimationFrame(revealTarget);
  });
  if (location.hash) revealTarget();
  // Load the external engine after local controls have initialized. A slow CDN
  // must not block all later deferred scripts (search, appearance and reading).
  const note = document.createElement('p');
  note.className = 'math-status'; note.setAttribute('role', 'status');
  const loadingTimer = setTimeout(() => {
    note.textContent = '公式正在加载，正文和阅读工具仍可使用。';
    root.before(note);
  }, 1500);
  const ready = window.MathJax?.startup?.promise || new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = mathSource; script.async = true;
    script.addEventListener('load', () => resolve(window.MathJax?.startup?.promise), { once: true });
    script.addEventListener('error', () => reject(new Error('MathJax unavailable')), { once: true });
    document.head.append(script);
  });
  Promise.resolve(ready).then(async () => {
    if (!window.MathJax?.typesetPromise) throw new Error('MathJax unavailable');
    await window.MathJax.typesetPromise([root]);
    clearTimeout(loadingTimer); note.remove();
    enhance(root);
    if (location.hash) revealTarget();
  }).catch(() => {
    clearTimeout(loadingTimer);
    note.textContent = '公式暂未完成排版，联网后刷新可重试。';
    root.before(note);
  });
})();
