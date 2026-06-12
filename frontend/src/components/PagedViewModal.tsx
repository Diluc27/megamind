import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { isPermanent } from '../types';

export interface PagedChild {
  id: number;
  title: string;
  tags: string | null;
  content: string;
}

interface PageInput {
  title: string;
  tags: string | null;
  content: string;
}

interface Props {
  title: string;
  meta: ReactNode;
  mainLabel?: string;
  mainContent: string;
  mainTags?: string | null;
  onClose: () => void;
  onEditMain?: () => void;
  onDeleteMain?: () => Promise<void> | void;
  onMakeMainPermanent?: () => Promise<void> | void;
  fetchPages: () => Promise<PagedChild[]>;
  createPage: (data: PageInput) => Promise<PagedChild>;
  updatePage: (pageId: number, data: PageInput) => Promise<PagedChild>;
  deletePage: (pageId: number) => Promise<void>;
  makePagePermanent: (pageId: number) => Promise<PagedChild>;
}

export default function PagedViewModal({
  title,
  meta,
  mainLabel = 'Main',
  mainContent,
  mainTags,
  onClose,
  onEditMain,
  onDeleteMain,
  onMakeMainPermanent,
  fetchPages,
  createPage,
  updatePage,
  deletePage,
  makePagePermanent,
}: Props) {
  const [pages, setPages] = useState<PagedChild[]>([]);
  const [selectedId, setSelectedId] = useState<number | 'main'>('main');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPage, setEditingPage] = useState<PagedChild | null>(null);
  const [subTitle, setSubTitle] = useState('');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedPage = typeof selectedId === 'number'
    ? pages.find(page => page.id === selectedId) ?? null
    : null;

  const loadPages = async () => {
    const loaded = await fetchPages();
    setPages(loaded);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingPage(null);
    setSubTitle('');
    setTags('');
    setContent('');
    setError('');
    setMenuOpen(false);
  };

  useEffect(() => {
    loadPages().catch(console.error);
    setSelectedId('main');
    resetForm();
  }, [title]);

  const startNewPage = () => {
    setMenuOpen(false);
    setEditingPage(null);
    setSubTitle('');
    setTags('');
    setContent('');
    setError('');
    setShowForm(true);
  };

  const startEditPage = (page: PagedChild) => {
    setMenuOpen(false);
    setEditingPage(page);
    setSubTitle(page.title);
    setTags(page.tags ?? '');
    setContent(page.content);
    setError('');
    setShowForm(true);
  };

  const savePage = async (e: FormEvent) => {
    e.preventDefault();
    if (!subTitle.trim() || !content.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = { title: subTitle.trim(), tags: tags.trim() || null, content };
      const saved = editingPage ? await updatePage(editingPage.id, payload) : await createPage(payload);
      await loadPages();
      setSelectedId(saved.id);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePage = async (page: PagedChild) => {
    setMenuOpen(false);
    if (!confirm(`Delete page "${page.title}"?`)) return;
    await deletePage(page.id);
    await loadPages();
    setSelectedId('main');
    resetForm();
  };

  const handleMakePagePermanent = async (page: PagedChild) => {
    setMenuOpen(false);
    const updated = await makePagePermanent(page.id);
    await loadPages();
    setSelectedId(updated.id);
    resetForm();
  };

  const handleMakeMainPermanent = async () => {
    if (!onMakeMainPermanent) return;
    setMenuOpen(false);
    await onMakeMainPermanent();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="note-view-modal" onClick={e => e.stopPropagation()}>
        <div className="view-modal-header">
          <div className="view-modal-title">{title}</div>
          <div className="view-modal-actions">
            <button className="btn-close-modal" title="Add page" onClick={startNewPage}>+</button>
            <button className="btn-close-modal" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="view-modal-meta">{meta}</div>

        <div className="claud-page-tabs">
          <button className={`claud-page-tab${selectedId === 'main' || !selectedPage ? ' active' : ''}`} onClick={() => { setSelectedId('main'); resetForm(); }}>
            {mainLabel}
          </button>
          {pages.map(page => (
            <button key={page.id} className={`claud-page-tab${selectedId === page.id ? ' active' : ''}`} onClick={() => { setSelectedId(page.id); resetForm(); }}>
              {page.title}
            </button>
          ))}
        </div>

        {showForm && (
          <form className="claud-page-form" onSubmit={savePage}>
            <div className="panel-header">{editingPage ? 'Edit Sub Page' : 'New Sub Page'}</div>
            {error && <div className="claud-page-error">{error}</div>}
            <input placeholder="Sub title" value={subTitle} onChange={e => setSubTitle(e.target.value)} autoFocus />
            <input placeholder="Tags (optional)" value={tags} onChange={e => setTags(e.target.value)} />
            <textarea placeholder="Page content" value={content} onChange={e => setContent(e.target.value)} rows={7} />
            <div className="claud-page-form-actions">
              <button type="submit" className="btn-primary" disabled={saving || !subTitle.trim() || !content.trim()}>
                {saving ? 'Saving...' : editingPage ? 'Update Sub Page' : 'Create Sub Page'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        )}

        <div className="claud-page-toolbar">
          <div className="claud-page-title-row">
            <span>{selectedPage ? selectedPage.title : mainLabel}</span>
            {isPermanent(selectedPage ? selectedPage.tags : mainTags) && <span className="megacode-badge badge-permanent">Permanent</span>}
          </div>
          <div className="dropdown-wrapper" onClick={e => e.stopPropagation()}>
            <button className="btn-dots" onClick={() => setMenuOpen(v => !v)}>&#8942;</button>
            {menuOpen && (
              <div className="dropdown-menu">
                {selectedPage ? (
                  isPermanent(selectedPage.tags) ? (
                    <div className="dropdown-item">Read-only</div>
                  ) : (
                    <>
                      <div className="dropdown-item" onClick={() => startEditPage(selectedPage)}>Edit</div>
                      <div className="dropdown-item" onClick={() => handleMakePagePermanent(selectedPage)}>Make permanent</div>
                      <div className="dropdown-item dropdown-danger" onClick={() => handleDeletePage(selectedPage)}>Delete</div>
                    </>
                  )
                ) : isPermanent(mainTags) ? (
                  <div className="dropdown-item">Read-only</div>
                ) : (
                  <>
                    {onEditMain && <div className="dropdown-item" onClick={onEditMain}>Edit</div>}
                    {onMakeMainPermanent && <div className="dropdown-item" onClick={handleMakeMainPermanent}>Make permanent</div>}
                    {onDeleteMain && <div className="dropdown-item dropdown-danger" onClick={() => { setMenuOpen(false); onDeleteMain(); }}>Delete</div>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="view-modal-content" style={{ whiteSpace: 'pre-wrap' }}>
          {selectedPage ? selectedPage.content : mainContent}
        </div>
      </div>
    </div>
  );
}
