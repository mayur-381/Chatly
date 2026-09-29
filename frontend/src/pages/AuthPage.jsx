import { useState } from 'react'
import { useAuth } from '../store/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', email: '', password: '', display_name: '' })
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.username, form.password)
      } else {
        await register(form)
      }
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0F1E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 380, background: '#111827', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'Fira Code, monospace', fontSize: 28, color: '#6366F1', fontWeight: 700, marginBottom: 8 }}>Chatly</div>
          <div style={{ color: '#64748B', fontSize: 14 }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</div>
        </div>

        <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Display name" style={inputStyle} />
          )}
          <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Username" required style={inputStyle} />
          {mode === 'register' && (
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" placeholder="Email" required style={inputStyle} />
          )}
          <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} type="password" placeholder="Password" required style={inputStyle} />
          <button type="submit" disabled={loading} style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4, opacity: loading ? 0.7 : 1 }}>
            {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: 13, color: '#64748B' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span onClick={() => setMode(mode === 'login' ? 'register' : 'login')} style={{ color: '#6366F1', cursor: 'pointer', fontWeight: 500 }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </span>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  background: '#1A2235', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
  padding: '11px 14px', color: '#F8FAFC', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box'
}
