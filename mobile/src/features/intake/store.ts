// SOURCING: expo-sqlite through local-db.ts (one autocommit statement per write); the same narrow database type journal-store.ts uses, so tests run on bun:sqlite
//
// Deliveries survive termination here. A record holds file paths inside the
// app's own storage, upload ids and text the person chose to send. It never
// holds a credential, and it is cleared with the account (local-db.ts).
import type { Delivery } from './model'

export type DeliveryDatabase = {
  getAllAsync<T>(sql: string, params: (string | number)[]): Promise<T[]>
  runAsync(sql: string, params: (string | number)[]): Promise<unknown>
}

export type DeliveryStore = {
  all(): Promise<Delivery[]>
  save(delivery: Delivery): Promise<void>
  remove(id: string): Promise<void>
}

export function createDeliveryStore(database: DeliveryDatabase): DeliveryStore {
  return {
    async all() {
      const rows = await database.getAllAsync<{ body: string }>(
        'SELECT body FROM intake_delivery ORDER BY updated_at DESC',
        [],
      )
      return rows.map((row) => JSON.parse(row.body) as Delivery)
    },
    async save(delivery) {
      await database.runAsync(
        'INSERT OR REPLACE INTO intake_delivery (id, body, updated_at) VALUES (?, ?, ?)',
        [delivery.id, JSON.stringify(delivery), delivery.updatedAtMs],
      )
    },
    async remove(id) {
      await database.runAsync('DELETE FROM intake_delivery WHERE id = ?', [id])
    },
  }
}
