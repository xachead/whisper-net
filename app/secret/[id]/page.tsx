'use client';

import { useState, useEffect, use } from 'react';
import { Lock, TriangleAlert, ShieldCheck, Flame, Copy, Key } from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/Header';
import { decryptZeroKnowledge, computeTokenVerifier } from '@/lib/client-crypto';
import { getApiBaseUrl, parseApiResponse } from '@/lib/api-client';

export default function ViewSecret({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  
  const [token, setToken] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [decryptedSecret, setDecryptedSecret] = useState<string | null>(null);
  const [decryptedClientSide, setDecryptedClientSide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'checking' | 'exists' | 'not-found'>('checking');
  const [metadata, setMetadata] = useState<{
    burnOnRead: boolean;
    isPaused: boolean;
    expiresAt?: number;
    clientEncrypted: boolean;
    salt?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Inspect URL hash fragment on load to auto-fill token, then strip fragment from URL/history
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const match = hash.match(/token=([a-zA-Z0-9_-]+)/);
    if (!match?.[1]) return;

    const extractedToken = decodeURIComponent(match[1]).toUpperCase();
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    const frame = window.requestAnimationFrame(() => {
      setToken(extractedToken);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    fetch(`${baseUrl}/api/secrets/${id}`)
      .then(async (res) => {
        const response = await parseApiResponse<{
          burnOnRead?: boolean;
          isPaused?: boolean;
          paused?: boolean;
          expiresAt?: number;
          clientEncrypted?: boolean;
          isClientEncrypted?: boolean;
          salt?: string;
        }>(res);

        if (response.ok && response.data) {
          const data = response.data;
          setMetadata({
            burnOnRead: !!data.burnOnRead,
            isPaused: !!(data.isPaused ?? data.paused),
            expiresAt: data.expiresAt,
            clientEncrypted: !!(data.clientEncrypted ?? data.isClientEncrypted),
            salt: typeof data.salt === 'string' ? data.salt : undefined,
          });
          setStatus('exists');
        } else {
          setStatus('not-found');
        }
      })
      .catch(() => setStatus('not-found'));
  }, [id]);

  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cleanToken = token.trim().toUpperCase();

      if (!metadata?.clientEncrypted) {
        setError('This secret cannot be decrypted because zero-knowledge client-side encryption is strictly required.');
        setLoading(false);
        return;
      }

      if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
        setError('WebCrypto API is required to decrypt this zero-knowledge secret in your browser.');
        setLoading(false);
        return;
      }
      if (!metadata.salt) {
        setError('Missing cryptographic salt metadata from server.');
        setLoading(false);
        return;
      }

      // True Zero-Knowledge: derive verifier locally from token + passphrase + salt.
      // Never transmit raw token or passphrase to the server.
      const verifier = await computeTokenVerifier(cleanToken, metadata.salt, passphrase || undefined);
      const requestBody = { tokenVerifier: verifier };

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/secrets/${id}/decrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      const response = await parseApiResponse<{
        clientEncrypted?: boolean;
        encrypted?: string;
        authTag?: string;
        iv?: string;
        salt?: string;
      }>(res);

      if (response.ok && response.data) {
        const data = response.data;
        if (data.clientEncrypted && data.encrypted && data.authTag && data.iv && data.salt) {
          // Zero-knowledge browser-side decryption via WebCrypto
          try {
            const plainText = await decryptZeroKnowledge(
              data.encrypted,
              data.authTag,
              data.iv,
              data.salt,
              cleanToken,
              passphrase || undefined
            );
            setDecryptedClientSide(true);
            setDecryptedSecret(plainText);
          } catch {
            setError('Decryption failed: Incorrect passphrase or token.');
          }
        } else {
          setError('Unexpected response from server: encrypted payload expected.');
        }
      } else {
        setError(response.error || 'Failed to decrypt');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'An error occurred while decrypting.';
      setError(message);
    }
    setLoading(false);
  };

  const handleCopy = async () => {
    if (!decryptedSecret) return;
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(decryptedSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Unable to copy automatically. Please select and copy the text manually.');
    }
  };

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-[#0a0f18] text-slate-300 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Lock className="w-8 h-8 text-cyan-500" />
          <p className="font-medium text-lg">Verifying secure link...</p>
        </div>
      </div>
    );
  }

  if (status === 'not-found' && !decryptedSecret) {
    return (
      <div className="min-h-screen bg-[#0a0f18] text-slate-300 flex flex-col items-center justify-center p-6">
        <div className="bg-[#121722] border border-red-500/30 p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <TriangleAlert className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Secret Not Found</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            This secret does not exist. It may have expired, or it has already been viewed and permanently destroyed.
          </p>
          <Link href="/" className="inline-block bg-[#1a2333] hover:bg-slate-700 border border-[#242c3d] text-white px-6 py-3 rounded-xl transition font-medium w-full">
            Create a New Secret
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f18] text-slate-300 font-sans flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col items-center justify-center p-6 py-12">
        <div className="max-w-lg w-full">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 text-cyan-400 mb-5 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
              {decryptedSecret ? <ShieldCheck className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
            </div>
            <h1 className="text-3xl font-extrabold text-white mb-3">
              {decryptedSecret ? "Secret Decrypted" : "Secure Secret Access"}
            </h1>
            <p className="text-slate-400 text-[17px]">
              {decryptedSecret 
                ? (metadata?.burnOnRead 
                    ? "This secret has been permanently destroyed from the server."
                    : "Decryption successful. Secret remains active until expiration.")
                : "Enter your secure token to decrypt and view this secret."}
            </p>
          </div>

          <div className="bg-[#121722] border border-[#242c3d] p-7 md:p-9 rounded-2xl shadow-xl relative overflow-hidden">
            {/* Subtle top highlight */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/50 to-cyan-500/0"></div>
            
            {!decryptedSecret ? (
              <form onSubmit={handleDecrypt} className="space-y-6">
                {metadata?.isPaused && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex gap-3 text-amber-400 text-sm animate-in fade-in">
                    <TriangleAlert className="w-5 h-5 shrink-0" />
                    <p>This secret has been temporarily paused by the sender. Access is currently suspended.</p>
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-3 text-red-400 text-sm animate-in fade-in">
                    <TriangleAlert className="w-5 h-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-[14.5px] font-semibold text-slate-400 mb-2">Secret Token</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                        <Key className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={token}
                        onChange={(e) => setToken(e.target.value.toUpperCase())}
                        placeholder="WNET-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                        disabled={metadata?.isPaused}
                        className="w-full bg-[#0a0f18] border border-[#242c3d] rounded-xl py-3.5 pl-11 pr-4 text-white font-mono uppercase tracking-wider focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition text-[15px] disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[14.5px] font-semibold text-slate-400 mb-2">Passphrase <span className="text-slate-500 font-normal">(if required)</span></label>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Enter passphrase"
                      disabled={metadata?.isPaused}
                      className="w-full bg-[#0a0f18] border border-[#242c3d] rounded-xl p-3.5 text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition text-[15px] disabled:opacity-50"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !token || !!metadata?.isPaused}
                  className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-[17px] rounded-xl py-3.5 transition shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                >
                  <ShieldCheck className="w-5 h-5" />
                  {loading ? 'Decrypting in Browser...' : metadata?.isPaused ? 'Secret Paused by Sender' : 'Decrypt & View Secret'}
                </button>

                {metadata?.burnOnRead ? (
                  <div className="flex items-start md:items-center justify-center gap-2 text-[14px] text-orange-400/90 pt-4 border-t border-[#1a2333]">
                    <Flame className="w-4 h-4 shrink-0 mt-0.5 md:mt-0" />
                    <span className="font-medium text-white">Warning: Single-use secret. Viewing will permanently destroy it.</span>
                  </div>
                ) : (
                  <div className="flex items-start md:items-center justify-center gap-2 text-[14px] text-emerald-400/90 pt-4 border-t border-[#1a2333]">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 md:mt-0" />
                    <span className="font-medium text-white">Multi-use secret: Active until expiration time.</span>
                  </div>
                )}
              </form>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-3 text-red-400 text-sm animate-in fade-in">
                    <TriangleAlert className="w-5 h-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex gap-3 text-emerald-400 text-sm mb-2">
                  <ShieldCheck className="w-5 h-5 shrink-0" />
                  <p className="font-medium leading-relaxed">
                    {decryptedClientSide
                      ? (metadata?.burnOnRead
                          ? "Zero-knowledge browser decryption complete. The secret has been burned from the server."
                          : "Zero-knowledge browser decryption complete. Secret remains active until its expiration time.")
                      : (metadata?.burnOnRead
                          ? "Decryption complete. The secret has been burned from the server."
                          : "Decryption complete. Secret remains active until its expiration time.")}
                  </p>
                </div>

                <div className="relative">
                  <label className="block text-[14.5px] font-semibold text-slate-400 mb-2">Decrypted Content</label>
                  <div className="w-full min-h-[160px] bg-[#0a0f18] border border-cyan-500/30 rounded-xl p-5 text-slate-100 whitespace-pre-wrap font-mono break-all leading-relaxed shadow-inner text-[15px]">
                    {decryptedSecret}
                  </div>
                </div>

                <button
                  onClick={handleCopy}
                  className="w-full bg-[#1a2333] hover:bg-slate-700 border border-[#242c3d] text-white font-semibold text-[17px] rounded-xl py-3.5 transition flex items-center justify-center gap-2.5"
                >
                  <Copy className="w-5 h-5" />
                  {copied ? 'Copied to Clipboard!' : 'Copy Secret Content'}
                </button>
                
                <div className="text-center pt-5">
                   <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm font-medium transition flex items-center justify-center gap-1">
                     ← Create another secret
                   </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
