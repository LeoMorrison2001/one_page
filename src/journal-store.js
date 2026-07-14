import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const entryDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const maximumMediaBytes = { image: 25 * 1024 * 1024, video: 250 * 1024 * 1024 };

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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  try {
    database.exec("ALTER TABLE journal_entries ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'");
  } catch {
    // Existing databases already have this column.
  }

  const selectEntry = database.prepare('SELECT * FROM journal_entries WHERE entry_date = ?');
  const upsertEntry = database.prepare(`INSERT INTO journal_entries (entry_date, content_json, plain_text, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(entry_date) DO UPDATE SET content_json = excluded.content_json, plain_text = excluded.plain_text, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at`);
  const deleteEntry = database.prepare('DELETE FROM journal_entries WHERE entry_date = ?');

  return {
    load(entryDate) {
      validateEntryDate(entryDate);
      const entry = selectEntry.get(entryDate);
      return entry ? {
        entryDate: entry.entry_date,
        content: JSON.parse(entry.content_json),
        plainText: entry.plain_text,
        metadata: JSON.parse(entry.metadata_json || '{}'),
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      } : null;
    },
    save({ entryDate, content, plainText = '', metadata = {} }) {
      validateEntryDate(entryDate);
      if (!isMeaningfulContent(content)) return this.remove(entryDate);
      const now = new Date().toISOString();
      upsertEntry.run(entryDate, JSON.stringify(content), String(plainText), JSON.stringify(metadata), now, now);
      return { saved: true, updatedAt: now };
    },
    remove(entryDate) {
      validateEntryDate(entryDate);
      deleteEntry.run(entryDate);
      return { saved: false };
    },
    importMedia({ entryDate, fileName, mimeType, bytes }) {
      validateEntryDate(entryDate);
      const type = mimeType?.startsWith('image/') ? 'image' : mimeType?.startsWith('video/') ? 'video' : null;
      const fileBytes = Buffer.from(bytes);
      if (!type || fileBytes.length === 0 || fileBytes.length > maximumMediaBytes[type]) throw new Error('Unsupported media file');
      const directory = path.join(mediaDirectory, entryDate);
      fs.mkdirSync(directory, { recursive: true });
      const name = `${crypto.randomUUID()}${extensionFor(fileName ?? '', mimeType)}`;
      fs.writeFileSync(path.join(directory, name), fileBytes, { mode: 0o600 });
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
