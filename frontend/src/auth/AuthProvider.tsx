import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type AuthUser = {
  id: string
  email: string | null
  userName: string | null
}

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

type LoginResponse = {
  accessToken?: string
  refreshToken?: string
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ACCESS_TOKEN_STORAGE_KEY = 'pace_route_access_token'
const REFRESH_TOKEN_STORAGE_KEY = 'pace_route_refresh_token'

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return 'http://localhost:5000'
}

const API_BASE_URL = getApiBaseUrl()

function firstErrorMessage(errors: unknown): string | null {
  if (!errors || typeof errors !== 'object') return null
  for (const value of Object.values(errors)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0]
    }
  }
  return null
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const json = await response.json() as Record<string, unknown>
    const fromErrors = firstErrorMessage(json.errors)
    if (fromErrors) return fromErrors
    if (typeof json.title === 'string' && json.title.length > 0) return json.title
    if (typeof json.detail === 'string' && json.detail.length > 0) return json.detail
  } catch {
    // Fall through to text/status fallback.
  }
  return response.statusText || `Request failed (${response.status})`
}

function loadToken(key: string): string | null {
  return localStorage.getItem(key)
}

function saveTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken)
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
  }
}

function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
}

async function fetchCurrentUser(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  return await response.json() as AuthUser
}

async function registerRequest(email: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }
}

async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  return await response.json() as LoginResponse
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  const establishSession = useCallback(async (accessToken: string, refreshToken?: string) => {
    saveTokens(accessToken, refreshToken)
    const me = await fetchCurrentUser(accessToken)
    setUser(me)
    setStatus('authenticated')
  }, [])

  useEffect(() => {
    const accessToken = loadToken(ACCESS_TOKEN_STORAGE_KEY)
    if (!accessToken) {
      setStatus('anonymous')
      setUser(null)
      return
    }

    fetchCurrentUser(accessToken)
      .then((me) => {
        setUser(me)
        setStatus('authenticated')
      })
      .catch(() => {
        clearTokens()
        setUser(null)
        setStatus('anonymous')
      })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setStatus('loading')
    try {
      const result = await loginRequest(email, password)
      if (!result.accessToken) {
        throw new Error('Login succeeded but no access token was returned by the backend.')
      }
      await establishSession(result.accessToken, result.refreshToken)
    } catch (err) {
      clearTokens()
      setUser(null)
      setStatus('anonymous')
      throw err
    }
  }, [establishSession])

  const register = useCallback(async (email: string, password: string) => {
    setStatus('loading')
    try {
      await registerRequest(email, password)
      const result = await loginRequest(email, password)
      if (!result.accessToken) {
        throw new Error('Account was created but no access token was returned by the backend.')
      }
      await establishSession(result.accessToken, result.refreshToken)
    } catch (err) {
      clearTokens()
      setUser(null)
      setStatus('anonymous')
      throw err
    }
  }, [establishSession])

  const logout = useCallback(() => {
    clearTokens()
    setUser(null)
    setStatus('anonymous')
  }, [])

  return (
    <AuthContext.Provider value={{ status, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
