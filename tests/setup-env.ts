import { config } from 'dotenv'
import path from 'node:path'

// dotenv/config はデフォルトで .env のみ読むため、.env.local を明示的に読み込む
config({ path: path.resolve(__dirname, '..', '.env.local') })
