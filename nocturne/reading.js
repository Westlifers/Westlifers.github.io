(() => {
  'use strict';
  const page=document.querySelector('[data-reading-page]'),content=document.querySelector('[data-article-content]');
  if(!page||!content)return;
  const {storage,toast}=window.Nocturne;
  const key='nocturne-position:'+location.pathname;
  const prior=storage.get(key,null);
  const resume=document.querySelector('[data-resume]');
  const progress=document.querySelector('[data-reading-progress]'),percent=document.querySelector('[data-reading-percent]');
  let lastSaved=0,frame,readingStarted=false;
  function update(forceSave=false){frame=0;const start=content.getBoundingClientRect().top+scrollY;const range=Math.max(1,content.scrollHeight-innerHeight*.6);const fraction=Math.max(0,Math.min(1,(scrollY-start+innerHeight*.2)/range));progress.style.width=(fraction*100)+'%';percent.textContent=Math.round(fraction*100)+'%';if(readingStarted&&fraction>0&&(forceSave||Date.now()-lastSaved>1000)){storage.set(key,{fraction,updated:Date.now()});lastSaved=Date.now();}}
  function queue(){if(!frame)frame=requestAnimationFrame(()=>update());}
  addEventListener('scroll',queue,{passive:true});addEventListener('resize',queue);new ResizeObserver(queue).observe(content);update();
  ['wheel','touchmove'].forEach(event=>addEventListener(event,()=>{readingStarted=true;},{passive:true}));
  addEventListener('keydown',event=>{if(['PageDown','PageUp','ArrowDown','ArrowUp','Home','End',' '].includes(event.key)&&!event.target.closest('input,textarea,select,[contenteditable]'))readingStarted=true;});
  addEventListener('pagehide',()=>update(true));
  if(prior?.fraction>.03&&prior.fraction<.98&&!location.hash){resume.hidden=false;resume.textContent=`继续上次的阅读（${Math.round(prior.fraction*100)}%）`;resume.addEventListener('click',()=>{readingStarted=true;const start=content.getBoundingClientRect().top+scrollY;window.scrollTo({top:start+prior.fraction*Math.max(1,content.scrollHeight-innerHeight*.6)-innerHeight*.2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});resume.hidden=true;});}
  const focus=document.querySelector('[data-focus]');
  let positionRestore = null;
  function capturePosition() {
    positionRestore?.finish(true);
    const visible = [...content.querySelectorAll('h1,h2,h3,h4,p,li,pre,figure')]
      .map(element => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.height > 0 && box.bottom > 60 && box.top < innerHeight);
    // A recently navigated heading is a stronger landmark than the tail of
    // the preceding paragraph. Keep it at the same screen position.
    const heading = visible.find(({ element, box }) => /^H[1-4]$/.test(element.tagName) && box.top >= 40 && box.top <= 120);
    const candidate = heading || visible[0];
    if (!candidate) return null;
    const point = { element: candidate.element, top: candidate.box.top };
    if (heading) return point;
    // When reading partway through a long paragraph, preserve the actual text
    // line instead of its potentially off-screen beginning.
    const box = content.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 1, box.left + Math.min(48, box.width / 3)));
    const y = Math.max(80, box.top + 2);
    if (y >= innerHeight) return point;
    let caret;
    if (document.caretPositionFromPoint) {
      const found = document.caretPositionFromPoint(x, y);
      if (found) caret = { node: found.offsetNode, offset: found.offset };
    } else if (document.caretRangeFromPoint) {
      const found = document.caretRangeFromPoint(x, y);
      if (found) caret = { node: found.startContainer, offset: found.startOffset };
    }
    if (caret?.node.nodeType === Node.TEXT_NODE && content.contains(caret.node) && caret.node.length &&
        !caret.node.parentElement.closest('mjx-container,math,svg,.math-scroll')) {
      const range = document.createRange();
      const offset = Math.min(caret.offset, caret.node.length - 1);
      range.setStart(caret.node, offset);
      range.setEnd(caret.node, offset + 1);
      const rect = range.getBoundingClientRect();
      if (rect.height > 0) { point.range = range; point.rangeTop = rect.top; }
    }
    return point;
  }
  function preservePosition(change, position) {
    // There is only one correction loop. Rapid settings changes must not have
    // several animation frames pulling the document toward different anchors.
    positionRestore?.finish(true);
    const point = position || capturePosition();
    if (!point) { change(); queue(); return; }
    const html = document.documentElement;
    const previousAnchor = html.style.overflowAnchor;
    let raf = 0, quietFrames = 0, stopped = false;
    const started = performance.now();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { quietFrames = 0; });
    function align() {
      if (!point.element.isConnected) return 0;
      let delta = point.element.getBoundingClientRect().top - point.top;
      if (point.range && content.contains(point.range.startContainer)) {
        const rect = point.range.getBoundingClientRect();
        if (rect.height > 0) delta = rect.top - point.rangeTop;
      }
      if (Math.abs(delta) > .5) window.scrollTo({ top: scrollY + delta, left: scrollX, behavior: 'instant' });
      return Math.abs(delta);
    }
    const transaction = { finish(correct = false) {
      if (stopped) return;
      if (correct) align();
      stopped = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      html.style.overflowAnchor = previousAnchor;
      if (positionRestore === transaction) positionRestore = null;
      queue();
    } };
    positionRestore = transaction;
    html.style.overflowAnchor = 'none';
    try { change(); } catch (error) { transaction.finish(); throw error; }
    align();
    observer?.observe(content);
    function settle() {
      if (stopped) return;
      quietFrames = align() > .5 ? 0 : quietFrames + 1;
      const elapsed = performance.now() - started;
      if ((elapsed >= 220 && quietFrames >= 3) || elapsed >= 1200) transaction.finish();
      else raf = requestAnimationFrame(settle);
    }
    raf = requestAnimationFrame(settle);
  }
  ['wheel','touchstart','pointerdown'].forEach(name => addEventListener(name, event => {
    if (!event.target.closest?.('[data-reader-dialog]')) positionRestore?.finish();
  }, { passive: true }));
  focus.addEventListener('click',()=>preservePosition(()=>{const active=document.body.classList.toggle('focus-reading');focus.setAttribute('aria-pressed',String(active));focus.textContent=active?'退出专注':'专注阅读';queue();}));
  const save=document.querySelector('[data-save]');
  function saved(){return storage.get('nocturne-bookmarks',[]).some(item=>item.url===location.pathname);}
  function syncSave(){const active=saved();save.setAttribute('aria-pressed',String(active));save.textContent=active?'已收藏':'收藏本文';}
  syncSave();save.addEventListener('click',()=>{let bookmarks=storage.get('nocturne-bookmarks',[]);const exists=saved();bookmarks=bookmarks.filter(item=>item.url!==location.pathname);if(!exists)bookmarks.unshift({title:page.dataset.title,url:location.pathname});if(storage.set('nocturne-bookmarks',bookmarks)){syncSave();toast(exists?'已取消收藏':'已收藏，可在搜索窗口中找到。');}else toast('浏览器未允许保存，请检查本地存储设置。');});
  document.querySelector('[data-copy-link]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);toast('文章链接已复制。');}catch{toast('无法自动复制，请从地址栏复制链接。');}});
  const fontButton=document.querySelector('[data-font-size]');const sizes=[17,19,21];let fontSize=storage.get('nocturne-font-size',17);if(!sizes.includes(fontSize))fontSize=17;
  function setFont(){content.style.fontSize=fontSize+'px';content.style.setProperty('--reading-size',fontSize+'px');fontButton.textContent=`字号 ${fontSize}`;fontButton.setAttribute('aria-label',`当前字号 ${fontSize}，点击切换`);}
  const leadings={normal:null,compact:1.8,relaxed:2.15};let leading=storage.get('nocturne-leading','normal');if(!Object.hasOwn(leadings,leading))leading='normal';
  function setLeading(){if(leadings[leading])content.style.lineHeight=String(leadings[leading]);else content.style.removeProperty('line-height');}
  setFont();setLeading();fontButton.addEventListener('click',()=>preservePosition(()=>{fontSize=sizes[(sizes.indexOf(fontSize)+1)%sizes.length];setFont();storage.set('nocturne-font-size',fontSize);}));
  window.Nocturne.reader={
    capturePosition,
    preservePosition,
    cancelPositionRestore(){positionRestore?.finish();},
    startReading(){readingStarted=true;},
    getTypography(){return {size:fontSize,leading};},
    setTypography(values,position){preservePosition(()=>{if(sizes.includes(values.size))fontSize=values.size;if(Object.hasOwn(leadings,values.leading))leading=values.leading;setFont();setLeading();storage.set('nocturne-font-size',fontSize);storage.set('nocturne-leading',leading);},position);}
  };
  content.querySelectorAll('table').forEach(table=>{if(table.closest('.highlight,.table-scroll'))return;const wrapper=document.createElement('div');wrapper.className='table-scroll';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','表格，可横向滚动');table.before(wrapper);wrapper.append(table);});
  document.querySelectorAll('.article-outline a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{readingStarted=true;}));
  if(innerWidth<760){const outline=document.querySelector('.article-outline');if(outline)outline.open=false;}
})();
