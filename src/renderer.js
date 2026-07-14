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

const menus = [
  { key: 'today', label: '\u4eca\u5929', icon: 'bi bi-sun' },
  { key: 'calendar', label: '\u65e5\u5386', icon: 'bi bi-calendar3' },
  { key: 'timeline', label: '\u65f6\u95f4\u7ebf', icon: 'bi bi-clock-history' },
  { key: 'favorites', label: '\u6536\u85cf', icon: 'bi bi-bookmark-heart' },
  { key: 'tags', label: '\u6807\u7b7e', icon: 'bi bi-tags' },
  { key: 'review', label: '\u56de\u987e', icon: 'bi bi-arrow-repeat' },
  { key: 'settings', label: '\u8bbe\u7f6e', icon: 'bi bi-gear' },
];

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
          ${menus
            .map(
              (menu, index) => `
                <button
                  class="sidebar__item${index === 0 ? ' sidebar__item--active' : ''}"
                  type="button"
                  data-menu-key="${menu.key}"
                  aria-current="${index === 0 ? 'page' : 'false'}"
                >
                  <i class="${menu.icon}"></i>
                  <span>${menu.label}</span>
                </button>
              `,
            )
            .join('')}
        </nav>
      </aside>
      <section class="workspace__content">
        <div class="page-view">
          <h1 class="page-view__title">${menus[0].label}</h1>
        </div>
      </section>
    </main>
  </div>
`;

const maximizeButton = document.querySelector('[data-action="toggle-maximize"]');
const maximizeIcon = maximizeButton?.querySelector('i');
const menuButtons = document.querySelectorAll('[data-menu-key]');
const pageTitle = document.querySelector('.page-view__title');

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

const setActiveMenu = (menuKey) => {
  const currentMenu = menus.find((menu) => menu.key === menuKey);

  if (!currentMenu || !pageTitle) {
    return;
  }

  pageTitle.textContent = currentMenu.label;

  menuButtons.forEach((button) => {
    const isActive = button.dataset.menuKey === menuKey;
    button.classList.toggle('sidebar__item--active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
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

menuButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveMenu(button.dataset.menuKey);
  });
});

window.windowControls.isMaximized().then(updateMaximizeButton);
window.windowControls.onMaximizedChanged(updateMaximizeButton);
