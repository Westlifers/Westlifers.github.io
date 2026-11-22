(() => {
  'use strict';
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  const storage = { get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }, set(key,value) { try { localStorage.setItem(key,JSON.stringify(value)); return true; } catch { return false; } } };
  let toastTimer;
  function toast(message) { const el=$('[data-toast]'); if(!el)return; el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500); }
  window.Nocturne={storage,toast};
  const themeButton=$('[data-theme-toggle]');
  function updateThemeButton(){themeButton?.setAttribute('aria-label',document.documentElement.dataset.theme==='dark'?'切换到日间阅读':'切换到夜间阅读');}
  updateThemeButton();
  themeButton?.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('nocturne-theme',next);}catch{}updateThemeButton();});
  let activeDialog, dialogTrigger;
  function openDialog(dialog,trigger){if(!dialog||$('dialog[open]'))return false;dialogTrigger=trigger||document.activeElement;activeDialog=dialog;dialog.showModal();document.body.style.overflow='hidden';return true;}
  function closeDialog(dialog){dialog?.close();}
  $$('.search-dialog,.image-dialog').forEach(dialog=>{dialog.addEventListener('close',()=>{document.body.style.overflow='';activeDialog=null;dialogTrigger?.focus();});dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(dialog);});$$('[data-dialog-close]',dialog).forEach(button=>button.addEventListener('click',()=>closeDialog(dialog)));});
  const search=$('[data-search-dialog]'),input=$('[data-search-input]'),results=$('[data-search-results]'),status=$('[data-search-status]');
  let index, loading, selected=-1, debounce;
  async function loadIndex(){
    if(index)return index;if(loading){try{return await loading;}catch{return null;}}
    status.textContent='正在打开文字档案…';
    loading=(async()=>{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);try{const response=await fetch(search.dataset.index,{signal:controller.signal});if(!response.ok)throw Error('index');const json=await response.json();index=Array.isArray(json)?json:json.entries||json.posts||[];if(!Array.isArray(index))throw Error('format');return index;}finally{clearTimeout(timeout);}})();
    try{return await loading;}catch{status.textContent='暂时无法打开搜索索引。';results.replaceChildren();const button=document.createElement('button');button.className='search-retry';button.textContent='重新加载';button.addEventListener('click',()=>runSearch());results.append(button);return null;}finally{loading=null;}
  }
  function highlight(element,value,terms){
    let text=String(value||''),cursor=0;const lower=text.toLocaleLowerCase();
    while(cursor<text.length){let start=text.length,match='';for(const term of terms){const index=lower.indexOf(term,cursor);if(index>=0&&index<start){start=index;match=term;}}element.append(document.createTextNode(text.slice(cursor,start)));if(!match)break;const mark=document.createElement('mark');mark.textContent=text.slice(start,start+match.length);element.append(mark);cursor=start+match.length;}
  }
  function makeResult(item,terms=[]){
    const a=document.createElement('a');a.className='search-result';a.href=item.url;
    const label=document.createElement('small');const kinds={mathematics:'数学',essays:'随笔',poetry:'诗与声音',fieldnotes:'人间漫游'};
    label.textContent=(typeof item.kind==='object'?item.kind.label:kinds[item.kind])||item.date||'文字';
    const title=document.createElement('strong');highlight(title,item.title,terms);
    const summary=document.createElement('p');let excerpt=String(item.summary||'');
    // Search still uses item.text; excerpts use readable prose and formula text.
    // Older indexes or missing snippet matches retain the prepared summary.
    if(terms.length&&!terms.some(term=>excerpt.toLocaleLowerCase().includes(term))){const text=String(item.snippet||'');const positions=terms.map(term=>text.toLocaleLowerCase().indexOf(term)).filter(index=>index>=0);if(positions.length){const at=Math.min(...positions),characters=Array.from(text),start=Math.max(0,Array.from(text.slice(0,at)).length-35);excerpt=(start?'…':'')+characters.slice(start,start+135).join('')+(start+135<characters.length?'…':'');}}
    const characters=Array.from(excerpt);
    highlight(summary,characters.length>160?characters.slice(0,159).join('')+'…':excerpt,terms);a.append(label,title,summary);return a;
  }
  async function runSearch(){const data=await loadIndex();if(!data)return;const query=input.value.trim().toLocaleLowerCase();results.replaceChildren();selected=-1;
    if(!query){const stored=storage.get('nocturne-bookmarks',[]);const bookmarks=Array.isArray(stored)?stored:[];const saved=data.filter(item=>bookmarks.some(bookmark=>bookmark?.url===new URL(item.url,location.href).pathname));const shown=saved.length?saved:data.slice(0,5);status.textContent=saved.length?`你收藏的 ${saved.length} 篇文字`:'从最近的文字开始，或输入关键词。';shown.forEach(item=>results.append(makeResult(item)));return;}
    const terms=query.split(/\s+/).filter(Boolean);const matches=data.map(item=>{const title=item.title.toLocaleLowerCase();const fields=[title,item.summary,item.text,...(item.tags||[])].join(' ').toLocaleLowerCase();return {item,score:terms.every(term=>fields.includes(term))?terms.reduce((score,term)=>score+(title.includes(term)?10:1),0):0};}).filter(x=>x.score).sort((a,b)=>b.score-a.score);
    status.textContent=matches.length?`找到 ${matches.length} 篇相关文字`:'没有找到相关文字，试试更短的词或其他说法。';matches.slice(0,30).forEach(({item})=>results.append(makeResult(item,terms)));
  }
  function showSearch(trigger){if(openDialog(search,trigger)){input.focus();runSearch();}}
  $$('[data-search-open]').forEach(button=>button.addEventListener('click',()=>showSearch(button)));
  input?.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(runSearch,120);});
  input?.addEventListener('keydown',event=>{const links=$$('.search-result',results);if(['ArrowDown','ArrowUp'].includes(event.key)&&links.length){event.preventDefault();selected=(selected+(event.key==='ArrowDown'?1:-1)+links.length)%links.length;links.forEach((link,i)=>link.classList.toggle('is-selected',i===selected));links[selected].scrollIntoView({block:'nearest'});}if(event.key==='Enter'&&links.length){event.preventDefault();links[Math.max(0,selected)].click();}});
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(search.open)closeDialog(search);else showSearch();}if(event.key==='/'&&!activeDialog&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.closest('input,textarea,select,[contenteditable]')){event.preventDefault();showSearch();}});
  const imageDialog=$('[data-image-dialog]');
  $$('[data-article-content] img').filter(image=>{if(image.closest('.not-gallery-item'))return false;const link=image.closest('a');return !link||/\.(?:jpe?g|png|webp|gif|avif|svg)(?:[?#]|$)/i.test(link.href);}).forEach(image=>{const link=image.closest('a');const target=link||image;target.tabIndex=0;target.setAttribute('role','button');target.setAttribute('aria-haspopup','dialog');target.setAttribute('aria-label','放大图片：'+(image.alt||'文章配图'));function enlarge(event){event?.preventDefault();const preview=$('img',imageDialog);preview.src=link?.href||image.currentSrc||image.src;preview.alt=image.alt;$('p',imageDialog).textContent=image.alt;openDialog(imageDialog,target);}target.addEventListener('click',enlarge);target.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();enlarge(event);}});});
})();
