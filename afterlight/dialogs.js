(() => {
  const openers = new WeakMap();
  const motions = new WeakMap();
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stop(dialog) { motions.get(dialog)?.cancel(); motions.delete(dialog); delete dialog.dataset.closing; }
  function close(dialog) {
    if (!dialog.open || dialog.dataset.closing) return;
    stop(dialog);
    if (reduced()) { dialog.close(); return; }
    dialog.dataset.closing = 'true';
    const motion = dialog.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }], { duration: 130, easing: 'ease-out' });
    motions.set(dialog, motion);
    motion.finished.then(() => { if (motions.get(dialog) === motion) dialog.close(); }).catch(() => {});
  }
  function viewport() { document.documentElement.style.setProperty('--visible-height', (window.visualViewport?.height || innerHeight) + 'px'); }
  viewport(); addEventListener('resize', viewport); window.visualViewport?.addEventListener('resize', viewport);
  window.afterlightDialogs = {
    open(dialog, opener = document.activeElement) {
      document.querySelectorAll('dialog[open]').forEach(other => { if (other !== dialog) other.close(); });
      stop(dialog);
      if (dialog.open) return;
      openers.set(dialog, opener);
      dialog.showModal();
      document.body.classList.add('modal-open');
      if (!reduced()) motions.set(dialog, dialog.animate([{ opacity: .3, transform: 'translateY(12px) scale(.99)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' }));
    },
    close,
    bind(dialog) {
      // Search inputs consume Escape to clear text; modal dismissal takes priority.
      dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(dialog); }
      }, true);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(dialog); });
      dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => close(dialog));
      dialog.addEventListener('click', event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close(dialog);
      });
      dialog.addEventListener('close', () => {
        stop(dialog);
        if (!document.querySelector('dialog[open]')) {
          document.body.classList.remove('modal-open');
          const opener = openers.get(dialog);
          if (opener?.isConnected) opener.focus({ preventScroll: true });
        }
      });
    }
  };
  document.querySelectorAll('.afterlight-dialog').forEach(window.afterlightDialogs.bind);
})();
