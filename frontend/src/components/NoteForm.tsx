import React, { useState, useEffect } from 'react';
import type { Note, NoteBase } from '../types';
import { api } from '../api';

const CATEGORIES = [
  "Projects", "Errors-Fixes", "Prompts", "Tools-Models", 
  "Ideas", "Learning-Logs", "Commands"
];

interface NoteFormProps {
  editingNote: Note | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const NoteForm: React.FC<NoteFormProps> = ({ editingNote, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<NoteBase>({
    title: '',
    category: 'Projects',
    tags: '',
    content: ''
  });

  useEffect(() => {
    if (editingNote) {
      setFormData({
        title: editingNote.title,
        category: editingNote.category || 'Projects',
        tags: editingNote.tags || '',
        content: editingNote.content || ''
      });
    } else {
      setFormData({
        title: '',
        category: 'Projects',
        tags: '',
        content: ''
      });
    }
  }, [editingNote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingNote) {
        await api.updateNote(editingNote.id, formData);
      } else {
        await api.createNote(formData);
      }
      onSuccess();
      if (!editingNote) {
         setFormData({ title: '', category: 'Projects', tags: '', content: '' });
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'duplicate') {
        alert('Duplicate note already exists.');
      } else {
        alert('Error saving note');
      }
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">{editingNote ? 'Update note' : 'Create note'}</div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="text"
            placeholder="Title"
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
            required
          />
          <div className="form-row">
            <select
              value={formData.category || ''}
              onChange={e => setFormData({...formData, category: e.target.value})}
            >
              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <input
              type="text"
              placeholder="Tags, comma separated"
              value={formData.tags || ''}
              onChange={e => setFormData({...formData, tags: e.target.value})}
            />
          </div>
          <textarea
            placeholder="Markdown content…"
            value={formData.content}
            onChange={e => setFormData({...formData, content: e.target.value})}
            required
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn-primary">
              {editingNote ? 'Update note' : 'Save note'}
            </button>
            {editingNote && (
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default NoteForm;
