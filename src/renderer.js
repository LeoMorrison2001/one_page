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
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${weekdays[date.getDay()]}`;
};

const formatEntryDate = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const formatCalendarTitle = (date) => `${date.getFullYear()}年${date.getMonth() + 1}月`;
const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];
const moods = [
  { emoji: '😄', label: '开心' },
  { emoji: '😌', label: '平静' },
  { emoji: '🥰', label: '满足' },
  { emoji: '😔', label: '低落' },
  { emoji: '😤', label: '烦躁' },
  { emoji: '😴', label: '疲惫' },
];

const getCalendarDays = (visibleMonth) => {
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
};

const isSameDay = (left, right) => (
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate()
);

const calendarPage = (visibleMonth = new Date()) => {
  const month = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const today = new Date();
  return `
    <section class="calendar-page" data-calendar-month="${formatEntryDate(month)}">
      <header class="calendar-page__header">
        <div>
          <h1 class="calendar-page__title">${formatCalendarTitle(month)}</h1>
        </div>
        <div class="calendar-page__actions" aria-label="切换月份">
          <button class="calendar-action" type="button" data-calendar-action="previous" aria-label="上个月"><i class="bi bi-chevron-left"></i></button>
          <button class="calendar-action calendar-action--today" type="button" data-calendar-action="today">今天</button>
          <button class="calendar-action" type="button" data-calendar-action="next" aria-label="下个月"><i class="bi bi-chevron-right"></i></button>
        </div>
      </header>
      <div class="calendar-shell">
        <div class="calendar-weekdays" aria-hidden="true">
          ${weekdayLabels.map((day) => `<span>${day}</span>`).join('')}
        </div>
        <div class="calendar-grid" role="grid" aria-label="${formatCalendarTitle(month)}日历">
          ${getCalendarDays(month).map((date) => {
            const outsideMonth = date.getMonth() !== month.getMonth();
            const isToday = isSameDay(date, today);
            const classNames = ['calendar-day'];
            if (outsideMonth) classNames.push('calendar-day--outside');
            if (isToday) classNames.push('calendar-day--today');
            return `<button class="${classNames.join(' ')}" type="button" data-calendar-date="${formatEntryDate(date)}" role="gridcell" aria-label="${formatEntryDate(date)}${isToday ? '，今天' : ''}">
              <span class="calendar-day__number">${date.getDate()}</span>
            </button>`;
          }).join('')}
        </div>
      </div>
      <p class="calendar-page__hint"><i class="bi bi-mouse"></i> 双击任意日期，查看当天日记</p>
    </section>
  `;
};

const calendarPreviewPage = (entryDate, backLabel = '返回日历') => {
  const selectedDate = new Date(`${entryDate}T00:00:00`);
  return `
    <section class="calendar-preview">
      <header class="calendar-preview__header">
        <h1 class="calendar-preview__title">${formatToday(selectedDate).replace(/ \d{2}:\d{2}:\d{2}$/, '')}</h1>
        <div class="calendar-preview__actions">
          <button class="journal-favorite" type="button" data-preview-favorite aria-label="收藏日记" aria-pressed="false"><i class="bi bi-bookmark"></i></button>
          <button class="calendar-preview__back" type="button" data-calendar-back><i class="bi bi-arrow-left"></i> ${backLabel}</button>
        </div>
      </header>
      <div class="calendar-preview__meta" data-calendar-preview-meta hidden>
        <span><i class="bi bi-cloud-sun"></i><span data-calendar-preview-weather></span></span>
        <span><i class="bi bi-geo-alt"></i><span data-calendar-preview-location></span></span>
        <span><span data-calendar-preview-mood></span></span>
      </div>
      <div class="calendar-preview__content" data-calendar-preview-content>
        <p class="calendar-preview__status" data-calendar-preview-status>正在读取日记…</p>
        <div class="calendar-preview__editor" data-calendar-preview-editor hidden></div>
      </div>
    </section>
  `;
};

const timelinePage = () => `
  <section class="timeline-page">
    <header class="timeline-page__header">
      <div>
        <h1 class="timeline-page__title">时间线</h1>
        <p class="timeline-page__subtitle">回看那些被认真记录的日子</p>
      </div>
    </header>
    <div class="timeline-scroll" data-timeline-scroll>
      <div data-timeline-list></div>
      <p class="timeline-loading" data-timeline-loading>正在加载日记…</p>
    </div>
  </section>
