/* ==========================================================================
   MAXIDE APEX — Core Client Infrastructure
   API Wrapper • Toast Notifications • Confirm Dialog • Resizers • Shortcuts
   ========================================================================== */

window.MaxUI = (function () {
  const api = {
    async request(url, options = {}) {
      const cfg = {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      };
      const res = await fetch(url, cfg);
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || `HTTP ${res.status} ${res.statusText}`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },
    get(url) { return this.request(url, { method: 'GET' }); },
    post(url, body) { return this.request(url, { method: 'POST', body: JSON.stringify(body || {}) }); },
    put(url, body) { return this.request(url, { method: 'PUT', body: JSON.stringify(body || {}) }); },
    del(url, body) {
      return this.request(url, {
        method: 'DELETE',
        body: body ? JSON.stringify(body) : undefined,
      });
    },
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(message, type = 'info', durationMs = 3600) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    const iconColors = {
      success: 'var(--status-success)',
      error: 'var(--status-error)',
      warning: 'var(--status-warning)',
      info: 'var(--accent-primary)',
    };
    const dot = `<span style="width:8px;height:8px;border-radius:50%;background:${iconColors[type] || iconColors.info};flex-shrink:0;"></span>`;
    el.innerHTML = `${dot}<span class="flex-1">${escapeHtml(message)}</span>`;
    stack.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'opacity 180ms ease, transform 180ms ease';
      setTimeout(() => el.remove(), 200);
    }, durationMs);
  }

  let confirmResolve = null;
  function confirmDialog({ title = 'Confirm Action', message = 'Are you sure?', confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      const modal = document.getElementById('modal-confirm');
      if (!modal) return resolve(window.confirm(message));
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      const btn = document.getElementById('confirm-accept-btn');
      btn.textContent = confirmLabel;
      btn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
      modal.classList.remove('hidden');
      btn.focus();
    });
  }

  function resolveConfirm(val) {
    const modal = document.getElementById('modal-confirm');
    if (modal) modal.classList.add('hidden');
    if (confirmResolve) {
      const fn = confirmResolve;
      confirmResolve = null;
      fn(Boolean(val));
    }
  }

  function formatRelativeTime(iso) {
    if (!iso) return 'Recently';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Recently';
    const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }

  function initResizers() {
    const leftResizer = document.getElementById('resizer-left');
    const rightResizer = document.getElementById('resizer-right');
    const bottomResizer = document.getElementById('resizer-bottom');
    const leftEl = document.getElementById('left-sidebar');
    const rightEl = document.getElementById('right-sidebar');
    const bottomEl = document.getElementById('bottom-panel');

    // Restore persisted workspace layout dimensions
    try {
      const saved = JSON.parse(localStorage.getItem('maxide_layout') || '{}');
      if (saved.leftW && leftEl) leftEl.style.width = `${saved.leftW}px`;
      if (saved.rightW && rightEl) rightEl.style.width = `${saved.rightW}px`;
      if (saved.bottomH && bottomEl) bottomEl.style.height = `${saved.bottomH}px`;
    } catch {}

    function saveLayout(patch) {
      try {
        const cur = JSON.parse(localStorage.getItem('maxide_layout') || '{}');
        localStorage.setItem('maxide_layout', JSON.stringify({ ...cur, ...patch }));
      } catch {}
    }

    function attachHorizontal(handle, targetEl, direction, minW, maxW, storageKey) {
      if (!handle || !targetEl) return;
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handle.classList.add('dragging');
        const startX = e.clientX;
        const startW = targetEl.getBoundingClientRect().width;
        document.body.style.cursor = 'col-resize';

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const next = Math.max(minW, Math.min(maxW, direction === 'left' ? startW + dx : startW - dx));
          targetEl.style.width = `${next}px`;
          if (window.monacoEditor) window.monacoEditor.layout();
        };
        const onUp = () => {
          handle.classList.remove('dragging');
          document.body.style.cursor = '';
          saveLayout({ [storageKey]: Math.round(targetEl.getBoundingClientRect().width) });
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    function attachVertical(handle, targetEl, minH, maxH) {
      if (!handle || !targetEl) return;
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handle.classList.add('dragging');
        const startY = e.clientY;
        const startH = targetEl.getBoundingClientRect().height;
        document.body.style.cursor = 'row-resize';

        const onMove = (ev) => {
          const dy = startY - ev.clientY;
          const next = Math.max(minH, Math.min(maxH, startH + dy));
          targetEl.style.height = `${next}px`;
          if (window.monacoEditor) window.monacoEditor.layout();
        };
        const onUp = () => {
          handle.classList.remove('dragging');
          document.body.style.cursor = '';
          saveLayout({ bottomH: Math.round(targetEl.getBoundingClientRect().height) });
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    attachHorizontal(leftResizer, leftEl, 'left', 180, 440, 'leftW');
    attachHorizontal(rightResizer, rightEl, 'right', 280, 560, 'rightW');
    attachVertical(bottomResizer, bottomEl, 110, Math.round(window.innerHeight * 0.55));
  }

  function showContextMenu(x, y, items) {
    const menu = document.getElementById('context-menu');
    if (!menu) return;
    menu.innerHTML = items.map((item, idx) => `
      <button class="context-menu-item ${item.danger ? 'danger' : ''}" data-ctx-idx="${idx}">
        <span>${escapeHtml(item.label)}</span>
      </button>
    `).join('');
    menu.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - items.length * 32 - 16)}px`;
    menu.classList.remove('hidden');

    menu.querySelectorAll('[data-ctx-idx]').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute('data-ctx-idx'));
        menu.classList.add('hidden');
        if (items[i] && items[i].action) items[i].action();
      };
    });
  }

  function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.classList.add('hidden');
  }

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('context-menu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) {
      hideContextMenu();
    }
  });

  function initTheme() {
    const saved = localStorage.getItem('maxide_theme') || 'dark';
    applyTheme(saved);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    localStorage.setItem('maxide_theme', theme === 'light' ? 'light' : 'dark');
    if (window.monaco && window.monaco.editor) {
      try {
        window.monaco.editor.setTheme(theme === 'light' ? 'vs' : 'maxide-apex-dark');
      } catch {}
    }
  }

  return {
    api,
    escapeHtml,
    toast,
    confirmDialog,
    resolveConfirm,
    formatRelativeTime,
    initResizers,
    showContextMenu,
    hideContextMenu,
    initTheme,
    applyTheme,
  };
})();
