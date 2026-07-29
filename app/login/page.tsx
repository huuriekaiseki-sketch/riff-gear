'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

// Magic Link方式のログインページ。
// パスワードを扱わずメールのリンク経由でセッションを確立するため、
// パスワード漏洩・使い回しのリスクを避けられる。
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const supabase = createBrowserSupabaseClient()
    // emailRedirectToで/auth/callbackを指定し、
    // メール内リンククリック後にサーバー側でセッション交換できるようにする。
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return <p>ログイン用のリンクを {email} に送信しました。メールを確認してください。</p>
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        メールアドレス
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <button type="submit">ログインリンクを送信</button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
