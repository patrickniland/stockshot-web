// StockShot — Login Screen

import { useState } from 'react'
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../lib/auth'

export default function LoginView() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleGoogle() {
    setError(null); setLoading(true)
    try {
      await signInWithGoogle()
    } catch (e: any) {
      setError(e.message || 'Google sign in failed')
      setLoading(false)
    }
  }

  async function handleEmail() {
    setError(null); setLoading(true)
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password)
      } else {
        await signUpWithEmail(email, password)
        setMessage('Check your email to confirm your account!')
      }
    } catch (e: any) {
      setError(e.message || 'Authentication failed')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F5F5F5', padding: '1rem',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', marginBottom: '16px' }}>
            <div style={{ width: '48px', height: '48px', display: 'flex' }}>
              <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>E</span>
              </div>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#000', fontSize: '16px', fontWeight: 700 }}>R</span>
              </div>
            </div>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111', margin: 0 }}>StockShot</h1>
          <p style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>by Enhance Retail</p>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E0E0E0', padding: '2rem' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111', marginBottom: '1.5rem', textAlign: 'center' }}>
            {mode === 'login' ? 'Sign in to your studio' : 'Create your account'}
          </h2>

          {/* Google button */}
          <button onClick={handleGoogle} disabled={loading} style={{
            width: '100%', padding: '12px', border: '1px solid #E0E0E0',
            borderRadius: '8px', background: '#fff', cursor: loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            fontSize: '14px', fontWeight: 500, color: '#444', marginBottom: '1rem',
            opacity: loading ? 0.7 : 1,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
            <div style={{ flex: 1, height: '1px', background: '#E0E0E0' }} />
            <span style={{ fontSize: '11px', color: '#aaa' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: '#E0E0E0' }} />
          </div>

          {/* Email/password */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@studio.com"
              style={{ width: '100%', padding: '10px', border: '1px solid #E0E0E0', borderRadius: '7px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleEmail()}
              style={{ width: '100%', padding: '10px', border: '1px solid #E0E0E0', borderRadius: '7px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {error && (
            <div style={{ background: '#FFEBEE', color: '#B71C1C', padding: '10px 12px', borderRadius: '7px', fontSize: '12px', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: '10px 12px', borderRadius: '7px', fontSize: '12px', marginBottom: '12px' }}>
              {message}
            </div>
          )}

          <button onClick={handleEmail} disabled={loading || !email || !password} style={{
            width: '100%', padding: '11px', background: (!email || !password || loading) ? '#E0E0E0' : '#1C1C1E',
            color: (!email || !password || loading) ? '#999' : '#fff',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
            cursor: (!email || !password || loading) ? 'default' : 'pointer',
          }}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <p style={{ textAlign: 'center', fontSize: '12px', color: '#888', marginTop: '1rem' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setMessage(null) }}
              style={{ background: 'none', border: 'none', color: '#1565C0', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
