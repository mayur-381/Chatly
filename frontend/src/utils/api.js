import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || ''

const api = axios.create({ baseURL: baseURL })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('chatly_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('chatly_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api