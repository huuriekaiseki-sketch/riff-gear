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
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-surface p-8 text-center shadow-sm dark:border-gray-800">
        <p className="text-foreground">
          ログイン用のリンクを <span className="font-medium">{email}</span> に送信しました。
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">メールを確認してください。</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-surface p-8 shadow-sm dark:border-gray-800"
    >
      <h1 className="text-xl font-semibold text-foreground">ログイン</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        メールアドレス宛にログイン用のリンクを送信します。
      </p>
      <label className="mt-6 block text-sm font-medium text-foreground">
        メールアドレス
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-gray-700 dark:bg-black"
        />
      </label>
      <button
        type="submit"
        className="mt-6 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        ログインリンクを送信
      </button>
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
