/* NontonGratisan - komentar offline queue
   Tambahkan <script src="/comments-offline.js"></script> sebelum </body> di index.html.
*/
(function () {
  'use strict';

  const API = 'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';
  const QUEUE_KEY = 'nontonGratisan_comments_queue_v1';
  const originalRenderComments = window.renderComments;

  function getQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY) || '[]';
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }

  function saveQueue(queue) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) {}
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    })[c]);
  }

  function pendingFor(mediaId) {
    return getQueue().filter(x => String(x.mediaId) === String(mediaId));
  }

  function drawPending(mediaId) {
    const list = document.getElementById('comments-list');
    if (!list) return;
    const pending = pendingFor(mediaId);
    if (!pending.length) return;

    const html = pending.map(c => {
      const name = esc(c.name || 'Anonim');
      const text = esc(c.text || '');
      const initial = esc((c.name || 'A').charAt(0).toUpperCase());
      return `<div class="comment-item flex gap-2 sm:gap-3 items-start p-2 rounded-lg border border-brand-500/30 bg-brand-500/5"><div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs sm:text-sm font-bold text-brand-500 shrink-0">${initial}</div><div class="space-y-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="text-xs sm:text-sm font-bold text-white">${name}</span><span class="text-[10px] text-zinc-500">baru saja</span><span class="text-[10px] text-brand-400">Menunggu sinkronisasi</span></div><p class="text-xs sm:text-sm text-zinc-300 break-words">${text}</p></div></div>`;
    }).join('');

    if (list.innerHTML.includes('Belum ada komentar')) list.innerHTML = html;
    else list.insertAdjacentHTML('beforeend', html);
  }

  async function send(item) {
    if (navigator.onLine === false) return false;
    try {
      await fetch(API, {
        method: 'POST',
        mode: 'no-cors',
        body: new URLSearchParams({
          action: 'add',
          mediaId: String(item.mediaId),
          title: String(item.title || ''),
          name: String(item.name || 'Anonim'),
          text: String(item.text || ''),
          clientId: String(item.clientId || '')
        }),
        keepalive: true
      });
      return true;
    } catch (e) { return false; }
  }

  let syncing = false;
  async function sync() {
    if (syncing || navigator.onLine === false) return;
    const queue = getQueue();
    if (!queue.length) return;
    syncing = true;
    try {
      for (const item of queue) {
        if (!(await send(item))) break;
        saveQueue(getQueue().filter(x => x.clientId !== item.clientId));
      }
    } finally {
      syncing = false;
      const media = (typeof store !== 'undefined' ? store.getState().currentMedia : null);
      if (media) drawPending(media.id);
    }
  }

  window.submitComment = function () {
    const media = (typeof store !== 'undefined' ? store.getState().currentMedia : null);
    if (!media) return;
    const nameInput = document.getElementById('comment-name');
    const textInput = document.getElementById('comment-text');
    const name = nameInput?.value.trim() || 'Anonim';
    const text = textInput?.value.trim() || '';
    if (!text) {
      if (typeof showToast === 'function') showToast('Tulis komentar terlebih dahulu', '⚠️');
      textInput?.focus();
      return;
    }

    const item = {
      clientId: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      mediaId: String(media.id),
      title: String(media.title || ''),
      name,
      text,
      createdAt: Date.now()
    };

    const queue = getQueue();
    queue.push(item);
    saveQueue(queue);

    if (nameInput) nameInput.value = '';
    if (textInput) textInput.value = '';
    drawPending(media.id);

    if (navigator.onLine === false) {
      if (typeof showToast === 'function') showToast('Komentar tersimpan. Akan dikirim saat online.', '📥');
    } else {
      if (typeof showToast === 'function') showToast('Komentar tersimpan, sedang dikirim...', '💬');
      sync();
    }
  };

  if (typeof originalRenderComments === 'function') {
    window.renderComments = function (mediaId) {
      originalRenderComments(mediaId);
      setTimeout(() => drawPending(mediaId), 100);
      setTimeout(sync, 250);
    };
  }

  window.addEventListener('online', sync);
  window.addEventListener('offline', function () {
    const media = (typeof store !== 'undefined' ? store.getState().currentMedia : null);
    if (media) drawPending(media.id);
  });

  setTimeout(sync, 1000);
})();
