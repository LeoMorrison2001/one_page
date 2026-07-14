/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="window-shell">
    <header class="titlebar">
      <div class="titlebar__drag-region"></div>
      <div class="titlebar__actions">
        <button class="window-button" type="button" data-action="minimize" aria-label="Minimize window">
          <i class="bi bi-dash-lg"></i>
        </button>
        <button class="window-button" type="button" data-action="toggle-maximize" aria-label="Maximize window">
          <i class="bi bi-square"></i>
        </button>
        <button class="window-button window-button--close" type="button" data-action="close" aria-label="Close window">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </header>
    <main class="workspace">
      <aside class="sidebar">
        <nav class="sidebar__nav" aria-label="Journal navigation">
          <button class="sidebar__item sidebar__item--active" type="button">
            <i class="bi bi-sun"></i>
            <span>今天</span>
          </button>
          <button class="sidebar__item" type="button">
            <i class="bi bi-calendar3"></i>
            <span>日历</span>
          </button>
          <button class="sidebar__item" type="button">
            <i class="bi bi-clock-history"></i>
            <span>时间线</span>
          </button>
          <button class="sidebar__item" type="button">
            <i class="bi bi-bookmark-heart"></i>
            <span>收藏</span>
          </button>
          <button class="sidebar__item" type="button">
            <i class="bi bi-tags"></i>
            <span>标签</span>
          </button>
          <button class="sidebar__item" type="button">
            <i class="bi bi-arrow-repeat"></i>
            <span>回顾</span>
          </button>
          <button class="sidebar__item" type="button">
            <i class="bi bi-gear"></i>
            <span>设置</span>
          </button>
        </nav>
      </aside>
      <section class="workspace__content" aria-hidden="true"></section>
    </main>
  </div>
`;

const maximizeButton = document.querySelector('[data-action="toggle-maximize"]');
const maximizeIcon = maximizeButton?.querySelector('i');

const updateMaximizeButton = (isMaximized) => {
  if (!maximizeButton || !maximizeIcon) {
    return;
  }

  maximizeButton.setAttribute(
    'aria-label',
    isMaximized ? 'Restore window' : 'Maximize window',
  );
  maximizeIcon.className = isMaximized ? 'bi bi-app' : 'bi bi-square';
};

document.querySelector('[data-action="minimize"]')?.addEventListener('click', () => {
  window.windowControls.minimize();
});

maximizeButton?.addEventListener('click', () => {
  window.windowControls.toggleMaximize();
});

document.querySelector('[data-action="close"]')?.addEventListener('click', () => {
  window.windowControls.close();
});

window.windowControls.isMaximized().then(updateMaximizeButton);
window.windowControls.onMaximizedChanged(updateMaximizeButton);
