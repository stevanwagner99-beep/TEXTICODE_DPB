import pg from 'pg'
import { env } from './config/env.js'

const { Pool } = pg

const enVercel = !!process.env.VERCEL

if (!env.databaseUrl) {
  console.error('❌ Falta la variable de conexión a la base de datos (DATABASE_URL)')
}

// Detecta si la base es local (Docker) o remota (Supabase)
function usarSSL(connectionString) {
  if (process.env.DB_SSL === 'true') return true
  if (process.env.DB_SSL === 'false') return false

  try {
    const host = new URL(connectionString).hostname
    return !['localhost', '127.0.0.1', 'db', 'texticode-db'].includes(host)
  } catch {
    return true
  }
}

const ssl = usarSSL(env.databaseUrl)

// En Vercel (serverless) cada instancia debe usar muy pocas conexiones,
// porque pueden existir varias instancias al mismo tiempo.
// En local / Docker se mantiene un pool normal.
const max = Number(process.env.DB_POOL_MAX) || (enVercel ? 1 : 10)

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: ssl ? { rejectUnauthorized: false } : false,
  max,
  idleTimeoutMillis: enVercel ? 10_000 : 30_000,   // libera conexiones inactivas
  connectionTimeoutMillis: 10_000,                  // falla rápido si la base no responde
})

// Evita que el proceso se caiga si Supabase cierra una conexión inactiva
pool.on('error', (err) => {
  console.error('⚠️ Error inesperado en el pool de PostgreSQL:', err.message)
})

export async function checkDatabaseConnection() {
  const client = await pool.connect()
  try {
    const { rows } = await client.query('SELECT current_database() AS db, inet_server_port() AS puerto')
    const origen = ssl ? 'Supabase PostgreSQL' : 'PostgreSQL local (Docker)'
    console.log(`✅ Conectado a ${origen} → base "${rows[0].db}", puerto ${rows[0].puerto ?? 'local'}`)
  } finally {
    client.release()
  }
}

export default pool