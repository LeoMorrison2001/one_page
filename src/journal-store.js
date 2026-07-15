import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const entryDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const maximumMediaBytes = { image: 25 * 1024 * 1024, video: 100 * 1024 * 1024 };
const schemaVersion = '3';

const validateEntryDate = (entryDate) => {
  if (!entryDatePattern.test(entryDate)) throw new Error('Invalid journal date');
};

const isMeaningfulContent = (node) => {
  if (!node) return false;
  if (node.type === 'image' || node.type === 'video') return true;
  if (node.type === 'text' && node.text?.trim()) return true;
  return node.content?.some(isMeaningfulContent) ?? false;
};

const extensionFor = (fileName, mimeType) => {
  const extension = path.extname(fileName).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(extension)) return extension;
  return mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/png' ? '.png' : mimeType === 'video/mp4' ? '.mp4' : '';
};

const mediaNamesIn = (content, entryDate, names = new Set()) => {
  if (!content) return names;
  if ((content.type === 'image' || content.type === 'video') && typeof content.attrs?.src === 'string') {
    try {
      const source = new URL(content.attrs.src);
      if (source.protocol === 'journal-media:' && source.hostname === entryDate) {
        const name = decodeURIComponent(source.pathname).replace(/^[/\\]+/, '');
        if (/^[a-f0-9-]{36}(?:\.[a-z0-9]{1,8})?$/i.test(name)) names.add(name);
      }
    } catch {
      // Ignore malformed editor content rather than deleting unrelated files.
    }
  }
  content.content?.forEach((node) => mediaNamesIn(node, entryDate, names));
  return names;
};

