// StockShot — Login Screen

import { useState } from 'react'
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'

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
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-muted)] p-4">
      <div className="w-full max-w-[380px]">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex mb-4">
            <div className="w-12 h-12 flex">
              <div className="flex-1 bg-black flex items-center justify-center">
                <span className="text-white text-[16px] font-bold">E</span>
              </div>
              <div className="flex-1 bg-white border border-black flex items-center justify-center">
                <span className="text-black text-[16px] font-bold">R</span>
              </div>
            </div>
          </div>
          <h1 className="text-[24px] font-bold text-neutral-900 m-0">StockShot</h1>
          <p className="text-[13px] text-neutral-400 mt-1">by Enhance Retail</p>
        </div>

        {/* Card */}
        <Card padding="lg">
          <h2 className="text-[16px] font-semibold text-neutral-900 mb-6 text-center">
            {mode === 'login' ? 'Sign in to your studio' : 'Create your account'}
          </h2>

          {/* Google button */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full py-3 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-white flex items-center justify-center gap-2.5 text-[14px] font-medium text-neutral-700 mb-4 hover:bg-[var(--color-surface-muted)] transition-colors disabled:opacity-70 disabled:cursor-default cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex-1 h-px bg-[var(--color-border)]" />
            <span className="text-[11px] text-neutral-300">or</span>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>

          {/* Email */}
          <div className="mb-3">
            <label className="text-[11px] text-neutral-500 block mb-1">Email</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@studio.com"
            />
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="text-[11px] text-neutral-500 block mb-1">Password</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleEmail()}
            />
          </div>

          {error && (
            <div className="bg-[var(--color-danger)]/10 text-[var(--color-danger)] px-3 py-2.5 rounded-[var(--radius-md)] text-[12px] mb-3">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-[var(--color-success)]/10 text-[var(--color-success)] px-3 py-2.5 rounded-[var(--radius-md)] text-[12px] mb-3">
              {message}
            </div>
          )}

          <Button
            variant="primary"
            size="md"
            onClick={handleEmail}
            disabled={loading || !email || !password}
            className="w-full"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>

          <p className="text-center text-[12px] text-neutral-400 mt-4">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setMessage(null) }}
              className="bg-transparent border-none text-[var(--color-info)] cursor-pointer text-[12px] font-medium hover:underline"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </Card>
      </div>
    </div>
  )
}
