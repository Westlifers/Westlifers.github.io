(() => {
  'use strict';
  const scene = document.querySelector('.about-experience');
  const hero = scene?.querySelector('.about-hero');
  if (!scene || !hero) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  function syncMotion() {
    const moving = visible && !document.hidden && !reduced.matches;
    scene.classList.toggle('is-about-moving', moving);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncMotion();
    }, { threshold: 0 }).observe(hero);
  } else {
    visible = true;
  }

  reduced.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('pagehide', () => scene.classList.remove('is-about-moving'));
  window.addEventListener('pageshow', syncMotion);
  syncMotion();
})();