`;

const favoritesPage = () => `
  <section class="favorites-page">
    <header class="favorites-page__header">
      <div>
        <h1 class="favorites-page__title">收藏</h1>
        <p class="favorites-page__subtitle" data-favorites-count>正在读取收藏…</p>
      </div>
    </header>
    <div class="favorites-scroll" data-favorites-scroll>
      <div class="favorites-list" data-favorites-list></div>
    </div>
  </section>
`;

const todayPage = () => {
  const openedAt = new Date();
  return `
  <article class="journal-page" data-entry-date="${formatEntryDate(openedAt)}" data-captured-at="${openedAt.toISOString()}">
    <header class="journal-page__header">
      <div><h1 class="journal-page__date" data-journal-date>${formatToday(openedAt)}</h1></div>
      <div class="journal-page__header-actions">
        <button class="journal-favorite" type="button" data-today-favorite aria-label="收藏日记" aria-pressed="false"><i class="bi bi-bookmark"></i></button>
        <div class="journal-page__status" aria-live="polite"><i class="bi bi-cloud-check"></i><span data-save-status>未保存</span></div>
      </div>
    </header>
    <div class="journal-meta" aria-label="日记信息">
      <button class="journal-meta__item" type="button" data-weather-button aria-label="重新获取天气"><i class="bi bi-cloud-sun"></i><span data-weather-status>正在获取天气</span></button>
      <button class="journal-meta__item" type="button" data-location-button aria-label="重新获取位置"><i class="bi bi-geo-alt"></i><span data-location-status>正在获取位置</span></button>
      <button class="journal-meta__item journal-meta__item--mood" type="button" data-mood-button aria-expanded="false"><span data-mood-status>选择心情</span></button>
      <div class="mood-picker" data-mood-picker hidden>
        ${moods.map((mood) => `<button type="button" data-mood="${mood.emoji}" aria-label="${mood.label}"><span>${mood.emoji}</span><small>${mood.label}</small></button>`).join('')}
      </div>
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
let calendarPreviewEditor = null;
let calendarVisibleMonth = new Date();
let calendarNoticeTimer;

const showCalendarNotice = (message) => {
  let notice = document.querySelector('[data-calendar-notice]');
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'calendar-notice';
    notice.dataset.calendarNotice = '';
    notice.setAttribute('role', 'status');
    document.body.append(notice);
  }
  notice.textContent = message;
  notice.classList.add('calendar-notice--visible');
  window.clearTimeout(calendarNoticeTimer);
  calendarNoticeTimer = window.setTimeout(() => notice.classList.remove('calendar-notice--visible'), 1800);
};

const updateMaximizeButton = (isMaximized) => {
  if (!maximizeButton || !maximizeIcon) return;
  maximizeButton.setAttribute('aria-label', isMaximized ? '还原窗口' : '最大化窗口');
  maximizeIcon.className = isMaximized ? 'bi bi-app' : 'bi bi-square';
};

