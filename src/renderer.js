import { Editor, Node, mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import './index.css';

const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'video[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes, { controls: 'true' })];
  },
});

const menus = [
  { key: 'today', label: '今天', icon: 'bi bi-sun' },
  { key: 'calendar', label: '日历', icon: 'bi bi-calendar3' },
  { key: 'timeline', label: '时间线', icon: 'bi bi-clock-history' },
  { key: 'favorites', label: '收藏', icon: 'bi bi-bookmark-heart' },
  { key: 'tags', label: '标签', icon: 'bi bi-tags' },
  { key: 'review', label: '回顾', icon: 'bi bi-arrow-repeat' },
  { key: 'settings', label: '设置', icon: 'bi bi-gear' },
];

const formatToday = (date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${weekdays[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const todayPage = () => `
  <article class="journal-page">
    <header class="journal-page__header">
      <div><p class="journal-page__eyebrow">今天的日记</p><h1 class="journal-page__date">${formatToday(new Date())}</h1></div>
      <div class="journal-page__status" aria-live="polite"><i class="bi bi-cloud-check"></i><span data-save-status>未保存</span></div>
    </header>
    <div class="journal-meta" aria-label="日记信息">
      <button class="journal-meta__item" type="button"><i class="bi bi-cloud-sun"></i><span>正在获取天气</span></button>
      <button class="journal-meta__item" type="button"><i class="bi bi-geo-alt"></i><span>正在获取位置</span></button>
    </div>
    <section class="journal-editor" aria-label="日记正文">
      <div class="journal-editor__content notion-editor-shell">
        <div class="notion-editor" data-tiptap-editor></div>
        <div class="slash-menu" data-slash-menu hidden>
          <button type="button" data-slash-action="image"><i class="bi bi-image"></i><span><strong>图片</strong></span></button>
          <button type="button" data-slash-action="video"><i class="bi bi-camera-video"></i><span><strong>视频</strong></span></button>
        </div>
      </div>
      <footer class="journal-editor__footer"><span><i class="bi bi-lightning-charge"></i> 会在停止输入后自动保存</span><span data-word-count>0 字</span></footer>
    </section>
    <input class="media-picker" type="file" data-media-picker="image" accept="image/*">
    <input class="media-picker" type="file" data-media-picker="video" accept="video/*">
  </article>
`;

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="window-shell">
    <header class="titlebar"><div class="titlebar__drag-region"></div><div class="titlebar__actions">
      <button class="window-button" type="button" data-action="minimize" aria-label="最小化窗口"><i class="bi bi-dash-lg"></i></button>
      <button class="window-button" type="button" data-action="toggle-maximize" aria-label="最大化窗口"><i class="bi bi-square"></i></button>
      <button class="window-button window-button--close" type="button" data-action="close" aria-label="关闭窗口"><i class="bi bi-x-lg"></i></button>
    </div></header>
    <main class="workspace"><aside class="sidebar"><nav class="sidebar__nav" aria-label="日记导航">
      ${menus.map((menu, index) => `<button class="sidebar__item${index === 0 ? ' sidebar__item--active' : ''}" type="button" data-menu-key="${menu.key}" aria-current="${index === 0 ? 'page' : 'false'}"><i class="${menu.icon}"></i><span>${menu.label}</span></button>`).join('')}
    </nav></aside><section class="workspace__content">${todayPage()}</section></main>
  </div>
`;

const maximizeButton = document.querySelector('[data-action="toggle-maximize"]');
const maximizeIcon = maximizeButton?.querySelector('i');
const menuButtons = document.querySelectorAll('[data-menu-key]');
const workspaceContent = document.querySelector('.workspace__content');
let liveEditor = null;

const updateMaximizeButton = (isMaximized) => {
  if (!maximizeButton || !maximizeIcon) return;
  maximizeButton.setAttribute('aria-label', isMaximized ? '还原窗口' : '最大化窗口');
  maximizeIcon.className = isMaximized ? 'bi bi-app' : 'bi bi-square';
};

const bindTodayPage = () => {
  const element = document.querySelector('[data-tiptap-editor]');
  const shell = document.querySelector('.notion-editor-shell');
  const slashMenu = document.querySelector('[data-slash-menu]');
  const saveStatus = document.querySelector('[data-save-status]');
  const wordCount = document.querySelector('[data-word-count]');
  let saveTimer;
  let slashRange = null;

  const updateStatus = () => {
    if (!liveEditor) return;
    if (wordCount) wordCount.textContent = `${liveEditor.getText().trim().length} 字`;
    if (saveStatus) saveStatus.textContent = '正在保存';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (saveStatus) saveStatus.textContent = '已自动保存 · 本次预览';
    }, 800);
  };

  const hideSlashMenu = () => {
    slashMenu.hidden = true;
    slashRange = null;
  };

  const syncSlashMenu = () => {
    if (!liveEditor) return;
    const { $from } = liveEditor.state.selection;
    if ($from.parent.type.name !== 'paragraph' || $from.parent.textContent !== '/') {
      hideSlashMenu();
      return;
    }
    const caret = liveEditor.view.coordsAtPos(liveEditor.state.selection.from);
    const shellBox = shell.getBoundingClientRect();
    slashMenu.style.left = `${caret.left - shellBox.left}px`;
    slashMenu.style.top = `${caret.bottom - shellBox.top + 6}px`;
    slashMenu.hidden = false;
    slashRange = { from: $from.start(), to: $from.end() };
  };

  const insertMedia = (file) => {
    if (!file || !liveEditor) return;
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const src = URL.createObjectURL(file);
    const chain = liveEditor.chain().focus();
    if (slashRange) chain.deleteRange(slashRange);
    chain.insertContent({ type, attrs: { src } }).createParagraphNear().run();
    hideSlashMenu();
  };

  liveEditor = new Editor({
    element,
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Video,
      Placeholder.configure({ placeholder: '从这里开始记录今天吧…' }),
    ],
    editorProps: {
      attributes: { class: 'ProseMirror', 'aria-label': '日记正文' },
    },
    onCreate: updateStatus,
    onUpdate: () => {
      updateStatus();
      syncSlashMenu();
    },
    onSelectionUpdate: syncSlashMenu,
  });

  document.querySelectorAll('[data-slash-action]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => document.querySelector(`[data-media-picker="${button.dataset.slashAction}"]`)?.click());
  });
  document.querySelectorAll('[data-media-picker]').forEach((picker) => picker.addEventListener('change', () => {
    insertMedia(picker.files?.[0]);
    picker.value = '';
  }));
};

const setActiveMenu = (menuKey) => {
  const menu = menus.find((item) => item.key === menuKey);
  if (!menu || !workspaceContent) return;
  liveEditor?.destroy();
  liveEditor = null;
  workspaceContent.innerHTML = menuKey === 'today' ? todayPage() : `<div class="page-view"><h1 class="page-view__title">${menu.label}</h1></div>`;
  if (menuKey === 'today') bindTodayPage();
  menuButtons.forEach((button) => {
    const active = button.dataset.menuKey === menuKey;
    button.classList.toggle('sidebar__item--active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
};

document.querySelector('[data-action="minimize"]')?.addEventListener('click', () => window.windowControls.minimize());
maximizeButton?.addEventListener('click', () => window.windowControls.toggleMaximize());
document.querySelector('[data-action="close"]')?.addEventListener('click', () => window.windowControls.close());
menuButtons.forEach((button) => button.addEventListener('click', () => setActiveMenu(button.dataset.menuKey)));
bindTodayPage();
window.windowControls.isMaximized().then(updateMaximizeButton);
window.windowControls.onMaximizedChanged(updateMaximizeButton);
