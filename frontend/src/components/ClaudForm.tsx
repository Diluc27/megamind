import { useState, useEffect } from 'react';
import type { Claud } from '../types';
import { api } from '../api';

interface Props {
  editingItem: Claud | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ClaudForm({ editingItem, onSuccess, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [agent, setAgent] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingItem) {
      setTitle(editingItem.title);
      setContent(editingItem.content);
      setAgent(editingItem.agent || '');
      setTags(editingItem.tags || '');
    } else {
      setTitle('');
      setContent('');
      setAgent('');
      setTags('');
    }
  }, [editingItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingItem) {
        await api.updateClaudItem(editingItem.id, {
          title: title.trim(),
          agent: agent.trim() || null,
          tags: tags.trim() || null,
          content,
        });
      } else {
        await api.createClaudItem({
          title: title.trim(),
          agent: agent.trim() || null,
          tags: tags.trim() || null,
          content,
        });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">{editingItem ? 'Edit Claud Note' : 'New Claud Note'}</div>
      <form className="form-group" onSubmit={handleSubmit}>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
        <input
          placeholder="Title"
          value={title}
          onChange={e => { setTitle(e.target.value); setError(''); }}
        />
        <textarea
          placeholder="Content"
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={5}
        />
        <div className="form-row">
          <input
            placeholder="Agent (optional)"
            value={agent}
            onChange={e => setAgent(e.target.value)}
          />
          <input
            placeholder="Tags (optional)"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : editingItem ? 'Update' : 'Create'}
          </button>
          {editingItem && (
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