const updateFavoriteButton = (button, isFavorite) => {
  if (!button) return;
  button.setAttribute('aria-label', isFavorite ? '取消收藏日记' : '收藏日记');
  button.setAttribute('aria-pressed', String(isFavorite));
  const icon = button.querySelector('i');
  if (icon) icon.className = isFavorite ? 'bi bi-bookmark-fill' : 'bi bi-bookmark';
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
  const moodButton = document.querySelector('[data-mood-button]');
  const moodStatus = document.querySelector('[data-mood-status]');
  const moodPicker = document.querySelector('[data-mood-picker]');
  const favoriteButton = document.querySelector('[data-today-favorite]');
  const journalPage = document.querySelector('.journal-page');
  const journalDate = document.querySelector('[data-journal-date]');
  const entryDate = journalPage?.dataset.entryDate;
  let saveTimer;
  let slashRange = null;
  let contextRequestInFlight = false;
  let isRestoring = false;
  let contextFrozen = false;
  let contextResolved = false;
  let isLoadingEntry = true;
  let mood = moods[0].emoji;

  const finishInitialLoad = () => {
    if (liveEditor !== editorForPage) return;
    isLoadingEntry = false;
    editorForPage.setEditable(true);
  };

  const buildMetadata = () => ({
    capturedAt: journalPage?.dataset.capturedAt,
    weatherText: weatherStatus?.textContent ?? '',
    locationText: locationStatus?.textContent ?? '',
    mood,
    contextReady: contextResolved,
  });

  const setMood = (value) => {
    mood = moods.some((option) => option.emoji === value) ? value : '';
    const selectedMood = moods.find((option) => option.emoji === mood);
    if (moodStatus) moodStatus.textContent = selectedMood ? `${selectedMood.emoji} ${selectedMood.label}` : '选择心情';
    moodPicker?.querySelectorAll('[data-mood]').forEach((button) => {
      button.classList.toggle('mood-picker__option--selected', button.dataset.mood === mood);
    });
  };

  setMood(mood);

  const applyMetadata = (metadata) => {
    setMood(metadata?.mood || moods[0].emoji);
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
    if (!liveEditor || isRestoring || isLoadingEntry) return;
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
      file,
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
    editable: false,
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
    if (liveEditor !== editorForPage) return;
    if (!entry) {
      if (saveStatus && !entry) saveStatus.textContent = '未保存';
      updateFavoriteButton(favoriteButton, false);
      finishInitialLoad();
      refreshJournalContext();
      return;
    }
    isRestoring = true;
    editorForPage.commands.setContent(entry.content);
    isRestoring = false;
    updateWordCount();
    if (!applyMetadata(entry.metadata)) refreshJournalContext();
    if (saveStatus) saveStatus.textContent = '已自动保存';
    updateFavoriteButton(favoriteButton, entry.isFavorite);
    finishInitialLoad();
    if (!entry.metadata?.mood) scheduleSave();
  }).catch((error) => {
    if (liveEditor !== editorForPage) return;
    console.error('Failed to load journal', error);
    if (saveStatus) saveStatus.textContent = '读取失败';
    finishInitialLoad();
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
  moodButton?.addEventListener('click', () => {
    if (!moodPicker) return;
    const willOpen = moodPicker.hidden;
    moodPicker.hidden = !willOpen;
    moodButton.setAttribute('aria-expanded', String(willOpen));
  });
  moodPicker?.querySelectorAll('[data-mood]').forEach((button) => {
    button.addEventListener('click', () => {
      setMood(button.dataset.mood);
      moodPicker.hidden = true;
      moodButton?.setAttribute('aria-expanded', 'false');
      scheduleSave();
    });
  });
  favoriteButton?.addEventListener('click', async () => {
    await saveJournal();
    const result = await window.journalStore.toggleFavorite(entryDate);
    if (!result.updated) {
      if (saveStatus) saveStatus.textContent = '写下内容后才能收藏';
      return;
    }
    updateFavoriteButton(favoriteButton, result.isFavorite);
  });
};

const bindCalendarPage = () => {
  const calendarPageElement = document.querySelector('.calendar-page');
  if (!calendarPageElement) return;

  const visibleMonth = new Date(calendarVisibleMonth.getFullYear(), calendarVisibleMonth.getMonth(), 1);
  const requestedMonth = formatEntryDate(visibleMonth);
  window.journalStore.listMonth(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1).then((entries) => {
    if (document.querySelector('.calendar-page') !== calendarPageElement || calendarPageElement.dataset.calendarMonth !== requestedMonth) return;
    const entriesByDate = new Map(entries.map((entry) => {
      const normalizedEntry = typeof entry === 'string' ? { entryDate: entry, metadata: {} } : entry;
      return [normalizedEntry.entryDate, normalizedEntry];
    }));
    calendarPageElement.querySelectorAll('[data-calendar-date]').forEach((day) => {
      const entry = entriesByDate.get(day.dataset.calendarDate);
      const hasEntry = Boolean(entry);
      day.classList.toggle('calendar-day--has-entry', hasEntry);
      day.querySelector('.calendar-day__mood')?.remove();
      if (hasEntry) {
        const mood = document.createElement('span');
        mood.className = 'calendar-day__mood';
        mood.textContent = entry.metadata?.mood || moods[0].emoji;
        mood.setAttribute('aria-hidden', 'true');
        day.append(mood);
        day.setAttribute('aria-label', `${day.dataset.calendarDate}，已有日记`);
      }
    });
    calendarPageElement.dataset.calendarLoaded = 'true';
  }).catch((error) => console.error('Failed to load calendar entries', error));

  document.querySelectorAll('[data-calendar-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextMonth = new Date(calendarVisibleMonth.getFullYear(), calendarVisibleMonth.getMonth(), 1);
      if (button.dataset.calendarAction === 'previous') nextMonth.setMonth(nextMonth.getMonth() - 1);
      if (button.dataset.calendarAction === 'next') nextMonth.setMonth(nextMonth.getMonth() + 1);
      if (button.dataset.calendarAction === 'today') {
        nextMonth.setFullYear(new Date().getFullYear(), new Date().getMonth(), 1);
      }
      calendarVisibleMonth = nextMonth;
      workspaceContent.innerHTML = calendarPage(calendarVisibleMonth);
      bindCalendarPage();
    });
  });

  document.querySelectorAll('[data-calendar-date]').forEach((day) => {
    day.addEventListener('dblclick', () => {
      if (calendarPageElement.dataset.calendarLoaded !== 'true') {
        showCalendarNotice('正在读取日记列表，请稍后再试');
        return;
      }
      if (!day.classList.contains('calendar-day--has-entry')) {
        showCalendarNotice('这一天还没有写日记');
        return;
      }
      workspaceContent.innerHTML = calendarPreviewPage(day.dataset.calendarDate);
      bindCalendarPreviewPage(day.dataset.calendarDate);
      document.querySelector('[data-calendar-back]')?.addEventListener('click', () => {
        calendarPreviewEditor?.destroy();
        calendarPreviewEditor = null;
        workspaceContent.innerHTML = calendarPage(calendarVisibleMonth);
        bindCalendarPage();
      });
    });
  });
};

