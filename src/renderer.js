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

const formatEntryDate = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const todayPage = () => {
  const openedAt = new Date();
  return `
  <article class="journal-page" data-entry-date="${formatEntryDate(openedAt)}" data-captured-at="${openedAt.toISOString()}">
    <header class="journal-page__header">
      <div><p class="journal-page__eyebrow">今天的日记</p><h1 class="journal-page__date" data-journal-date>${formatToday(openedAt)}</h1></div>
      <div class="journal-page__status" aria-live="polite"><i class="bi bi-cloud-check"></i><span data-save-status>未保存</span></div>
    </header>
    <div class="journal-meta" aria-label="日记信息">
      <button class="journal-meta__item" type="button" data-weather-button aria-label="重新获取天气"><i class="bi bi-cloud-sun"></i><span data-weather-status>正在获取天气</span></button>
      <button class="journal-meta__item" type="button" data-location-button aria-label="重新获取位置"><i class="bi bi-geo-alt"></i><span data-location-status>正在获取位置</span></button>
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
};

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
  const weatherButton = document.querySelector('[data-weather-button]');
  const locationButton = document.querySelector('[data-location-button]');
  const weatherStatus = document.querySelector('[data-weather-status]');
  const locationStatus = document.querySelector('[data-location-status]');
  const journalPage = document.querySelector('.journal-page');
  const journalDate = document.querySelector('[data-journal-date]');
  const entryDate = journalPage?.dataset.entryDate;
  let saveTimer;
  let slashRange = null;
  let contextRequestInFlight = false;
  let isRestoring = false;
  let contextFrozen = false;
  let contextResolved = false;

  const buildMetadata = () => ({
    capturedAt: journalPage?.dataset.capturedAt,
    weatherText: weatherStatus?.textContent ?? '',
    locationText: locationStatus?.textContent ?? '',
    contextReady: contextResolved,
  });

  const applyMetadata = (metadata) => {
    if (!metadata?.capturedAt) return false;
    const capturedAt = new Date(metadata.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) return false;
    journalPage.dataset.capturedAt = capturedAt.toISOString();
    if (journalDate) journalDate.textContent = formatToday(capturedAt);
    if (!metadata.contextReady) return false;
    setContextStatus(weatherStatus, metadata.weatherText || '未获取天气', 'success');
    setContextStatus(locationStatus, metadata.locationText || '当前位置', 'success');
    weatherButton?.setAttribute('disabled', '');
    locationButton?.setAttribute('disabled', '');
    contextFrozen = true;
    contextResolved = true;
    return true;
  };

  window.journalStore.status().then(({ available, error }) => {
    if (available) return;
    console.error('Journal storage is unavailable', error);
    if (saveStatus) saveStatus.textContent = `存储不可用：${error || '初始化失败'}`;
  });

  const weatherLabels = {
    0: '晴',
    1: '大部晴朗',
    2: '多云',
    3: '阴',
    45: '有雾',
    48: '雾凇',
    51: '毛毛雨',
    53: '毛毛雨',
    55: '毛毛雨',
    56: '冻毛毛雨',
    57: '冻毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '冰粒',
    80: '阵雨',
    81: '阵雨',
    82: '强阵雨',
    85: '阵雪',
    86: '强阵雪',
    95: '雷暴',
    96: '冰雹雷暴',
    99: '强冰雹雷暴',
  };

  const setContextStatus = (element, text, state = 'idle') => {
    if (!element) return;
    element.textContent = text;
    element.closest('.journal-meta__item')?.setAttribute('data-state', state);
  };

  const getPosition = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 15 * 60 * 1000,
    });
  });

  const getWeather = async ({ latitude, longitude }) => {
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,apparent_temperature,weather_code',
      timezone: 'auto',
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
    if (!response.ok) throw new Error('weather-request-failed');
    const data = await response.json();
    if (!data.current) throw new Error('weather-data-missing');
    return data.current;
  };

  const getLocationName = async ({ latitude, longitude }) => {
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: 'zh',
    });
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${query}`);
    if (!response.ok) throw new Error('location-request-failed');
    const data = await response.json();
    const parts = [data.locality, data.city].filter((value, index, values) => (
      value && values.indexOf(value) === index
    ));
    if (parts.length === 0) throw new Error('location-data-missing');
    return parts.join(' · ');
  };

  const getLocationErrorLabel = (error) => {
    if (error?.code === 1) return '未授权位置';
    if (error?.code === 2) return '无法确定位置';
    if (error?.code === 3) return '定位超时';
    return '系统定位不可用';
  };

  const refreshJournalContext = async () => {
    if (contextRequestInFlight || contextFrozen) return;
    contextRequestInFlight = true;
    weatherButton?.setAttribute('aria-busy', 'true');
    locationButton?.setAttribute('aria-busy', 'true');
    setContextStatus(locationStatus, '正在获取位置', 'loading');
    setContextStatus(weatherStatus, '正在获取天气', 'loading');

    let position;
    try {
      position = await getPosition();
      // Precise coordinates are intentionally only used for this request and
      // are not written into the journal preview or the editor document.
      setContextStatus(locationStatus, '正在获取地点', 'loading');
    } catch (error) {
      setContextStatus(locationStatus, getLocationErrorLabel(error), 'error');
      setContextStatus(weatherStatus, '未获取天气', 'error');
      contextRequestInFlight = false;
      contextResolved = true;
      weatherButton?.removeAttribute('aria-busy');
      locationButton?.removeAttribute('aria-busy');
      scheduleSave();
      return;
    }

    const [weatherResult, locationResult] = await Promise.allSettled([
      getWeather(position.coords),
      getLocationName(position.coords),
    ]);

    if (weatherResult.status === 'fulfilled') {
      const weather = weatherResult.value;
      const temperature = Math.round(weather.temperature_2m);
      const label = weatherLabels[weather.weather_code] ?? '天气未知';
      setContextStatus(weatherStatus, `${label} · ${temperature}°C`, 'success');
    } else {
      setContextStatus(weatherStatus, '未获取天气', 'error');
    }

    if (locationResult.status === 'fulfilled') {
      setContextStatus(locationStatus, locationResult.value, 'success');
    } else {
      setContextStatus(locationStatus, '当前位置', 'success');
    }

    contextRequestInFlight = false;
    contextResolved = true;
    weatherButton?.removeAttribute('aria-busy');
    locationButton?.removeAttribute('aria-busy');
    scheduleSave();
  };

  const hasMeaningfulContent = (node) => {
    if (!node) return false;
    if (node.type === 'image' || node.type === 'video') return true;
    if (node.type === 'text' && node.text?.trim()) return true;
    return node.content?.some(hasMeaningfulContent) ?? false;
  };

  const updateWordCount = () => {
    if (!liveEditor) return;
    if (wordCount) wordCount.textContent = `${liveEditor.getText().trim().length} 字`;
  };

  const saveJournal = async () => {
    if (!liveEditor || !entryDate) return;
    const content = liveEditor.getJSON();
    if (!hasMeaningfulContent(content)) {
      await window.journalStore.remove(entryDate);
      if (saveStatus) saveStatus.textContent = '未保存';
      return;
    }

    if (saveStatus) saveStatus.textContent = '正在保存';
    try {
      await window.journalStore.save({
        entryDate,
        content,
        plainText: liveEditor.getText().trim(),
        metadata: buildMetadata(),
      });
      if (saveStatus) saveStatus.textContent = '已自动保存';
    } catch (error) {
      console.error('Failed to save journal', error);
      if (saveStatus) saveStatus.textContent = '保存失败';
    }
  };

  const scheduleSave = () => {
    if (!liveEditor || isRestoring) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveJournal, 650);
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

  const insertMedia = async (file) => {
    if (!file || !liveEditor) return;
    if (!entryDate) return;
    try {
      if (saveStatus) saveStatus.textContent = '正在导入媒体';
      const media = await window.journalStore.importMedia({
        entryDate,
        fileName: file.name,
        mimeType: file.type,
        bytes: await file.arrayBuffer(),
      });
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      const chain = liveEditor.chain().focus();
      if (slashRange) chain.deleteRange(slashRange);
      chain.insertContent({ type, attrs: { src: media.src } }).createParagraphNear().run();
      hideSlashMenu();
    } catch (error) {
      console.error('Failed to import media', error);
      if (saveStatus) saveStatus.textContent = '媒体导入失败';
    }
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
    onCreate: updateWordCount,
    onUpdate: () => {
      updateWordCount();
      scheduleSave();
      syncSlashMenu();
    },
    onSelectionUpdate: syncSlashMenu,
  });

  const editorForPage = liveEditor;
  window.journalStore.load(entryDate).then((entry) => {
    if (!entry || liveEditor !== editorForPage) {
      if (saveStatus && !entry) saveStatus.textContent = '未保存';
      refreshJournalContext();
      return;
    }
    isRestoring = true;
    editorForPage.commands.setContent(entry.content);
    isRestoring = false;
    updateWordCount();
    if (!applyMetadata(entry.metadata)) refreshJournalContext();
    if (saveStatus) saveStatus.textContent = '已自动保存';
  }).catch((error) => {
    console.error('Failed to load journal', error);
    if (saveStatus) saveStatus.textContent = '读取失败';
    refreshJournalContext();
  });

  document.querySelectorAll('[data-slash-action]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => document.querySelector(`[data-media-picker="${button.dataset.slashAction}"]`)?.click());
  });
  document.querySelectorAll('[data-media-picker]').forEach((picker) => picker.addEventListener('change', async () => {
    await insertMedia(picker.files?.[0]);
    picker.value = '';
  }));
  weatherButton?.addEventListener('click', refreshJournalContext);
  locationButton?.addEventListener('click', refreshJournalContext);
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
