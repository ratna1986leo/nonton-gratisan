/* NontonGratisan comments enhancer — replies, likes, spoiler, pagination, sorting (local UI layer). */
(() => {
  'use strict';
  const STORAGE = 'ng_comments_ui_v1';
  const PAGE_SIZE = 5;
  const read = () => { try { const v = JSON.parse(localStorage.getItem(STORAGE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
  const write = v => { try { localStorage.setItem(STORAGE, JSON.stringify(v)); } catch (_) {} };
  const state = { mediaId: '', comments: [], page: 1, sort: 'newest', busy: false };
  const esc = s => typeof escapeHtml === 'function' ? escapeHtml(s) : String(s || '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  const media = () => { try { return String(store?.getState?.().currentMedia?.id || ''); } catch (_) { return ''; } };
  const keyFor = c => btoa(unescape(encodeURIComponent(`${c.name}|${c.text}|${c.date}`))).replace(/[^a-z0-9]/gi,'').slice(0,32);
  const db = () => { const all = read(); const k = media(); all[k] ||= {}; all[k].likes ||= {}; all[k].spoilers ||= {}; all[k].replies ||= {}; return { all, data: all[k] }; };
  function capture() {
    const list = document.getElementById('comments-list'); if (!list) return;
    const currentMedia = media();
    // Saat pindah film, buang cache komentar film sebelumnya.
    // Tanpa ini komentar dari film A bisa ikut tampil di film B.
    if (state.mediaId !== currentMedia) {
      state.mediaId = currentMedia;
      state.comments = [];
      state.page = 1;
    }
    const nodes = [...list.querySelectorAll('.comment-item')].filter(n => !n.dataset.uiEnhanced && !n.textContent.includes('Menunggu sinkronisasi'));
    if (!nodes.length) return;
    const existing = new Map(state.comments.map(c => [c.key, c]));
    nodes.forEach(n => {
      const spans = [...n.querySelectorAll('span')];
      const name = spans[0]?.textContent?.trim() || 'Anonim';
      const date = spans[1]?.textContent?.trim() || '';
      const text = n.querySelector('p')?.textContent?.trim() || '';
      if (!text) return;
      const reply = n.querySelector('.mt-2.ml-1 p')?.textContent?.trim() || '';
      const c = { key: keyFor({ name, text, date }), name, date, text, reply };
      existing.set(c.key, c);
    });
    state.comments = [...existing.values()];
    state.mediaId = currentMedia;
    render();
  }
  function ensureToolbar() {
    const list = document.getElementById('comments-list'); if (!list || document.getElementById('ng-comments-toolbar')) return;
    const wrap = list.parentElement; if (!wrap) return;
    const bar = document.createElement('div'); bar.id='ng-comments-toolbar'; bar.className='flex flex-wrap items-center justify-between gap-2 mb-2';
    bar.innerHTML = `<div class="flex gap-2"><button type="button" data-sort="newest" class="ng-sort px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-white">Terbaru</button><button type="button" data-sort="popular" class="ng-sort px-3 py-1.5 rounded-lg bg-zinc-950 text-xs text-zinc-400 border border-zinc-800">Populer</button></div><span class="text-[10px] text-zinc-500" id="ng-comments-count"></span>`;
    list.before(bar);
    bar.querySelectorAll('.ng-sort').forEach(b => b.addEventListener('click', () => { state.sort=b.dataset.sort; state.page=1; render(); }));
  }
  function commentCard(c, meta) {
    const likes = meta.likes[c.key] || 0, spoiler = !!meta.spoilers[c.key], replies = meta.replies[c.key] || [];
    const serverReply = c.reply ? `<div class="mt-2 ml-1 p-2 rounded-lg border border-zinc-700 bg-zinc-900/70"><div class="text-[10px] font-bold text-brand-400">🤖 NOVA</div><div class="text-xs sm:text-sm text-zinc-300 break-words mt-1">${esc(c.reply)}</div></div>` : '';
    return `<div class="comment-item ng-enhanced-card flex gap-2 sm:gap-3 items-start p-2 rounded-lg border border-transparent hover:border-zinc-800" data-ui-enhanced="1">
      <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs sm:text-sm font-bold text-brand-500 shrink-0">${esc((c.name||'A').charAt(0).toUpperCase())}</div>
      <div class="space-y-1 min-w-0 flex-1"><div class="flex items-center gap-2 flex-wrap"><span class="text-xs sm:text-sm font-bold text-white">${esc(c.name)}</span><span class="text-[10px] text-zinc-500">${esc(c.date)}</span></div>
      <div class="ng-comment-body ${spoiler?'blur-md select-none cursor-pointer':''}" data-spoiler="${spoiler?'1':'0'}" title="${spoiler?'Klik untuk tampilkan':' '}" style="transition:filter .2s">${esc(c.text)}</div>
      ${serverReply}
      <div class="flex flex-wrap items-center gap-2 pt-1"><button data-like="${esc(c.key)}" class="text-[10px] text-zinc-400 hover:text-white">👍 ${likes}</button><button data-reply="${esc(c.key)}" class="text-[10px] text-zinc-400 hover:text-white">↩️ Reply</button><button data-spoiler="${esc(c.key)}" class="text-[10px] text-zinc-400 hover:text-white">${spoiler?'👁️ Tampilkan':'⚠️ Spoiler'}</button></div>
      ${replies.map(r=>`<div class="ml-4 sm:ml-6 mt-2 pl-3 border-l border-zinc-800"><div class="text-[10px] font-bold text-zinc-300">${esc(r.name)} <span class="font-normal text-zinc-600">• ${esc(r.date)}</span></div><div class="text-[11px] text-zinc-400 mt-0.5">${esc(r.text)}</div></div>`).join('')}
      <div data-replybox="${esc(c.key)}" class="hidden mt-2 flex gap-2"><input class="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] text-white" placeholder="Balas komentar..."><button class="px-3 py-2 rounded-lg bg-brand-500 text-white text-[11px] font-bold">Kirim</button></div>
      </div></div>`;
  }
  function render() {
    const list = document.getElementById('comments-list'); if(!list) return;
    if (!state.mediaId) state.mediaId = media();
    const ctx=db(); const comments=[...state.comments];
    comments.sort((a,b) => state.sort==='popular' ? (ctx.data.likes[b.key]||0)-(ctx.data.likes[a.key]||0) : 0);
    const total=comments.length, pages=Math.max(1,Math.ceil(total/PAGE_SIZE)); if(state.page>pages) state.page=pages;
    const slice=comments.slice((state.page-1)*PAGE_SIZE,state.page*PAGE_SIZE);
    list.innerHTML = slice.length ? slice.map(c=>commentCard(c,ctx.data)).join('') : `<p class="text-xs sm:text-sm text-zinc-500">Belum ada komentar. Jadilah yang pertama!</p>`;
    const bar=document.getElementById('ng-comments-toolbar'); if(bar){ bar.querySelector('#ng-comments-count').textContent=total?`${total} komentar`:''; bar.querySelectorAll('.ng-sort').forEach(b=>{const on=b.dataset.sort===state.sort;b.className=`ng-sort px-3 py-1.5 rounded-lg text-xs ${on?'bg-zinc-800 text-white':'bg-zinc-950 text-zinc-400 border border-zinc-800'}`;}); }
    let pager=document.getElementById('ng-comments-pager'); if(!pager){ pager=document.createElement('div'); pager.id='ng-comments-pager'; list.after(pager); }
    pager.className='flex items-center justify-center gap-2 pt-2'; pager.innerHTML=pages>1?`<button data-prev class="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">‹</button><span class="text-[10px] text-zinc-500">${state.page}/${pages}</span><button data-next class="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">›</button>`:'';
    pager.querySelector('[data-prev]')?.addEventListener('click',()=>{state.page=Math.max(1,state.page-1);render();}); pager.querySelector('[data-next]')?.addEventListener('click',()=>{state.page=Math.min(pages,state.page+1);render();});
    list.querySelectorAll('[data-like]').forEach(b=>b.addEventListener('click',()=>{ctx.data.likes[b.dataset.like]=(ctx.data.likes[b.dataset.like]||0)+1;write(ctx.all);render();}));
    list.querySelectorAll('.ng-comment-body').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.spoiler==='1') b.classList.toggle('blur-md');}));
    list.querySelectorAll('[data-spoiler]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.spoiler;if(!k)return;ctx.data.spoilers[k]=!ctx.data.spoilers[k];write(ctx.all);render();}));
    list.querySelectorAll('[data-reply]').forEach(b=>b.addEventListener('click',()=>{list.querySelector(`[data-replybox="${CSS.escape(b.dataset.reply)}"]`)?.classList.toggle('hidden');}));
    list.querySelectorAll('[data-replybox] button').forEach(b=>b.addEventListener('click',()=>{const box=b.parentElement,k=box.dataset.replybox,input=box.querySelector('input'),text=input.value.trim();if(!text)return;const arr=ctx.data.replies[k] ||= [];arr.push({name:(document.getElementById('comment-name')?.value||'Anonim').trim()||'Anonim',text,date:'baru saja'});write(ctx.all);render();}));
  }
  function init() {
    const list=document.getElementById('comments-list'); if(!list) return;
    state.mediaId=media(); ensureToolbar(); capture();
    const observer=new MutationObserver(()=>{if(state.busy)return;const raw=list.querySelectorAll('.comment-item:not([data-ui-enhanced])');if(raw.length){state.busy=true;capture();state.busy=false;}}); observer.observe(list,{childList:true,subtree:true});
    try { window.NontonGratisanComments={refresh:()=>{state.comments=[];capture();},getState:()=>read()}; } catch (_) {}
  }
  const boot=()=>setTimeout(init,400);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