const bindCalendarPreviewPage = (entryDate) => {
  const content = document.querySelector('[data-calendar-preview-content]');
  const status = document.querySelector('[data-calendar-preview-status]');
  const element = document.querySelector('[data-calendar-preview-editor]');
  const metadata = document.querySelector('[data-calendar-preview-meta]');
  const weather = document.querySelector('[data-calendar-preview-weather]');
  const location = document.querySelector('[data-calendar-preview-location]');
  const mood = document.querySelector('[data-calendar-preview-mood]');
  const favoriteButton = document.querySelector('[data-preview-favorite]');
  if (!content || !status || !element || !metadata || !weather || !location || !mood) return;

  window.journalStore.load(entryDate).then((entry) => {
    if (!document.contains(content)) return;
    if (!entry) {
      status.innerHTML = '<span class="calendar-preview__icon"><i class="bi bi-journal-text"></i></span><strong>这一天还没有写日记</strong><small>回到今天页面开始记录吧。</small>';
      status.classList.add('calendar-preview__status--empty');
      return;
    }
    status.remove();
    weather.textContent = entry.metadata?.weatherText || '未记录天气';
    location.textContent = entry.metadata?.locationText || '未记录位置';
    const moodValue = entry.metadata?.mood || moods[0].emoji;
    const selectedMood = moods.find((option) => option.emoji === moodValue) ?? moods[0];
    mood.textContent = `${selectedMood.emoji} ${selectedMood.label}`;
    metadata.hidden = false;
    updateFavoriteButton(favoriteButton, entry.isFavorite);
    element.hidden = false;
    calendarPreviewEditor = new Editor({
      element,
      editable: false,
      extensions: [StarterKit, Image.configure({ inline: false, allowBase64: false }), Video],
      content: entry.content,
      editorProps: {
        attributes: { class: 'ProseMirror', 'aria-label': `${entryDate} 日记` },
      },
    });
  }).catch((error) => {
    console.error('Failed to load calendar journal', error);
    if (!document.contains(content)) return;
    status.textContent = '读取日记失败';
  });

  favoriteButton?.addEventListener('click', async () => {
    const result = await window.journalStore.toggleFavorite(entryDate);
    if (result.updated) updateFavoriteButton(favoriteButton, result.isFavorite);
  });
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

const bindTimelinePage = () => {
  const scroll = document.querySelector('[data-timeline-scroll]');
  const list = document.querySelector('[data-timeline-list]');
  const loadingElement = document.querySelector('[data-timeline-loading]');
  if (!scroll || !list || !loadingElement) return;

  let cursor = null;
  let isLoading = false;
  let isComplete = false;
  let hasLoadedEntries = false;
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const appendEntry = (entry) => {
    const entryDate = new Date(`${entry.entryDate}T00:00:00`);
    const monthKey = entry.entryDate.slice(0, 7);
    let group = list.querySelector(`[data-timeline-month="${monthKey}"]`);
    if (!group) {
      group = document.createElement('section');
      group.className = 'timeline-group';
      group.dataset.timelineMonth = monthKey;
      group.setAttribute('aria-label', `${entryDate.getFullYear()}年${entryDate.getMonth() + 1}月`);
      group.innerHTML = `<h2 class="timeline-group__title">${entryDate.getFullYear()}年${entryDate.getMonth() + 1}月</h2><div class="timeline-list"></div>`;
      list.append(group);
    }

    const selectedMood = moods.find((option) => option.emoji === entry.metadata?.mood) ?? moods[0];
    const details = [entry.metadata?.weatherText, entry.metadata?.locationText].filter(Boolean);
    const summary = entry.plainText?.trim() || '这一天记录了图片或视频。';
    const item = document.createElement('article');
    item.className = 'timeline-entry';
    item.innerHTML = `
      <div class="timeline-entry__date"><strong>${entryDate.getDate()}</strong><span>${weekdays[entryDate.getDay()]}</span></div>
      <span class="timeline-entry__line" aria-hidden="true"></span>
      <button class="timeline-card" type="button">
        <div class="timeline-card__top"><span class="timeline-card__mood">${selectedMood.emoji} ${selectedMood.label}</span>${details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join('')}</div>
        <p>${escapeHtml(summary)}</p>
        <span class="timeline-card__more">查看日记 <i class="bi bi-arrow-up-right"></i></span>
      </button>`;
    item.querySelector('.timeline-card')?.addEventListener('click', () => {
      workspaceContent.innerHTML = calendarPreviewPage(entry.entryDate, '返回时间线');
      bindCalendarPreviewPage(entry.entryDate);
      document.querySelector('[data-calendar-back]')?.addEventListener('click', () => {
        calendarPreviewEditor?.destroy();
        calendarPreviewEditor = null;
        workspaceContent.innerHTML = timelinePage();
        bindTimelinePage();
      });
    });
    group.querySelector('.timeline-list')?.append(item);
  };

  const loadMore = async () => {
    if (isLoading || isComplete) return;
    isLoading = true;
    loadingElement.textContent = hasLoadedEntries ? '正在加载更多日记…' : '正在加载日记…';
    try {
      const page = await window.journalStore.listTimeline({ before: cursor, limit: 30 });
      if (document.querySelector('[data-timeline-scroll]') !== scroll) return;
      page.entries.forEach(appendEntry);
      hasLoadedEntries ||= page.entries.length > 0;
      cursor = page.nextCursor;
      isComplete = !cursor;
      loadingElement.textContent = isComplete
        ? hasLoadedEntries ? '已经到底了' : '还没有可展示的日记'
        : '继续向下滚动，加载更多';
    } catch (error) {
      console.error('Failed to load timeline', error);
      loadingElement.textContent = '时间线读取失败';
      isComplete = true;
    } finally {
      isLoading = false;
    }
  };

  scroll.addEventListener('scroll', () => {
    if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 160) loadMore();
  });
  loadMore();
};

