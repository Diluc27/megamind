export interface Note {
  id: number;
  title: string;
  category: string | null;
  tags: string | null;
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
