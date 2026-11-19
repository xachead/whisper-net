'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Clock, Info, Shield, Key, Flame, Trash2, PauseCircle, PlayCircle, Download, Smartphone, Monitor, ArrowDownToLine, TriangleAlert } from 'lucide-react';
import { getApiBaseUrl, parseApiResponse } from '@/lib/api-client';

interface HistoryItem {
  id: string;
  token?: string;
  tokenHint?: string;
  adminToken?: string;
  expiresAt: number;
  createdAt: number;
  isPaused?: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [origin, setOrigin] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [downloadedShortcut, setDownloadedShortcut] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    const frame = window.requestAnimationFrame(() => {
      if (mediaQuery.matches) {
        setIsInstalled(true);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const openHistoryModal = () => {
    setOrigin(window.location.origin);
    setHistoryError(null);
    try {
      const parsed = JSON.parse(localStorage.getItem('whispernet_history') || '[]');
      setHistory(Array.isArray(parsed) ? parsed : []);
    } catch {
      setHistory([]);
      setHistoryError('Saved history data was corrupted and could not be loaded.');
    }
    setNow(Date.now());
    setIsHistoryOpen(true);
    setIsMenuOpen(false);
  };

  const handleDownloadApp = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          return;
        }
      } catch (err) {
        console.error('Install prompt error', err);
      }
    }
    setIsInstallModalOpen(true);
  };

  const downloadDesktopShortcut = () => {
    const originUrl = window.location.origin;
    const shortcutContent = `[InternetShortcut]\r\nURL=${originUrl}\r\nIconIndex=0\r\n`;
    const blob = new Blob([shortcutContent], { type: 'application/octet-stream' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'WhisperNet.url';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
    setDownloadedShortcut(true);
    setTimeout(() => setDownloadedShortcut(false), 3000);
  };

  useEffect(() => {
    if (!isHistoryOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isHistoryOpen]);

  const clearHistory = () => {
    localStorage.removeItem('whispernet_history');
    setHistory([]);
    setHistoryError(null);
  };

  const handleAction = async (id: string, action: 'pause' | 'resume' | 'delete') => {
    const item = history.find(h => h.id === id);
    if (!item || !item.adminToken) return;

    setActionLoading(id);
    setHistoryError(null);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/secrets/${id}/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminToken: item.adminToken, action })
      });
      const response = await parseApiResponse<{ success?: boolean }>(res);
      if (response.ok) {
        let updated = [...history];
        if (action === 'delete') {
          updated = updated.filter(h => h.id !== id);
        } else {
          updated = updated.map(h => h.id === id ? { ...h, isPaused: action === 'pause' } : h);
        }
        setHistory(updated);
        localStorage.setItem('whispernet_history', JSON.stringify(updated));
      } else if ((res.status === 404 || res.status === 410) && action === 'delete') {
        // Already expired or burned on the server; remove stale local history entry
        const updated = history.filter(h => h.id !== id);
        setHistory(updated);
        localStorage.setItem('whispernet_history', JSON.stringify(updated));
      } else {
        setHistoryError(response.error || `Unable to ${action} secret (HTTP ${res.status}).`);
      }
    } catch (e) {
      console.error('Action failed', e);
      setHistoryError('Network error while updating secret status.');
    }
    setActionLoading(null);
  };

  const formatTime = (expiresAt: number) => {
    const diff = expiresAt - now;
    if (diff <= 0) return 'Expired';
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  return (
    <>
      <header className="flex items-center justify-between px-8 py-5 border-b border-[#1a2333] relative z-30">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="text-cyan-400">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12l5.25 5 2.625-3 2.625 3 2.625-3 2.625 3 5.25-5" />
            </svg>
          </div>
          <span className="font-bold text-[1.35rem] text-white tracking-tight">WhisperNet</span>
        </Link>
        
        <nav className="hidden md:flex gap-8 text-sm font-medium text-slate-300 absolute left-1/2 -translate-x-1/2">
          <Link href="/" className="hover:text-cyan-400 transition">Secure Share</Link>
          <button onClick={() => setIsAboutOpen(true)} className="hover:text-white transition">How It Works</button>
        </nav>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleDownloadApp}
            className="hidden sm:flex items-center gap-2 bg-[#121722] border border-[#242c3d] hover:bg-[#1a2333] hover:border-cyan-500/50 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm group"
            title="Download and install WhisperNet app"
          >
            <Download className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>{isInstalled ? 'App Installed' : 'Download App'}</span>
          </button>
          <div className="relative">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)} 
              className="p-2 bg-[#121722] border border-[#242c3d] hover:bg-[#1a2333] text-white rounded-lg transition flex items-center justify-center shadow-sm"
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            
            {isMenuOpen && (
              <div className="absolute right-0 mt-3 w-56 bg-[#121722] border border-[#242c3d] rounded-xl shadow-2xl overflow-hidden z-40 animate-in slide-in-from-top-2 fade-in duration-200">
                <button 
                  onClick={() => { handleDownloadApp(); setIsMenuOpen(false); }} 
                  className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#1a2333] text-slate-200 transition font-medium text-sm"
                >
                  <Download className="w-4 h-4 text-cyan-400" /> {isInstalled ? 'App Installed' : 'Download Web App'}
                </button>
                <button 
                  onClick={openHistoryModal} 
                  className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#1a2333] text-slate-200 transition font-medium text-sm border-t border-[#242c3d]"
                >
                  <Clock className="w-4 h-4 text-cyan-400" /> My Secrets History
                </button>
                <button 
                  onClick={() => { setIsAboutOpen(true); setIsMenuOpen(false); }} 
                  className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#1a2333] text-slate-200 transition font-medium text-sm border-t border-[#242c3d]"
                >
                  <Info className="w-4 h-4 text-cyan-400" /> About WhisperNet
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* History Modal */}
      {isHistoryOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121722] border border-[#242c3d] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 md:px-7 border-b border-[#242c3d]">
              <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
                <Clock className="text-cyan-400 w-5 h-5"/> My Secrets History
              </h2>
              <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-white transition bg-slate-800/50 hover:bg-slate-800 p-1.5 rounded-lg">
                <X className="w-5 h-5"/>
              </button>
            </div>
            
            <div className="p-5 md:px-7 overflow-y-auto flex-1 space-y-4">
              {historyError && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-red-400 text-sm">
                  <TriangleAlert className="w-4 h-4 shrink-0" />
                  <span>{historyError}</span>
                </div>
              )}
              {history.length === 0 ? (
                <div className="text-center text-slate-500 py-16 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-[#0a0f18] border border-[#242c3d] flex items-center justify-center mb-4">
                    <Clock className="w-7 h-7 text-slate-600" />
                  </div>
                  <p>No secrets generated yet.</p>
                </div>
              ) : (
                history.map((item) => {
                  const expired = item.expiresAt <= now;
                  const maskedToken = item.tokenHint || (item.token ? `${item.token.slice(0, 13)}••••` : 'Hidden');
                  return (
                    <div key={item.id} className={`bg-[#0a0f18] border ${expired ? 'border-red-500/20' : item.isPaused ? 'border-orange-500/30' : 'border-[#242c3d]'} rounded-xl p-4 md:p-5 flex flex-col md:flex-row justify-between gap-4 transition-colors`}>
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="text-[14.5px] text-slate-300 flex items-center gap-2">
                          Token: <span className={`font-mono font-bold px-2 py-0.5 rounded ${expired ? 'bg-red-500/10 text-red-400' : item.isPaused ? 'bg-orange-500/10 text-orange-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{maskedToken}</span>
                          {item.isPaused && <span className="bg-orange-500/20 text-orange-400 text-[11px] px-2 py-0.5 rounded uppercase font-bold tracking-wider border border-orange-500/20">Paused</span>}
                        </div>
                        <div className="text-[13px] text-slate-500 font-mono truncate cursor-default max-w-[280px]">
                          {origin}/secret/{item.id}
                        </div>
                        {item.adminToken && !expired && (
                          <div className="flex items-center gap-3 pt-2">
                            {item.isPaused ? (
                              <button 
                                onClick={() => handleAction(item.id, 'resume')}
                                disabled={actionLoading === item.id}
                                className="flex items-center gap-1.5 text-xs font-semibold text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 px-3 py-1.5 rounded-md transition disabled:opacity-50"
                              >
                                <PlayCircle className="w-3.5 h-3.5" /> Resume Access
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleAction(item.id, 'pause')}
                                disabled={actionLoading === item.id}
                                className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 px-3 py-1.5 rounded-md transition disabled:opacity-50"
                              >
                                <PauseCircle className="w-3.5 h-3.5" /> Pause Access
                              </button>
                            )}
                            
                            {confirmDelete === item.id ? (
                              <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
                                <span className="text-xs text-slate-400 mr-1">Sure?</span>
                                <button 
                                  onClick={() => {
                                    handleAction(item.id, 'delete');
                                    setConfirmDelete(null);
                                  }}
                                  className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-md transition"
                                >
                                  Yes
                                </button>
                                <button 
                                  onClick={() => setConfirmDelete(null)}
                                  className="text-xs font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 px-2.5 py-1.5 rounded-md transition"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setConfirmDelete(item.id)}
                                disabled={actionLoading === item.id}
                                className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1.5 rounded-md transition disabled:opacity-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-row md:flex-col justify-between items-center md:items-end">
                        <div className={`text-[14px] font-bold tracking-wide ${expired ? 'text-red-400' : item.isPaused ? 'text-orange-400' : 'text-cyan-400'}`}>
                          {formatTime(item.expiresAt)}
                        </div>
                        <div className="text-[12px] text-slate-500 md:mt-1 font-medium">
                          {new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            
            {history.length > 0 && (
              <div className="p-4 md:px-7 border-t border-[#242c3d] bg-[#0a0f18] flex justify-end rounded-b-2xl">
                <button onClick={clearHistory} className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm font-semibold transition px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20">
                  <Trash2 className="w-4 h-4"/> Clear History
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* About Modal */}
      {isAboutOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121722] border border-[#242c3d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 md:p-8 space-y-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-cyan-400 bg-cyan-500/10 p-2 rounded-xl">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12l5.25 5 2.625-3 2.625 3 2.625-3 2.625 3 5.25-5" /></svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight leading-none">WhisperNet</h2>
                    <span className="text-cyan-400 text-sm font-semibold">Secure Secret Share</span>
                  </div>
                </div>
                <button onClick={() => setIsAboutOpen(false)} className="text-slate-400 hover:text-white transition bg-slate-800/50 hover:bg-slate-800 p-1.5 rounded-lg"><X className="w-5 h-5"/></button>
              </div>
              
              <div className="text-slate-300 space-y-5 leading-relaxed text-[15px]">
                <p>
                  WhisperNet is a zero-compromise, hyper-secure platform designed for sharing sensitive information like production passwords, API keys, and private messages. 
                </p>
                
                <div className="space-y-3 mt-4">
                  <div className="flex items-start gap-3.5 bg-[#0a0f18] p-4 rounded-xl border border-[#242c3d]">
                    <Shield className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block mb-1 text-[15px]">Zero-Knowledge Encryption</strong>
                      <span className="text-sm text-slate-400">Your secrets are encrypted directly in your browser using standard W3C WebCrypto AES-256-GCM. The server never sees plaintext data.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3.5 bg-[#0a0f18] p-4 rounded-xl border border-[#242c3d]">
                    <Key className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block mb-1 text-[15px]">Hardened Key Derivation</strong>
                      <span className="text-sm text-slate-400">Client encryption derives separate AES-256-GCM keys and authentication verifiers using PBKDF2-HMAC-SHA256 (600,000 rounds) and HKDF-SHA-256, with memory-hard Scrypt used for server-side fallback mode.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3.5 bg-[#0a0f18] p-4 rounded-xl border border-[#242c3d]">
                    <Flame className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block mb-1 text-[15px]">Burn on Read Validation</strong>
                      <span className="text-sm text-slate-400">The moment a secret is successfully decrypted, it is permanently purged from the database in the exact same execution cycle.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-[#242c3d] bg-[#0a0f18] text-center">
              <span className="text-slate-500 text-sm font-medium">Version 1.0.0 &bull; Fast, Hard & Secure by Design</span>
            </div>
          </div>
        </div>
      )}

      {/* Download / Install App Modal */}
      {isInstallModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121722] border border-[#242c3d] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 md:px-6 border-b border-[#242c3d]">
              <div className="flex items-center gap-3">
                <div className="text-cyan-400 bg-cyan-500/10 p-2 rounded-xl">
                  <Download className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">Download WhisperNet App</h2>
              </div>
              <button 
                onClick={() => setIsInstallModalOpen(false)} 
                className="text-slate-400 hover:text-white transition bg-slate-800/50 hover:bg-slate-800 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div className="p-6 space-y-6 text-[15px]">
              <p className="text-slate-300 leading-relaxed">
                Install WhisperNet to your PC, iPhone, or Android home screen for rapid one-click access in a standalone app window.
              </p>

              <div className="space-y-3">
                {deferredPrompt ? (
                  <button 
                    onClick={handleDownloadApp}
                    className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2.5 transition shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                  >
                    <Download className="w-5 h-5" /> Install App to Device Now
                  </button>
                ) : (
                  <button 
                    onClick={downloadDesktopShortcut}
                    className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2.5 transition shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                  >
                    <ArrowDownToLine className="w-5 h-5" />
                    {downloadedShortcut ? '✓ App Shortcut Saved to Downloads!' : 'Download Web App Shortcut (.url)'}
                  </button>
                )}
              </div>

              <div className="space-y-3 pt-1">
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider block">How to install on other devices</span>
                
                <div className="bg-[#0a0f18] border border-[#242c3d] rounded-xl p-4 flex items-start gap-3.5">
                  <Monitor className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <strong className="text-white block mb-0.5">Desktop (Chrome & Edge)</strong>
                    <span className="text-slate-400">Click the install icon (<span className="text-cyan-400 font-mono">⤓</span> or <span className="text-cyan-400 font-mono">⊕</span>) in your browser address bar to install as a native desktop window.</span>
                  </div>
                </div>

                <div className="bg-[#0a0f18] border border-[#242c3d] rounded-xl p-4 flex items-start gap-3.5">
                  <Smartphone className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <strong className="text-white block mb-0.5">iPhone & Android</strong>
                    <span className="text-slate-400">On iPhone, tap <strong>Share</strong> &rarr; <strong>&quot;Add to Home Screen&quot;</strong>. On Android, tap menu (<strong>⋮</strong>) &rarr; <strong>&quot;Install app&quot;</strong>.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#242c3d] bg-[#0a0f18] flex justify-end">
              <button 
                onClick={() => setIsInstallModalOpen(false)}
                className="px-5 py-2 text-sm font-medium text-slate-300 hover:text-white bg-[#1a2333] hover:bg-[#242c3d] rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
