// ============================================================
//  FileDrive Portal — main.js
//  Handles: live search, copy-link, toast, sort, size bars
// ============================================================

(function () {
  'use strict';

  /* ── Configuration ── */
  // URL Web App Google Apps Script yang mengambil daftar file dari Google Drive
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxuRTQ5RgEu6KZc_A-zhCSt_EBFAvu_17Q0-SCHRmGBUhrl8k5amDZ0LlDwlBfsfhgf/exec'; 

  /* ── File data ── */
  // Data ini akan diisi secara otomatis dari Google Drive
  let FILES = [];

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  /**
   * Build the download URL.
   * To completely bypass the Google Drive ">100MB Virus Scan" warning,
   * you must use the Cloudflare Worker. Ganti 'WORKER_URL_ANDA_DISINI'
   * dengan URL worker Anda setelah selesai dibuat.
   * 
   * @param {string} id  Google Drive file ID
   * @returns {string}
   */
  function driveUrl(id) {
    // CONTOH: const workerUrl = 'https://drive-bypass.bahrani.workers.dev';
    const workerUrl = ''; // Kosongkan jika belum ada worker

    if (workerUrl) {
      // Menggunakan Cloudflare Worker untuk bypass virus scan
      return `${workerUrl}/?id=${id}`;
    } else {
      // Bawaan Google Drive (akan muncul virus scan untuk file besar)
      return `https://drive.usercontent.google.com/download?id=${id}&export=download&authuser=0&confirm=t`;
    }
  }

  /**
   * Trigger a file download without opening a new tab.
   * Creates a hidden <a> element, clicks it programmatically,
   * then removes it — user stays on the current page and the
   * browser's native Save dialog appears directly.
   *
   * Exposed on window so inline onclick="triggerDownload(this)" works.
   * @param {HTMLElement} btn  The clicked download button
   */
  window.triggerDownload = function (btn) {
    const url = btn.dataset.url;
    const filename = btn.dataset.filename || '';

    // Visual feedback
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Starting…';
    btn.disabled = true;

    // Navigate current window to the download URL.
    // Google Drive responds with Content-Disposition: attachment so the
    // browser saves the file directly — no new tab, no redirect page.
    // (The hidden-anchor + a.download trick is blocked by browsers for
    //  cross-origin URLs due to CORS, so we use location.href instead.)
    window.location.href = url;

    // Restore button after a short delay (browser stays on same page)
    setTimeout(() => {
      btn.innerHTML = original;
      btn.disabled = false;
    }, 2000);
  };

  /**
   * Detect the type icon & CSS class from a file type key.
   * @param {string} type 'iso' | 'zip' | 'generic'
   * @returns {{ icon: string, cls: string, badgeCls: string }}
   */
  function typeInfo(type) {
    const map = {
      iso: { icon: '💿', cls: 'type-iso', badgeCls: 'iso' },
      zip: { icon: '📦', cls: 'type-zip', badgeCls: 'zip' },
      '7z': { icon: '🗜️', cls: 'type-archive', badgeCls: 'archive' },
    };
    return map[type] || { icon: '📄', cls: 'type-generic', badgeCls: '' };
  }

  /**
   * Compute a normalised bar width (%) for visual size comparison.
   * @param {number} sizeRaw GB value
   * @returns {number} 0-100
   */
  function barWidth(sizeRaw) {
    const max = Math.max(...FILES.map(f => f.sizeRaw));
    return Math.round((sizeRaw / max) * 100);
  }

  /* ── DOM Build ────────────────────────────────────────────────────────── */

  /**
   * Render a single file <tr> row.
   * @param {object} file
   * @returns {HTMLTableRowElement}
   */
  function renderRow(file) {
    const info = typeInfo(file.type);
    const url = driveUrl(file.driveId);
    const bw = barWidth(file.sizeRaw);

    const tr = document.createElement('tr');
    tr.classList.add('file-row');
    tr.dataset.name = file.name.toLowerCase();
    tr.id = file.id;

    tr.innerHTML = `
      <!-- Name cell -->
      <td data-label="File">
        <div class="file-name-cell">
          <div class="file-icon-wrap ${info.cls}">${info.icon}</div>
          <div class="file-info">
            <span class="file-name">${file.name}</span>
            <span class="file-desc">${file.desc}</span>
          </div>
        </div>
      </td>

      <!-- Size cell -->
      <td data-label="Size">
        <div class="file-size">${file.size}</div>
        <div class="size-bar-wrap">
          <div class="size-bar" style="width:${bw}%"></div>
        </div>
      </td>

      <!-- Type badge -->
      <td data-label="Type" class="col-type">
        ${info.badgeCls
        ? `<span class="type-badge ${info.badgeCls}">${file.type.toUpperCase()}</span>`
        : '—'}
      </td>

      <!-- Description (hidden on small screens via CSS) -->
      <td data-label="Description" class="col-desc" style="color:var(--text-secondary);font-size:0.85rem;">
        ${file.desc}
      </td>

      <!-- Actions -->
      <td data-label="Actions">
        <div class="actions-cell">
          <button
            class="btn-download"
            aria-label="Download ${file.name}"
            id="dl-${file.id}"
            data-url="${url}"
            data-filename="${file.name}"
            onclick="triggerDownload(this)"
          >
            <span class="btn-icon">⬇</span>
            Download
          </button>
          <button
            class="btn-copy"
            data-url="${url}"
            data-file="${file.name}"
            aria-label="Copy link for ${file.name}"
            id="copy-${file.id}"
          >
            🔗
            <span class="tooltip" aria-hidden="true">Copy link</span>
          </button>
        </div>
      </td>
    `;

    return tr;
  }

  /**
   * Populate the file table body with all files.
   */
  function populateTable() {
    const tbody = document.getElementById('file-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    FILES.forEach(file => tbody.appendChild(renderRow(file)));

    // Update stats
    updateStats();
    // Attach events
    attachCopyEvents();
  }

  /* ── Stats ────────────────────────────────────────────────────────────── */

  function updateStats() {
    const countEl = document.getElementById('stat-count');
    const sizeEl = document.getElementById('stat-size');
    if (countEl) countEl.textContent = FILES.length;
    if (sizeEl) {
      const totalGB = FILES.reduce((sum, f) => sum + f.sizeRaw, 0);
      sizeEl.textContent = totalGB >= 1
        ? totalGB.toFixed(2) + ' GB'
        : (totalGB * 1024).toFixed(0) + ' MB';
    }
  }

  /* ── Live Search ──────────────────────────────────────────────────────── */

  function initSearch() {
    const input = document.getElementById('search-input');
    const noResult = document.getElementById('no-results');
    if (!input) return;

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const rows = document.querySelectorAll('#file-table-body .file-row');
      let visible = 0;

      rows.forEach(row => {
        const match = row.dataset.name.includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });

      if (noResult) {
        noResult.style.display = visible === 0 ? 'block' : 'none';
      }
    });
  }

  /* ── Copy Link ────────────────────────────────────────────────────────── */

  function attachCopyEvents() {
    document.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const url = btn.dataset.url;
        const fileName = btn.dataset.file;
        const tooltip = btn.querySelector('.tooltip');

        try {
          await navigator.clipboard.writeText(url);
          btn.classList.add('copied');
          if (tooltip) tooltip.textContent = '✓ Copied!';
          showToast(`Link copied for <strong>${fileName}</strong>`);

          setTimeout(() => {
            btn.classList.remove('copied');
            if (tooltip) tooltip.textContent = 'Copy link';
          }, 2500);
        } catch (err) {
          // Fallback for browsers without clipboard API
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showToast(`Link copied for <strong>${fileName}</strong>`);
        }
      });
    });
  }

  /* ── Toast ────────────────────────────────────────────────────────────── */

  let toastTimer = null;

  /**
   * Display a bottom-right toast notification.
   * @param {string} html  Inner HTML of the message
   */
  function showToast(html) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<span>✅</span><span>${html}</span>`;

    // Clear previous timer
    if (toastTimer) clearTimeout(toastTimer);
    toast.classList.add('show');

    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  /* ── Sortable Column Headers ──────────────────────────────────────────── */

  let sortState = { col: null, dir: 1 }; // dir: 1=asc, -1=desc

  function initSort() {
    const headers = document.querySelectorAll('[data-sort]');
    headers.forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        sortState.dir = sortState.col === col ? sortState.dir * -1 : 1;
        sortState.col = col;

        // Update icons
        headers.forEach(h => {
          const icon = h.querySelector('.sort-icon');
          if (icon) icon.textContent = h.dataset.sort === col
            ? (sortState.dir === 1 ? '↑' : '↓')
            : '⇅';
        });

        sortFiles(col, sortState.dir);
      });
    });
  }

  function sortFiles(col, dir) {
    const tbody = document.getElementById('file-table-body');
    if (!tbody) return;

    const rows = [...tbody.querySelectorAll('.file-row')];

    rows.sort((a, b) => {
      let va, vb;
      if (col === 'name') {
        va = a.dataset.name;
        vb = b.dataset.name;
      } else if (col === 'size') {
        // Read from FILES array by row id
        const fa = FILES.find(f => f.id === a.id);
        const fb = FILES.find(f => f.id === b.id);
        va = fa ? fa.sizeRaw : 0;
        vb = fb ? fb.sizeRaw : 0;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    rows.forEach(r => tbody.appendChild(r));
  }

  /* ── Keyboard shortcut: Ctrl+F / Cmd+F → focus search ─────────────────── */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      const input = document.getElementById('search-input');
      if (input) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    }
  });

  /* ── Init ─────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    initSearch();
    initSort();

    const tbody = document.getElementById('file-table-body');

    if (!APPS_SCRIPT_URL) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">⚠️ URL Web App belum diatur di <code>main.js</code></td></tr>';
      }
      return;
    }

    try {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);"><span class="btn-icon">⏳</span> Sedang membaca Google Drive Anda...</td></tr>';
      }

      const response = await fetch(APPS_SCRIPT_URL);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      
      FILES = data.files || [];
      populateTable();
    } catch (error) {
      console.error('Error fetching files:', error);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:#ff5555;">❌ Gagal mengambil data file. Pastikan URL Web App benar dan dapat diakses publik.</td></tr>';
      }
    }
  });

})();
