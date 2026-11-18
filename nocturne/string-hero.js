(() => {
  'use strict';
  const hero = document.querySelector('[data-string-hero]');
  if (!hero || !window.NocturneStringDiagram) return;
  const stage = hero.querySelector('[data-string-stage]');
  const motion = hero.querySelector('[data-string-motion]');
  const detail = hero.querySelector('[data-string-detail]');
  const scale = hero.querySelector('[data-string-scale]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches, visible = true, pinned = null;
  let current, diagram;
  let selectionStatus = hero.querySelector('[data-string-selection]');
  if (!selectionStatus) {
    selectionStatus = document.createElement('p');
    selectionStatus.className = 'sr-only';
    selectionStatus.setAttribute('role', 'status');
    stage.after(selectionStatus);
  }
  function syncMotion() {
    hero.classList.toggle('string-paused', paused || reduced.matches || !visible || document.hidden);
    if (motion) {
      motion.querySelector('[data-control-label]').textContent = paused || reduced.matches ? '继续流动' : '暂停流动';
      motion.setAttribute('aria-pressed', String(paused || reduced.matches));
      motion.disabled = reduced.matches || !hero.classList.contains('string-ready');
      motion.title = reduced.matches ? '已遵循系统减少动态效果设置' : '';
    }
  }
  // Keep native details as the no-script fallback. During a closing animation
  // it remains open until the body has collapsed; rapid clicks start from the
  // current painted height instead of jumping to an endpoint.
  const disclosure = hero.querySelector('.string-colophon');
  const disclosureBody = disclosure?.querySelector('[data-string-disclosure-body]');
  const disclosureInner = disclosure?.querySelector('[data-string-disclosure-inner]');
  if (disclosureBody?.animate && disclosureInner) {
    let expanded = disclosure.open, revision = 0, heightAnimation, textAnimation;
    const settle = () => {
      heightAnimation?.cancel(); textAnimation?.cancel();
      heightAnimation = textAnimation = null;
      disclosure.open = expanded;
      disclosure.classList.remove('is-closing');
      disclosureBody.style.removeProperty('height');
      disclosureInner.style.removeProperty('opacity');
    };
    disclosure.querySelector('summary').addEventListener('click', event => {
      event.preventDefault();
      const currentHeight = disclosure.open ? disclosureBody.getBoundingClientRect().height : 0;
      const currentOpacity = disclosure.open ? Number(getComputedStyle(disclosureInner).opacity) : 0;
      const thisRevision = ++revision;
      expanded = !expanded;
      heightAnimation?.cancel(); textAnimation?.cancel();
      disclosure.open = true;
      disclosure.classList.toggle('is-closing', !expanded);
      const endHeight = expanded ? disclosureInner.getBoundingClientRect().height : 0;
      if (reduced.matches || Math.abs(currentHeight - endHeight) < .5) { settle(); return; }
      disclosureBody.style.height = `${currentHeight}px`;
      disclosureInner.style.opacity = String(currentOpacity);
      heightAnimation = disclosureBody.animate([
        { height:`${currentHeight}px` }, { height:`${endHeight}px` }
      ], { duration:expanded ? 380 : 280, easing:'cubic-bezier(.22,1,.36,1)', fill:'forwards' });
      textAnimation = disclosureInner.animate([
        { opacity:currentOpacity }, { opacity:expanded ? 1 : 0 }
      ], { duration:expanded ? 300 : 160, delay:expanded && currentHeight === 0 ? 45 : 0, easing:'ease-out', fill:'forwards' });
      heightAnimation.finished.then(() => {
        if (thisRevision === revision) settle();
      }, () => {});
    });
    disclosure.addEventListener('toggle', () => { if (!heightAnimation) expanded = disclosure.open; });
    reduced.addEventListener('change', () => {
      if (reduced.matches) { revision++; settle(); }
    });
  }
  function setReadingMode(reading) {
    hero.classList.toggle('string-reading', reading);
    scale?.setAttribute('aria-pressed', String(reading));
    if (scale) scale.textContent = reading ? '看全图' : '放大读图';
    const scroller = stage.closest('[data-string-scroll]');
    if (scroller) scroller.scrollLeft = 0;
  }
  function selectWord(id, announce = false) {
    if (!diagram) return;
    const related = new Set();
    diagram.classList.toggle('has-selection', Boolean(id));
    diagram.querySelectorAll('[data-words]').forEach(strand => {
      const words = strand.dataset.words.split(' ');
      const active = Boolean(id && words.includes(id));
      strand.classList.toggle('is-active', active);
      if (active) words.forEach(word => related.add(word));
    });
    diagram.querySelectorAll('[data-word]').forEach(word => {
      word.classList.toggle('is-active', word.dataset.word === id);
      word.classList.toggle('is-related', related.has(word.dataset.word));
      word.setAttribute('aria-pressed', String(word.dataset.word === pinned));
      if (word.dataset.word === id) {
        const bounds = word.getBoundingClientRect(), area = hero.getBoundingClientRect();
        hero.style.setProperty('--string-light-x', `${((bounds.left + bounds.width / 2 - area.left) / area.width * 100).toFixed(2)}%`);
      }
    });
    hero.classList.toggle('string-listening', Boolean(id));
    if (announce) {
      const word = current.words.find(item => item.id === id);
      const others = current.words.filter(item => related.has(item.id) && item.id !== id).map(item => item.text);
      selectionStatus.textContent = word ? `${word.text} 的连线已突出${others.length ? '，相接词语：' + others.join('、') : ''}。再次选择可取消。` : '已显示全部连线。';
    }
  }
  function draw(sentence) {
    current = sentence;
    pinned = null;
    stage.innerHTML = window.NocturneStringDiagram.render(sentence, { interactive: true });
    diagram = stage.querySelector('.string-diagram');
    const scroller = stage.closest('[data-string-scroll]') || stage.parentElement;
    if (scroller) scroller.scrollLeft = 0;
    selectionStatus.textContent = '';
    // One entrance after enhancement. Pause/reduced-motion and hidden-tab
    // behavior use the same state as the continuing light on the strands.
    if (!reduced.matches) {
      hero.classList.add('string-arriving');
      const finishEntrance = event => {
        if (event.animationName !== 'string-inscribe' || event.target.closest('[data-strand]')?.dataset.strand !== 'strand-11') return;
        hero.classList.remove('string-arriving');
        stage.removeEventListener('animationend', finishEntrance);
      };
      stage.addEventListener('animationend', finishEntrance);
      reduced.addEventListener('change', () => {
        if (reduced.matches) { hero.classList.remove('string-arriving'); stage.removeEventListener('animationend', finishEntrance); }
      }, { once:true });
    }
  }
  stage.addEventListener('pointerover', event => {
    const word = event.target.closest('[data-word]');
    if (word && !pinned && event.pointerType !== 'touch') selectWord(word.dataset.word);
  });
  stage.addEventListener('pointerleave', () => { if (!pinned) selectWord(null); });
  stage.addEventListener('focusin', event => {
    const word = event.target.closest('[data-word]');
    if (word && matchMedia('(max-width: 760px)').matches && !hero.classList.contains('string-reading')) {
      setReadingMode(true);
      word.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    }
    if (word && !pinned) selectWord(word.dataset.word);
  });
  stage.addEventListener('focusout', event => {
    if (!pinned && !stage.contains(event.relatedTarget)) selectWord(null);
  });
  function pin(word) {
    pinned = pinned === word.dataset.word ? null : word.dataset.word;
    selectWord(pinned, true);
  }
  stage.addEventListener('click', event => {
    if (!current) return;
    const word = event.target.closest('[data-word]');
    if (word) pin(word);
    else { pinned = null; selectWord(null, true); }
  });
  stage.addEventListener('keydown', event => {
    const word = event.target.closest('[data-word]');
    if (!word || !current) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pin(word); }
    if (event.key === 'Escape') { pinned = null; selectWord(null, true); }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const words = [...diagram.querySelectorAll('[data-word]')];
      const index = words.indexOf(word);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? words.length - 1 : Math.max(0, Math.min(words.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
      words[next].focus({ preventScroll: true });
      words[next].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
  });
  motion?.addEventListener('click', () => { paused = !paused; syncMotion(); });
  scale?.addEventListener('click', () => setReadingMode(!hero.classList.contains('string-reading')));
  detail?.addEventListener('click', () => {
    const shown = hero.classList.toggle('show-string-types');
    detail.setAttribute('aria-pressed', String(shown));
    detail.querySelector('[data-control-label]').textContent = shown ? '收起类型' : '展开类型';
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting; syncMotion();
  }, { threshold: 0 }).observe(stage);
  document.addEventListener('visibilitychange', syncMotion);
  reduced.addEventListener('change', syncMotion);
  syncMotion();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  fetch(hero.dataset.source, { signal: controller.signal }).then(response => {
    if (!response.ok) throw new Error('Sentence data unavailable');
    return response.json();
  }).then(sentence => {
    if (sentence.schemaVersion !== 1 || sentence.id !== 'E') throw new Error('Unknown sentence data');
    draw(sentence);
    hero.classList.add('string-ready');
    if (detail) detail.disabled = false;
    if (scale) scale.disabled = false;
    if (motion) motion.disabled = reduced.matches;
    syncMotion();
  }).catch(() => {
    // The fully rendered initial graph is part of the document, so a failed
    // enhancement never leaves a blank stage or discards the selected sentence.
    selectionStatus.textContent = '当前显示静态线图，交互暂时不可用。';
  }).finally(() => clearTimeout(timeout));
})();