const bindFavoritesPage = () => {
  const scroll = document.querySelector('[data-favorites-scroll]');
  const list = document.querySelector('[data-favorites-list]');
  const count = document.querySelector('[data-favorites-count]');
  if (!scroll || !list || !count) return;

  window.journalStore.listFavorites().then((entries) => {
    if (document.querySelector('[data-favorites-list]') !== list) return;
    count.textContent = entries.length ? `已收藏 ${entries.length} 篇日记` : '还没有收藏的日记';
    if (!entries.length) {
      list.innerHTML = '<div class="favorites-empty"><span><i class="bi bi-bookmark-heart"></i></span><strong>还没有收藏的日记</strong><p>遇到想反复回看的内容，就收藏起来吧。</p></div>';
      return;
    }

    entries.forEach((entry) => {
      const entryDate = new Date(`${entry.entryDate}T00:00:00`);
      const selectedMood = moods.find((option) => option.emoji === entry.metadata?.mood) ?? moods[0];
      const details = [entry.metadata?.weatherText, entry.metadata?.locationText].filter(Boolean);
      const summary = entry.plainText?.trim() || '这一天记录了图片或视频。';
      const item = document.createElement('article');
      item.className = 'favorite-item';
      item.innerHTML = `
        <div class="favorite-item__date"><strong>${entryDate.getDate()}</strong><span>${entryDate.getFullYear()}年${entryDate.getMonth() + 1}月</span></div>
        <button class="favorite-card" type="button">
          <div class="favorite-card__top"><span class="favorite-card__mood">${selectedMood.emoji} ${selectedMood.label}</span>${details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join('')}</div>
          <p>${escapeHtml(summary)}</p>
          <span class="favorite-card__more">查看日记 <i class="bi bi-arrow-up-right"></i></span>
        </button>`;
      item.querySelector('.favorite-card')?.addEventListener('click', () => {
        workspaceContent.innerHTML = calendarPreviewPage(entry.entryDate, '返回收藏');
        bindCalendarPreviewPage(entry.entryDate);
        document.querySelector('[data-calendar-back]')?.addEventListener('click', () => {
          calendarPreviewEditor?.destroy();
          calendarPreviewEditor = null;
          workspaceContent.innerHTML = favoritesPage();
          bindFavoritesPage();
        });
      });
      list.append(item);
    });
  }).catch((error) => {
    console.error('Failed to load favorites', error);
    count.textContent = '收藏读取失败';
  });
};

const setActiveMenu = (menuKey) => {
  const menu = menus.find((item) => item.key === menuKey);
  if (!menu || !workspaceContent) return;
  liveEditor?.destroy();
  liveEditor = null;
  calendarPreviewEditor?.destroy();
  calendarPreviewEditor = null;
  workspaceContent.innerHTML = menuKey === 'today'
    ? todayPage()
    : menuKey === 'calendar'
      ? calendarPage(calendarVisibleMonth)
      : menuKey === 'timeline'
        ? timelinePage()
        : menuKey === 'favorites'
          ? favoritesPage()
        : `<div class="page-view"><h1 class="page-view__title">${menu.label}</h1></div>`;
  if (menuKey === 'today') bindTodayPage();
  if (menuKey === 'calendar') bindCalendarPage();
  if (menuKey === 'timeline') bindTimelinePage();
  if (menuKey === 'favorites') bindFavoritesPage();
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
