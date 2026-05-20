interface SdkErrorShape {
  status?: number;
  error?: { error?: { type?: string; message?: string }; message?: string };
  message?: string;
  code?: string;
}

export function friendlyApiError(err: unknown): string {
  const e = err as SdkErrorShape;
  const status = typeof e.status === 'number' ? e.status : undefined;
  const apiMsg = e.error?.error?.message ?? e.error?.message;
  const apiType = e.error?.error?.type;
  const lowMsg = (apiMsg ?? e.message ?? '').toLowerCase();

  if (status === 401 || lowMsg.includes('unauthorized') || lowMsg.includes('invalid api key')) {
    const detail = apiMsg ? ` (API said: ${apiMsg})` : '';
    return `API key rejected${detail}. Verify with: terpix config show. Replace via: terpix config set <provider>_api_key ...`;
  }
  if (
    status === 400 &&
    (lowMsg.includes('credit balance') || lowMsg.includes('billing') || lowMsg.includes('insufficient'))
  ) {
    return 'Credit balance too low. Top up at your provider\'s billing page, or switch keys via: terpix config set <provider>_api_key ...';
  }
  if (status === 429 || lowMsg.includes('rate limit') || lowMsg.includes('too many requests')) {
    return 'API rate-limited (429). Wait a moment and try again, or switch model with --model.';
  }
  if (status === 529 || status === 503) {
    return 'API overloaded. Retry shortly.';
  }
  if (status === 404 && lowMsg.includes('model')) {
    return `Model not found at provider: ${apiMsg}. List models in the provider's docs or use --model.`;
  }
  if (status && apiMsg) {
    return `API error ${status} (${apiType ?? 'unknown'}): ${apiMsg}`;
  }
  if (status) {
    return `API error ${status}`;
  }
  return `LLM call failed: ${e.message ?? String(err)}`;
}
