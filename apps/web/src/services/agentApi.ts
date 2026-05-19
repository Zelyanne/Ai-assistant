const DEFAULT_LOCAL_AGENT_URL = 'http://localhost:3001';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function resolveAgentBaseUrl(configured: string, pageProtocol: string, pageOrigin: string): string {
  const configuredUrl = new URL(trimTrailingSlash(configured), pageOrigin);
  const pageUrl = new URL(pageOrigin);
  const isLocalAgent = isLocalHostname(configuredUrl.hostname);
  const isLocalPage = isLocalHostname(pageUrl.hostname);

  if (
    pageProtocol === 'https:'
    && configuredUrl.protocol === 'http:'
    && !(isLocalAgent && isLocalPage)
  ) {
    const fallbackUrl = new URL(pageOrigin);
    fallbackUrl.pathname = configuredUrl.pathname;
    return trimTrailingSlash(fallbackUrl.toString());
  }

  return trimTrailingSlash(configuredUrl.toString());
}

export function getAgentBaseUrl(): string {
  const configured = import.meta.env.VITE_AGENT_URL_PROJECT_GOOGLE_ASSITANT || DEFAULT_LOCAL_AGENT_URL;

  if (typeof window === 'undefined') {
    return trimTrailingSlash(configured);
  }

  return resolveAgentBaseUrl(configured, window.location.protocol, window.location.origin);
}

export function agentApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getAgentBaseUrl()}${normalizedPath}`;
}
