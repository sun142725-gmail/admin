import axios from 'axios'

const ACCESS_TOKEN_KEY = 'has_web_access_token'
const REFRESH_TOKEN_KEY = 'has_web_refresh_token'

function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setTokens(tokens) {
  if (tokens?.accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken)
  if (tokens?.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

let refreshing = null

request.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalConfig = error.config || {}
    const status = error.response?.status
    if (status === 401 && !originalConfig.__retried && getRefreshToken()) {
      originalConfig.__retried = true
      try {
        refreshing =
          refreshing ||
          axios
            .post(`${request.defaults.baseURL}/auth/refresh`, { refreshToken: getRefreshToken() })
            .then((res) => res.data?.data ?? res.data)
            .finally(() => {
              refreshing = null
            })
        const data = await refreshing
        setTokens(data)
        originalConfig.headers = {
          ...(originalConfig.headers || {}),
          Authorization: `Bearer ${data.accessToken}`
        }
        return request(originalConfig)
      } catch (refreshError) {
        clearTokens()
        window.location.hash = '#/login'
        return Promise.reject(refreshError)
      }
    }
    return Promise.reject(error)
  }
)

export default request
