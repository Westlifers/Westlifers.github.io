(() => {
  const dialog = document.getElementById('search-dialog');
  if (!dialog) return;
  const input = dialog.querySelector('input');
  const status = dialog.querySelector('[data-search-status]');
  const results = dialog.querySelector('.search-results');
  const retry = dialog.querySelector('[data-search-retry]');
  let entries, pending, timer;
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase();
  function highlight(value, terms) {
    const fragment = document.createDocumentFragment();
    const pattern = new RegExp(terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'giu');
    let cursor = 0;
    for (const match of value.matchAll(pattern)) {
      fragment.append(value.slice(cursor, match.index));
      const mark = document.createElement('mark'); mark.textContent = match[0]; fragment.append(mark);
      cursor = match.index + match[0].length;
    }
    fragment.append(value.slice(cursor)); return fragment;
  }
  function render() {
    results.replaceChildren();
    const query = normalize(input.value.trim()).slice(0, 200);
    if (!query) { status.textContent = '输入关键词，找一篇文字。'; return; }
    if (!entries) return;
    const terms = query.split(/\s+/);
    const found = entries.map(entry => {
      const title = normalize(entry.title), tags = normalize([...entry.tags, ...entry.categories].join(' ')), body = normalize(entry.text);
      if (!terms.every(term => title.includes(term) || tags.includes(term) || body.includes(term))) return null;
      const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 10 : 0) + (tags.includes(term) ? 5 : 0), 0);
      return { entry, score, offset: body.indexOf(terms[0]) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    status.textContent = found.length ? `找到 ${found.length} 篇文字` : '没有找到，试试另一个词。';
    found.forEach(({ entry, offset }) => {
      const row = document.createElement('li'), link = document.createElement('a'), title = document.createElement('strong'), excerpt = document.createElement('p');
      link.href = entry.url; title.append(highlight(entry.title, terms));
      const start = Math.max(0, offset - 35);
      excerpt.append(highlight((start ? '…' : '') + entry.text.slice(start, start + 115) + (entry.text.length > start + 115 ? '…' : ''), terms));
      link.append(title, excerpt); row.append(link); results.append(row);
    });
  }
  async function load() {
    if (entries) { render(); return; }
    if (pending) return pending;
    status.textContent = '正在查找文章…'; retry.hidden = true;
    dialog.setAttribute('aria-busy', 'true');
    pending = (async () => {
      try {
        const response = await fetch(dialog.dataset.index);
        if (!response.ok) throw new Error('Index unavailable');
        entries = await response.json();
        if (!Array.isArray(entries)) throw new Error('Invalid index');
        render();
      } catch (_) {
        entries = undefined;
        status.textContent = '暂时无法加载文章，请重试。'; retry.hidden = false;
      } finally { pending = undefined; dialog.setAttribute('aria-busy', 'false'); }
    })();
    return pending;
  }
  function open(opener) { window.afterlightDialogs.open(dialog, opener); input.focus(); load(); }
  document.querySelectorAll('[data-search-open]').forEach(button => {
    button.hidden = false; button.addEventListener('click', () => open(button));
  });
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => entries ? render() : load(), 100); });
  retry.addEventListener('click', load);
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(document.activeElement); }
  });
})();
