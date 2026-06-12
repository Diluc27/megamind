export interface Note {
  id: number;
  title: string;
  category: string | null;
  tags: string | null;
  source: string | null;
  file_path: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NoteBase {
  title: string;
  category: string | null;
  tags: string | null;
  content: string;
}

export interface NotePage {
  id: number;
  note_id: number;
  title: string;
  tags: string | null;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface NotePageBase {
  title: string;
  tags: string | null;
  content: string;
}

export interface SearchResult {
  id: number;
  title: string;
  category: string | null;
  tags: string | null;
  score: number;
  preview: string;
  created_at?: string | null;
  updated_at: string | null;
}

const TAG_PERMANENT = 'memory-permanent';
const TAG_PROTECTED = 'protected';
const TAG_WORKING = 'memory-working';
const TAG_EXPIRES = 'expires-';
const TAG_RETENTION = 'retention-';

export function isPermanent(tags: string | null | undefined): boolean {
  if (!tags) return false;
  const list = tags.split(',').map(t => t.trim().toLowerCase());
  return list.includes(TAG_PERMANENT) || list.includes(TAG_PROTECTED);
}

export function isContext(tags: string | null | undefined): boolean {
  if (!tags) return false;
  const list = tags.split(',').map(t => t.trim().toLowerCase());
  return list.includes(TAG_WORKING) && list.some(t => t.startsWith(TAG_EXPIRES));
}

export function getExpiryDate(tags: string | null | undefined): string | null {
  if (!tags) return null;
  for (const t of tags.split(',').map(t => t.trim().toLowerCase())) {
    if (t.startsWith(TAG_EXPIRES)) return t.slice(TAG_EXPIRES.length);
  }
  return null;
}

export function getExpiryLabel(tags: string | null | undefined): string {
  if (isPermanent(tags)) return 'No expiry';
  const expiry = getExpiryDate(tags);
  if (!expiry) return '';
  const now = new Date();
  const exp = new Date(expiry + 'T23:59:59Z');
  const diff = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return 'Expired';
  if (diff === 0) return 'Expires today';
  if (diff === 1) return 'Expires tomorrow';
  return `Expires in ${diff} days`;
}

export function buildContextTags(baseTags: string, ttlDays: number): string {
  const now = new Date();
  const expiry = new Date(now.getTime() + ttlDays * 86400000);
  const expiryStr = expiry.toISOString().slice(0, 10);

  let list = (baseTags || '').split(',').map(t => t.trim()).filter(Boolean);
  list = list.filter(t => {
    const lower = t.toLowerCase();
    return !lower.startsWith(TAG_EXPIRES) && !lower.startsWith(TAG_RETENTION)
      && lower !== TAG_WORKING && lower !== TAG_PERMANENT && lower !== TAG_PROTECTED;
  });
  list.push(`memory-working,expires-${expiryStr},retention-${ttlDays}d`);
  return list.join(',');
}

export function buildPermanentTags(baseTags: string): string {
  let list = (baseTags || '').split(',').map(t => t.trim()).filter(Boolean);
  list = list.filter(t => {
    const lower = t.toLowerCase();
    return !lower.startsWith(TAG_EXPIRES) && !lower.startsWith(TAG_RETENTION)
      && lower !== TAG_WORKING;
  });
  if (!list.includes(TAG_PERMANENT)) list.push(TAG_PERMANENT);
  if (!list.includes(TAG_PROTECTED)) list.push(TAG_PROTECTED);
  return list.join(',');
}

export function detectMegacodeType(tags: string | null | undefined): 'permanent' | 'context' {
  if (isPermanent(tags)) return 'permanent';
  return 'context';
}

export function detectExpiryDays(tags: string | null | undefined): number {
  if (!tags) return 7;
  for (const t of tags.split(',').map(t => t.trim().toLowerCase())) {
    if (t.startsWith(TAG_RETENTION)) {
      const days = parseInt(t.slice(TAG_RETENTION.length), 10);
      if (!isNaN(days) && [7, 14, 30].includes(days)) return days;
    }
  }
  return 7;
}

export const formatNoteTime = (value: string | null | undefined): string => {
  if (!value) return '';
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const parsed = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
};

export interface AskBrainResponse {
  mode: string;
  answer: string;
  matched_notes: SearchResult[];
}

export interface CoreNote {
  id: number;
  original_window_id: number | null;
  title: string;
  category: string;
  tags: string | null;
  imported_at: string;
  created_at: string | null;
  updated_at: string | null;
  migration_batch_id: string | null;
  is_sensitive: number;
}

export interface CoreNoteDetail extends CoreNote {
  content: string;
}

export interface Session {
  id: number;
  title: string;
  agent: string | null;
  project: string | null;
  tags: string | null;
  file_path: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SessionBase {
  title: string;
  agent: string | null;
  project: string | null;
  tags: string | null;
  content: string;
}

export interface SessionPage {
  id: number;
  session_id: number;
  title: string;
  tags: string | null;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SessionPageBase {
  title: string;
  tags: string | null;
  content: string;
}

export interface ShelfdSection {
  title: string;
  items: string[];
}

export interface Shelfd {
  id: string;
  title: string;
  tags: string | null;
  file_path: string | null;
  content: string;
  storage_mode: 'synced' | 'local_only' | 'cloud_only' | 'saved';
  key_ideas: string[];
  action_items: string[];
  sections: ShelfdSection[];
  created_at: string;
  updated_at: string;
}

export interface ShelfdProject {
  id: string;
  title: string;
  summary: string | null;
  key_ideas: string[];
  action_items: string[];
  sections: ShelfdSection[];
  raw_text: string | null;
  storage_mode: 'synced' | 'local_only' | 'cloud_only' | 'saved';
  created_at: string;
  updated_at: string;
  server_updated_at: string;
}

export interface ShelfdBase {
  title: string;
  tags: string | null;
  content: string;
}

export interface ShelfdPage {
  id: number;
  project_id: string;
  title: string;
  tags: string | null;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ShelfdPageBase {
  title: string;
  tags: string | null;
  content: string;
}

export interface ShelfdSearchResult {
  id: string;
  title: string;
  tags: string | null;
  score: number;
  preview: string;
}

export interface Claud {
  id: number;
  title: string;
  agent: string | null;
  tags: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ClaudBase {
  title: string;
  agent: string | null;
  tags: string | null;
  content: string;
}

export interface ClaudPage {
  id: number;
  claud_id: number;
  title: string;
  tags: string | null;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ClaudPageBase {
  title: string;
  tags: string | null;
  content: string;
}

export interface CustomSpace {
  name: string;
  icon: string;
  slug: string;
}