export const createJournalStore = ({ dataDirectory }) => {
  const databaseDirectory = path.join(dataDirectory, 'journal');
  const databasePath = path.join(databaseDirectory, 'journal.db');
  const mediaDirectory = path.join(dataDirectory, 'journal-media');
  fs.mkdirSync(databaseDirectory, { recursive: true });
  fs.mkdirSync(mediaDirectory, { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE IF NOT EXISTS journal_entries (
    entry_date TEXT PRIMARY KEY NOT NULL,
    content_json TEXT NOT NULL,
    plain_text TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    is_favorite INTEGER NOT NULL DEFAULT 0,
    favorited_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  database.exec(`CREATE TABLE IF NOT EXISTS journal_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`);
  const hasColumn = (name) => database.prepare("SELECT 1 AS present FROM pragma_table_info('journal_entries') WHERE name = ?").get(name);
  if (!hasColumn('metadata_json')) {
    database.exec("ALTER TABLE journal_entries ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!hasColumn('is_favorite')) {
    database.exec('ALTER TABLE journal_entries ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasColumn('favorited_at')) {
    database.exec('ALTER TABLE journal_entries ADD COLUMN favorited_at TEXT');
  }
  database.prepare("INSERT INTO journal_metadata (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(schemaVersion);

  const selectEntry = database.prepare('SELECT * FROM journal_entries WHERE entry_date = ?');
  const selectEntriesInRange = database.prepare('SELECT entry_date, metadata_json FROM journal_entries WHERE entry_date >= ? AND entry_date < ? ORDER BY entry_date');
  const selectTimelineEntries = database.prepare('SELECT entry_date, plain_text, metadata_json FROM journal_entries WHERE entry_date < ? ORDER BY entry_date DESC LIMIT ?');
  const selectFavoriteEntries = database.prepare('SELECT entry_date, plain_text, metadata_json, favorited_at FROM journal_entries WHERE is_favorite = 1 ORDER BY favorited_at DESC, entry_date DESC');
  const selectEntrySummary = database.prepare('SELECT entry_date, plain_text, metadata_json FROM journal_entries WHERE entry_date = ?');
  const selectEntryCount = database.prepare('SELECT COUNT(*) AS count FROM journal_entries');
  const selectEntryCountInRange = database.prepare('SELECT COUNT(*) AS count FROM journal_entries WHERE entry_date >= ? AND entry_date < ?');
  const selectEntryAtOffset = database.prepare('SELECT entry_date, plain_text, metadata_json FROM journal_entries ORDER BY entry_date ASC LIMIT 1 OFFSET ?');
  const upsertEntry = database.prepare(`INSERT INTO journal_entries (entry_date, content_json, plain_text, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(entry_date) DO UPDATE SET content_json = excluded.content_json, plain_text = excluded.plain_text, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at`);
  const deleteEntry = database.prepare('DELETE FROM journal_entries WHERE entry_date = ?');
  const selectFavoriteState = database.prepare('SELECT is_favorite FROM journal_entries WHERE entry_date = ?');
  const updateFavoriteState = database.prepare('UPDATE journal_entries SET is_favorite = ?, favorited_at = ? WHERE entry_date = ?');

  const entryMediaDirectory = (entryDate) => path.join(mediaDirectory, entryDate);
  const removeEntryMedia = (entryDate) => fs.rmSync(entryMediaDirectory(entryDate), { recursive: true, force: true });
  const removeUnusedMedia = (entryDate, content) => {
    const directory = entryMediaDirectory(entryDate);
    if (!fs.existsSync(directory)) return;
    const referenced = mediaNamesIn(content, entryDate);
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.isFile() && !referenced.has(item.name)) fs.unlinkSync(path.join(directory, item.name));
    }
    if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  };
  const toEntrySummary = (entry) => entry ? {
    entryDate: entry.entry_date,
    plainText: entry.plain_text,
    metadata: JSON.parse(entry.metadata_json || '{}'),
  } : null;

  return {
    load(entryDate) {
      validateEntryDate(entryDate);
      const entry = selectEntry.get(entryDate);
      return entry ? {
        entryDate: entry.entry_date,
        content: JSON.parse(entry.content_json),
        plainText: entry.plain_text,
        metadata: JSON.parse(entry.metadata_json || '{}'),
        isFavorite: Boolean(entry.is_favorite),
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      } : null;
    },
    listMonth(year, month) {
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Invalid journal month');
      }
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
      const end = `${nextMonth.year}-${String(nextMonth.month).padStart(2, '0')}-01`;
      return selectEntriesInRange.all(start, end).map((entry) => ({
        entryDate: entry.entry_date,
        metadata: JSON.parse(entry.metadata_json || '{}'),
      }));
    },
    listTimeline({ before = null, limit = 30 } = {}) {
      if (before !== null) validateEntryDate(before);
      const pageSize = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 30) : 30;
      const rows = selectTimelineEntries.all(before ?? '9999-12-31', pageSize + 1);
      const hasMore = rows.length > pageSize;
      const entries = rows.slice(0, pageSize).map((entry) => ({
        entryDate: entry.entry_date,
        plainText: entry.plain_text,
        metadata: JSON.parse(entry.metadata_json || '{}'),
      }));
      return {
        entries,
        nextCursor: hasMore ? entries.at(-1).entryDate : null,
      };
    },
    listFavorites() {
      return selectFavoriteEntries.all().map((entry) => ({ ...toEntrySummary(entry), favoritedAt: entry.favorited_at }));
    },
    getReview(today) {
      validateEntryDate(today);
      const [year, month, day] = today.split('-').map(Number);
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
      const monthEnd = `${nextMonth.year}-${String(nextMonth.month).padStart(2, '0')}-01`;
      const total = selectEntryCount.get().count;
      const previousYearDate = `${year - 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const randomEntry = total ? selectEntryAtOffset.get(Math.floor(Math.random() * total)) : null;
      return {
        total,
        monthCount: selectEntryCountInRange.get(monthStart, monthEnd).count,
        previousYear: toEntrySummary(selectEntrySummary.get(previousYearDate)),
        randomEntry: toEntrySummary(randomEntry),
      };
    },
    toggleFavorite(entryDate) {
      validateEntryDate(entryDate);
      const entry = selectFavoriteState.get(entryDate);
      if (!entry) return { updated: false, isFavorite: false };
      const isFavorite = !Boolean(entry.is_favorite);
      updateFavoriteState.run(isFavorite ? 1 : 0, isFavorite ? new Date().toISOString() : null, entryDate);
      return { updated: true, isFavorite };
    },
    save({ entryDate, content, plainText = '', metadata = {} }) {
      validateEntryDate(entryDate);
      if (!isMeaningfulContent(content)) return this.remove(entryDate);
      const now = new Date().toISOString();
      upsertEntry.run(entryDate, JSON.stringify(content), String(plainText), JSON.stringify(metadata), now, now);
      removeUnusedMedia(entryDate, content);
      return { saved: true, updatedAt: now };
    },
    remove(entryDate) {
      validateEntryDate(entryDate);
      deleteEntry.run(entryDate);
      removeEntryMedia(entryDate);
      return { saved: false };
    },
    importMedia({ entryDate, fileName, mimeType, filePath }) {
      validateEntryDate(entryDate);
      const type = mimeType?.startsWith('image/') ? 'image' : mimeType?.startsWith('video/') ? 'video' : null;
      if (!type || typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Unsupported media file');
      const source = path.resolve(filePath);
      const sourceStats = fs.statSync(source);
      if (!sourceStats.isFile() || sourceStats.size === 0 || sourceStats.size > maximumMediaBytes[type]) throw new Error('Unsupported media file');
      const directory = entryMediaDirectory(entryDate);
      fs.mkdirSync(directory, { recursive: true });
      const name = `${crypto.randomUUID()}${extensionFor(fileName ?? '', mimeType)}`;
      fs.copyFileSync(source, path.join(directory, name));
      return { src: `journal-media://${entryDate}/${name}` };
    },
    resolveMediaPath(url) {
      const requested = new URL(url);
      const entryDate = requested.hostname;
      const name = decodeURIComponent(requested.pathname).replace(/^[/\\]+/, '');
      validateEntryDate(entryDate);
      const target = path.resolve(mediaDirectory, entryDate, name);
      return target.startsWith(`${path.resolve(mediaDirectory, entryDate)}${path.sep}`) && fs.existsSync(target) ? target : null;
    },
    close() { database.close(); },
  };
};
