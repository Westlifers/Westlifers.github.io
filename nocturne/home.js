(() => {
  'use strict';
  const section=document.querySelector('[data-footer-player]');
  const audio=section?.querySelector('[data-home-audio]');
  const play=section?.querySelector('[data-audio-toggle]');
  if(!audio || !play)return;
  const seek=section.querySelector('[data-audio-seek]');
  const label=section.querySelector('[data-audio-label]');
  const status=section.querySelector('[data-audio-status]');
  const current=section.querySelector('[data-audio-current]');
  const duration=section.querySelector('[data-audio-duration]');
  const time=value => Number.isFinite(value) ? Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0') : '—:—';
  const ready=()=>Number.isFinite(audio.duration)&&audio.duration>0;
  function syncPosition(){
    current.textContent=time(audio.currentTime);duration.textContent=time(audio.duration);
    seek.disabled=!ready();
    seek.style.setProperty('--audio-progress',ready() ? `${Math.max(0,Math.min(100,audio.currentTime/audio.duration*100))}%` : '0%');
    if(ready()){
      seek.max=String(audio.duration);seek.value=String(audio.currentTime);
      seek.setAttribute('aria-valuetext',time(audio.currentTime)+'，共 '+time(audio.duration));
      try{navigator.mediaSession?.setPositionState?.({duration:audio.duration,playbackRate:audio.playbackRate,position:Math.min(audio.currentTime,audio.duration)});}catch{}
    }
  }
  function sync(){
    const playing=!audio.paused&&!audio.ended;
    play.setAttribute('aria-pressed',String(playing));
    play.setAttribute('aria-label',playing?'暂停 Route Six':'播放 Route Six');
    play.querySelector('[data-play-icon]').textContent=playing?'Ⅱ':'▶';
    label.textContent=playing?'Route Six 正在播放':audio.currentTime>0?'继续听 Route Six':'听听 Route Six';
    section.classList.toggle('is-playing',playing);
    if('mediaSession' in navigator)navigator.mediaSession.playbackState=playing?'playing':'paused';
    syncPosition();
  }
  let metadataSet=false;
  async function start(){
    status.textContent='';
    if(audio.error)audio.load();
    if(!metadataSet && 'mediaSession' in navigator && 'MediaMetadata' in window){
      const artwork=new URL('images/city.webp',document.querySelector('script[src$="/nocturne/home.js"]').src).href;
      navigator.mediaSession.metadata=new MediaMetadata({title:'Route Six',artist:'Suno 生成音乐',album:'夜曲',artwork:[{src:artwork,type:'image/webp'}]});
      metadataSet=true;
    }
    try{await audio.play();}catch{status.textContent='音频暂时无法播放。可以重试，或在歌曲文章中收听。';}sync();
  }
  play.addEventListener('click',()=>{if(audio.paused)start();else audio.pause();});
  seek.addEventListener('input',()=>{if(ready()){audio.currentTime=Number(seek.value);syncPosition();}});
  ['play','pause','ended'].forEach(event=>audio.addEventListener(event,sync));
  ['loadedmetadata','durationchange','timeupdate','seeked'].forEach(event=>audio.addEventListener(event,syncPosition));
  audio.addEventListener('error',()=>{status.textContent='音频暂时无法加载。你也可以在歌曲文章中收听。';sync();});
  if('mediaSession' in navigator){
    const actions={play:start,pause:()=>audio.pause(),seekbackward:details=>{if(ready())audio.currentTime=Math.max(0,audio.currentTime-(details.seekOffset||10));},seekforward:details=>{if(ready())audio.currentTime=Math.min(audio.duration,audio.currentTime+(details.seekOffset||10));},seekto:details=>{if(ready()&&Number.isFinite(details.seekTime))audio.currentTime=Math.min(audio.duration,Math.max(0,details.seekTime));}};
    for(const [action,handler] of Object.entries(actions)){try{navigator.mediaSession.setActionHandler(action,handler);}catch{}}
  }
  section.classList.add('audio-enhanced');
  section.querySelector('[data-audio-player]').hidden=false;
  audio.controls=false;
  sync();
  // A pointer-only glint on the mathematics plate; there is no idle render loop.
  const plate=document.querySelector('.work-math');
  if(plate&&matchMedia('(pointer:fine) and (prefers-reduced-motion:no-preference)').matches){
    plate.addEventListener('pointermove',event=>{const rect=plate.getBoundingClientRect();plate.style.setProperty('--work-x',((event.clientX-rect.left)/rect.width*100)+'%');plate.style.setProperty('--work-y',((event.clientY-rect.top)/rect.height*100)+'%');});
  }
})();
