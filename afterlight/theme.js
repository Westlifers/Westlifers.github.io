(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let appearanceTimer;
  const appearance = document.querySelector('button[data-appearance]');
  const labels = { light: '浅色', dark: '深色' };
  function syncAppearance() {
    const value = window.afterlightAppearance.get();
    appearance.querySelector('[data-appearance-label]').textContent = labels[value];
    appearance.setAttribute('aria-label', `当前${labels[value]}，切换为${labels[value === 'light' ? 'dark' : 'light']}`);
    appearance.setAttribute('aria-pressed', String(value === 'dark'));
  }
  if (appearance && window.afterlightAppearance) {
    appearance.hidden = false;
    syncAppearance();
    appearance.addEventListener('click', () => {
      clearTimeout(appearanceTimer);
      if (!reduced.matches) document.documentElement.classList.add('theme-changing');
      const current = window.afterlightAppearance.get();
      window.afterlightAppearance.set(current === 'light' ? 'dark' : 'light');
      syncAppearance();
      appearanceTimer = setTimeout(() => document.documentElement.classList.remove('theme-changing'), 240);
    });
  }
  // Stagger the actual title lines, not the whole text block. No hidden CSS state:
  // without JS, or with reduced motion, all content remains immediately readable.
  const entrances = new Set();
  function enter(element, delay = 0, photo = false) {
    if (reduced.matches) return;
    const motion = element.animate([
      { opacity: 0, transform: photo ? 'translateY(22px) rotate(-1deg) scale(.98)' : 'translateY(18px)' },
      { opacity: 1, transform: 'none' }
    ], { duration: photo ? 850 : 650, delay, fill: 'backwards', easing: 'cubic-bezier(.16,1,.3,1)' });
    entrances.add(motion);
    motion.finished.then(() => entrances.delete(motion), () => entrances.delete(motion));
  }
  document.querySelectorAll('.hero-copy > .eyebrow, .home-hero h1 > span, .hero-quote, .hero-copy > .underlined-link')
    .forEach((element, index) => enter(element, index * 75));
  // The photograph completes the opening sequence; later reading stays still.
  let observer;
  if (!reduced.matches && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      enter(entry.target, entry.target.matches('.hero-photo') ? 120 : 0, entry.target.matches('.hero-photo'));
    }), { threshold: .12 });
    document.querySelectorAll('.hero-photo').forEach(element => observer.observe(element));
  }
  reduced.addEventListener('change', event => {
    if (!event.matches) return;
    observer?.disconnect(); entrances.forEach(motion => motion.cancel()); entrances.clear();
  });
  // Missing optional images must leave a readable title and link behind.
  document.querySelectorAll('.featured-image img').forEach(img => {
    const fail = () => { img.closest('.featured-story').classList.add('image-unavailable'); };
    img.addEventListener('error', fail);
    if (img.complete && !img.naturalWidth) fail();
  });
})();
