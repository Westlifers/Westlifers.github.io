(() => {
  const host = document.querySelector('[data-comments]');
  // Double guard: even a non-preview build opened locally cannot contact Giscus.
  if (!host || host.dataset.preview === 'true' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.protocol === 'file:') return;
  const button = host.querySelector('[data-comments-load]'), status = host.querySelector('[data-comments-status]'), mount = host.querySelector('.giscus');
  if (!button || !mount) return;
  const theme = () => document.documentElement.dataset.theme === 'dark' ? 'noborder_dark' : 'noborder_light';
  const sync = () => mount.querySelector('iframe')?.contentWindow?.postMessage({ giscus: { setConfig: { theme: theme() } } }, 'https://giscus.app');
  let loaded = false, timer;
  button.hidden = false;
  function fail() {
    clearTimeout(timer); loaded = false; button.hidden = false; button.disabled = false;
    button.textContent = '重新加载评论'; status.textContent = '评论暂时无法加载，请稍后重试。'; mount.replaceChildren();
  }
  button.addEventListener('click', () => {
    if (loaded) return;
    loaded = true; button.disabled = true; status.textContent = '正在加载评论…';
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js'; script.async = true; script.crossOrigin = 'anonymous';
    for (const key of ['repo', 'repoId', 'category', 'categoryId', 'mapping', 'lang']) script.dataset[key] = host.dataset[key];
    Object.assign(script.dataset, { strict: '0', reactionsEnabled: '1', emitMetadata: '0', inputPosition: 'top', theme: theme() });
    script.addEventListener('error', fail, { once: true });
    timer = setTimeout(fail, 20000); mount.append(script);
  });
  new MutationObserver(() => {
    const iframe = mount.querySelector('iframe');
    if (!iframe || iframe.dataset.afterlightBound) return;
    iframe.dataset.afterlightBound = 'true';
    iframe.addEventListener('load', () => { clearTimeout(timer); button.hidden = true; status.textContent = ''; sync(); });
  }).observe(mount, { childList: true, subtree: true });
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  addEventListener('message', event => {
    if (event.origin !== 'https://giscus.app' || event.source !== mount.querySelector('iframe')?.contentWindow) return;
    const error = event.data?.giscus?.error;
    // Giscus creates a discussion on the first comment/reaction. Its client
    // treats this response as an empty thread, not a broken widget.
    if (typeof error === 'string' && error.includes('Discussion not found')) return;
    if (error) fail();
  });
})();
