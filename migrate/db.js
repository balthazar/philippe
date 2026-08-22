import mysql from 'mysql2/promise'

export const PREFIX = 'CTL6P_'

let pool
export function getPool() {
  pool ||= mysql.createPool({
    host: process.env.WP_MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.WP_MYSQL_PORT || 3399),
    user: process.env.WP_MYSQL_USER || 'root',
    password: process.env.WP_MYSQL_PASSWORD || 'root',
    database: process.env.WP_MYSQL_DB || 'wp',
    charset: 'utf8mb4',
  })
  return pool
}

export async function query(sql, params = []) {
  const [rows] = await getPool().query(sql.replaceAll('{p}', PREFIX), params)
  return rows
}

export async function close() {
  if (pool) await pool.end()
  pool = undefined
}
