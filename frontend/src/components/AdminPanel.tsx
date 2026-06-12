import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  coreToken: string;
}

interface StatusData {
  backend: { status: string; port: number } | null;
  watcher: { running: boolean } | null;
  pending_structures: number;
  ngrok: { running: boolean; url: string | null };
  mcp: { running: boolean };
  counts: Record<string, number>;
}

export default function AdminPanel({ coreToken }: Props) {
  const [keyPreview, setKeyPreview] = useState('');
  const [newKey, setNewKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ngrokUrl, setNgrokUrl] = useState<string | null>(null);
  const [ngrokRunning, setNgrokRunning] = useState(false);
  const [ngrokLoading, setNgrokLoading] = useState(true);
  const [ngrokCopied, setNgrokCopied] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.getApiKeyStatus(coreToken)
      .then(ks => {
        if (!cancelled) setKeyPreview(ks.key_preview || (ks.key_configured ? 'Configured' : 'Not configured'));
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to fetch key status');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [coreToken]);

  useEffect(() => {
    refreshNgrokUrl();
    refreshStatus();
  }, [coreToken]);

  const refreshNgrokUrl = async () => {
    setNgrokLoading(true);
    const s = await api.getNgrokUrl(coreToken);
    setNgrokUrl(s.url);
    setNgrokRunning(s.running);
    setNgrokLoading(false);
  };

  const refreshStatus = async () => {
    setStatusLoading(true);
    try {
      const s = await api.getAdminStatus(coreToken);
      setStatus(s);
    } catch {
      // status fetch failure is not critical
    } finally {
      setStatusLoading(false);
    }
  };

  const rotateKey = async () => {
    if (!confirm('Rotate API key? All clients will need updating.')) return;
    setRotating(true);
    setError('');
    try {
      const rotated = await api.rotateApiKey(coreToken);
      setNewKey(rotated.new_key);
      setKeyPreview(rotated.key_preview);
    } catch (err: any) {
      setError(err.message || 'Failed to rotate API key');
    } finally {
      setRotating(false);
    }
  };

  const copyKey = async () => {
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const copyNgrokUrl = async () => {
    if (!ngrokUrl) return;
    await navigator.clipboard.writeText(ngrokUrl);
    setNgrokCopied(true);
    window.setTimeout(() => setNgrokCopied(false), 3000);
  };

  const StatusDot = ({ ok }: { ok: boolean }) => (
    <span style={{ color: ok ? '#7edc8a' : '#a8a8a8', fontSize: 18, lineHeight: 1 }}>{ok ? '●' : '○'}</span>
  );

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-header">Admin</div>

      {/* Service Status */}
      <div style={{ marginBottom: 24 }}>
        <div className="panel-header" style={{ padding: 0, marginBottom: 12, fontSize: 12, border: 'none' }}>Service Status</div>
        {statusLoading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Checking...</div>
        ) : status ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StatusDot ok={status.backend?.status === 'running'} />
              <span style={{ fontWeight: 600 }}>Backend</span>
              <span style={{ color: 'var(--text-2)', fontSize: 12 }}>port {status.backend?.port}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StatusDot ok={status.watcher?.running ?? false} />
              <span style={{ fontWeight: 600 }}>Watcher</span>
              {status.pending_structures > 0 && (
                <span style={{ color: 'var(--accent)', fontSize: 12 }}>{status.pending_structures} pending</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StatusDot ok={status.mcp?.running ?? false} />
              <span style={{ fontWeight: 600 }}>MCP Server</span>
              <span style={{ color: 'var(--text-2)', fontSize: 12 }}>Claude Desktop</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StatusDot ok={status.ngrok?.running ?? false} />
              <span style={{ fontWeight: 600 }}>Ngrok Tunnel</span>
              {status.ngrok?.url && (
                <span style={{ color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
                  {status.ngrok.url}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn-secondary" onClick={refreshStatus} style={{ fontSize: 11, padding: '4px 10px' }}>
                Refresh Status
              </button>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--danger)', fontSize: 12 }}>Failed to load status</div>
        )}
      </div>

      {/* Content Counts */}
      {status?.counts && (
        <div style={{ marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 20, color: 'var(--text)' }}>{status.counts.notes || 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Notes</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 20, color: 'var(--text)' }}>{status.counts.sessions || 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Sessions</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 20, color: 'var(--text)' }}>{status.counts.claud || 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Claud</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 20, color: 'var(--text)' }}>{status.counts.shelfd_projects || 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Shelfd</div>
          </div>
        </div>
      )}

      {/* API Key Management */}
      <div style={{ marginBottom: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
        <div className="panel-header" style={{ padding: 0, marginBottom: 12 }}>API Key Management</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="note-meta-chip">Current key: {loading ? 'Loading…' : keyPreview || 'Not configured'}</span>
          <button className="btn-primary" onClick={rotateKey} disabled={rotating || loading}>
            {rotating ? 'Rotating…' : 'Rotate Key'}
          </button>
        </div>
        {error && <p className="core-error">{error}</p>}
        {newKey && (
          <div style={{ marginTop: 16, padding: 14, border: '1px solid rgba(240,180,80,0.35)', borderRadius: 12, background: 'rgba(240,180,80,0.08)' }}>
            <div style={{ color: '#f0b450', fontWeight: 600, marginBottom: 8 }}>New API key (copy now):</div>
            <div style={{ userSelect: 'text', wordBreak: 'break-all', fontFamily: 'var(--mono)', color: 'var(--text)', marginBottom: 10 }}>{newKey}</div>
            <button className="btn-secondary" onClick={copyKey}>Copy to Clipboard</button>
            {copied && <span style={{ marginLeft: 10, color: '#7edc8a' }}>✓ Copied!</span>}
            <div style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 10 }}>
              Update this key in Shelfd app Settings → MegaMind URL section.
            </div>
          </div>
        )}
      </div>

      {/* Remote Access - Ngrok */}
      <div style={{ paddingTop: 18, borderTop: '1px solid var(--border)' }}>
        <div className="panel-header" style={{ padding: 0, marginBottom: 12 }}>Remote Access — Ngrok</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: ngrokRunning ? '#7edc8a' : '#a8a8a8', fontSize: 18, lineHeight: 1 }}>{ngrokRunning ? '●' : '○'}</span>
          <span style={{ color: ngrokRunning ? '#7edc8a' : 'var(--text-2)', fontWeight: 600 }}>
            {ngrokRunning ? 'Running' : 'Not running'}
          </span>
          <button className="btn-secondary" onClick={refreshNgrokUrl} disabled={ngrokLoading} style={{ fontSize: 11, padding: '4px 10px' }}>
            {ngrokLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {ngrokUrl ? (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ userSelect: 'text', color: 'var(--text)', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{ngrokUrl}</span>
            <button className="btn-secondary" onClick={copyNgrokUrl}>Copy for Shelfd</button>
            {ngrokCopied && <span style={{ color: '#7edc8a' }}>✓ Copied!</span>}
          </div>
        ) : (
          <div style={{ color: 'var(--text-2)', marginTop: 8 }}>
            Start ngrok: <code style={{ color: '#a8a8a8' }}>ngrok http 8000</code>
          </div>
        )}
      </div>
    </div>
  );
}
