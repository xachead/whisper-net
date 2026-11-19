/**
 * Safe API client utilities for WhisperNet
 * Prevents "JSON.parse: unexpected character at line 1 column 1 of the JSON data"
 * by safely inspecting Content-Type, handling HTML/text error pages from reverse proxies,
 * and providing human-friendly error messages when upstreams fail.
 */

export function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) {
    const customUrl = process.env.NEXT_PUBLIC_API_URL.trim();
    if (customUrl) {
      return customUrl.replace(/\/+$/, '');
    }
  }
  return '';
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function parseApiResponse<T = Record<string, unknown>>(res: Response): Promise<ApiResponse<T>> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  let parsedData: unknown = null;
  let rawText = '';

  try {
    if (isJson) {
      parsedData = await res.json();
    } else {
      rawText = await res.text();
    }
  } catch {
    try {
      rawText = await res.text();
    } catch {
      rawText = '';
    }
  }

  if (res.ok) {
    return {
      ok: true,
      status: res.status,
      data: (parsedData ?? (rawText ? { message: rawText } : {})) as T,
      error: null,
    };
  }

  // Derive human-readable error message
  const errObj = (parsedData && typeof parsedData === 'object' ? parsedData : null) as Record<string, unknown> | null;
  let errorMessage: string | null = null;
  if (errObj && typeof errObj.error === 'string') {
    errorMessage = errObj.error;
  } else if (errObj && typeof errObj.message === 'string') {
    errorMessage = errObj.message;
  } else if (res.status === 404) {
    errorMessage = 'API endpoint not found (HTTP 404). Please verify that the backend service is deployed and SPRING_BOOT_BACKEND_URL is configured.';
  } else if (res.status === 502 || res.status === 503 || res.status === 504) {
    errorMessage = `Backend service unavailable (HTTP ${res.status}). The Spring Boot server may be starting up, sleeping, or unreachable.`;
  } else if (rawText && rawText.length < 150 && !rawText.trim().startsWith('<')) {
    errorMessage = rawText.trim();
  } else {
    errorMessage = `Request failed with status ${res.status} (${res.statusText || 'Error'}).`;
  }

  return {
    ok: false,
    status: res.status,
    data: (parsedData as T) || null,
    error: errorMessage,
  };
}
