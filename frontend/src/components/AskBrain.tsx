import React, { useState } from 'react';
import type { SearchResult } from '../types';
import { api } from '../api';

const AskBrain: React.FC = () => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [matchedNotes, setMatchedNotes] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    try {
      const res = await api.askBrain(question);
      setAnswer(res.answer);
      setMatchedNotes(res.matched_notes);
    } catch (err) {
      alert('Error asking brain');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">Ask brain</div>
      <div className="search-row">
        <input
          type="text"
          placeholder="Ask a natural language question…"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAsk(e); }}
        />
        <button className="btn-sm accent" onClick={handleAsk} disabled={loading}>
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      {answer && (
        <div className="ai-answer">
          <div className="ai-answer-label">Brain says</div>
          {answer}
        </div>
      )}
      {matchedNotes && matchedNotes.length > 0 && (
        <div className="matched-notes">
          {matchedNotes.map((note) => (
            <div key={note.id} className="matched-note-item">
              <div className="matched-note-title">{note.title || 'Untitled'}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>
                {note.category || ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {matchedNotes && matchedNotes.length === 0 && answer && (
        <p className="brain-empty">No matching notes found in your saved brain.</p>
      )}
    </div>
  );
};

export default AskBrain;
