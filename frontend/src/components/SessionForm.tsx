import { useState, useEffect } from 'react';
import type { Session, SessionBase } from '../types';
import { api } from '../api';
import { detectMegacodeType, detectExpiryDays, buildContextTags, buildPermanentTags } from '../types';

interface Props {
  editingSession: Session | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function SessionForm({ editingSession, onSuccess, onCancel }: Props) {
  const [title, setTitle] = useState(editingSession?.title ?? '');
  const [agent, setAgent] = useState(editingSession?.agent ?? '');
  const [project, setProject] = useState(editingSession?.project ?? '');
  const [tags, setTags] = useState(editingSession?.tags ?? '');
  const [content, setContent] = useState(editingSession?.content ?? '');
  const [saving, setSaving] = useState(false);

  const [megacodeType, setMegacodeType] = useState<'permanent' | 'context'>(
    editingSession ? detectMegacodeType(editingSession.tags) : 'context'
  );
  const [expiryDays, setExpiryDays] = useState<number>(
    editingSession ? detectExpiryDays(editingSession.tags) : 7
  );

  useEffect(() => {
    if (editingSession) {
      setTitle(editingSession.title);
      setAgent(editingSession.agent ?? '');
      setProject(editingSession.project ?? '');
      setTags(editingSession.tags ?? '');
      setContent(editingSession.content ?? '');
      setMegacodeType(detectMegacodeType(editingSession.tags));
      setExpiryDays(detectExpiryDays(editingSession.tags));
    }
  }, [editingSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      let finalTags = tags.trim();
      if (megacodeType === 'permanent') {
        finalTags = buildPermanentTags(finalTags);
      } else {
        finalTags = buildContextTags(finalTags, expiryDays);
      }
      const data: SessionBase = { title: title.trim(), agent: agent.trim() || null, project: project.trim() || null, tags: finalTags || null, content: content.trim() };
      if (editingSession) {
        await api.updateSession(editingSession.id, data);
      } else {
        await api.createSession(data);
      }
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel session-form" onSubmit={handleSubmit}>
      <div className="panel-header">{editingSession ? 'Edit MegaCode Entry' : 'New MegaCode Entry'}</div>
      <div className="form-group">
        <div className="form-row">
          <input placeholder="Session title" value={title} onChange={e => setTitle(e.target.value)} required />
          <input placeholder="Project" value={project} onChange={e => setProject(e.target.value)} />
        </div>
        <div className="form-row">
          <input placeholder="Agent name" value={agent} onChange={e => setAgent(e.target.value)} />
          <input placeholder="Tags (comma-separated)" value={tags} onChange={e => setTags(e.target.value)} />
        </div>
        <div className="form-row">
          <select value={megacodeType} onChange={e => setMegacodeType(e.target.value as 'permanent' | 'context')}>
            <option value="context">Context (auto-expires)</option>
            <option value="permanent">Permanent (no expiry)</option>
          </select>
          {megacodeType === 'context' && (
            <select value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value))}>
              <option value={7}>Expires in 7 days</option>
              <option value={14}>Expires in 14 days</option>
              <option value={30}>Expires in 30 days</option>
            </select>
          )}
          {megacodeType === 'permanent' && (
            <input disabled placeholder="No expiry — protected from deletion" style={{ opacity: 0.5 }} />
          )}
        </div>
        <textarea placeholder="Session content / log" value={content} onChange={e => setContent(e.target.value)} required rows={6} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving\u2026' : editingSession ? 'Update' : 'Create Entry'}</button>
          {editingSession && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
        </div>
      </div>
    </form>
  );
}
