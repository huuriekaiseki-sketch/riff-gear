import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAndNotifyAbandonedCarts } from '@/lib/cartAbandonment'

// Vercel Cron(vercel.json参照)から定期実行される放棄カート通知。
// Cronリクエストは`Authorization: Bearer ${CRON_SECRET}`ヘッダを自動で付与するため、
// これを検証して第三者がこのURLを直接叩いて通知を乱発できないようにする。
// ユーザーセッションが存在しないため、RLSをバイパスするadmin clientを使う。
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  await checkAndNotifyAbandonedCarts(supabase)

  return NextResponse.json({ ok: true })
}
