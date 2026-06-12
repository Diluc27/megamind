import { useState, useEffect } from 'react';
import type { Shelfd, ShelfdBase } from '../types';
import { api } from '../api';

interface Props {
  editingItem: Shelfd | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ShelfdForm({ editingItem, onSuccess, onCancel }: Props) {
  const [title, setTitle] = useState(editingItem?.title ?? '');
  const [tags, setTags] = useState(editingItem?.tags ?? '');
  const [content, setContent] = useState(editingItem?.content ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setTitle(editingItem.title);
      setTags(editingItem.tags ?? '');
      setContent(editingItem.content ?? '');
    }
  }, [editingItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const data: ShelfdBase = { title: title.trim(), tags: tags.trim() || null, content: content.trim() };
      if (editingItem) {
        await api.updateShelfdItem(editingItem.id, data);
      } else {
        await api.createShelfdItem(data);
      }
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to save Shelfd item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="panel-header">{editingItem ? 'Edit Shelfd Item' : 'New Shelfd Item'}</div>
      <div className="form-group">
        <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} required />
        <input placeholder="Tags (comma-separated)" value={tags} onChange={e => setTags(e.target.value)} />
        <textarea placeholder="Content / notes\u2026" value={content} onChange={e => setContent(e.target.value)} required rows={5} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving\u2026' : editingItem ? 'Update' : 'Create Item'}</button>
          {editingItem && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
        </div>
      </div>
    </form>
  );
}
