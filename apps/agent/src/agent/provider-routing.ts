export type OpenAIAPIMode = 'responses' | 'chat'

const OFFICIAL_OPENAI_HOST = 'api.openai.com'
const OFFICIAL_DEEPSEEK_HOST = 'api.deepseek.com'

function parseHostname(baseURL?: string): string | null {
  if (!baseURL) return null

  try {
    return new URL(baseURL).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isThirdPartyGateway(provider: string, baseURL?: string): boolean {
  if (provider === 'openai') {
    if (!baseURL) return false
    const host = parseHostname(baseURL)
    if (!host) return true
    return host !== OFFICIAL_OPENAI_HOST
  }

  if (provider === 'deepseek') {
    if (!baseURL) return false
    const host = parseHostname(baseURL)
    if (!host) return true
    return host !== OFFICIAL_DEEPSEEK_HOST
  }

  return true
}

export function resolveOpenAIAPIMode(provider: string, baseURL?: string): OpenAIAPIMode {
  return isThirdPartyGateway(provider, baseURL) ? 'chat' : 'responses'
}
