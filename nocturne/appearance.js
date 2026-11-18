(() => { try { const saved=localStorage.getItem('nocturne-theme'); if(saved==='light'||saved==='dark') document.documentElement.dataset.theme=saved; } catch {} })();
