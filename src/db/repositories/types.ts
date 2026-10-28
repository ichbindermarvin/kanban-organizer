import type { Board, Column, Settings, Task } from '@/features/tasks/models/schemas'

/**
 * Persistence boundary. UI and state code only talk to these interfaces, never to Dexie directly,
 * so a RemoteTaskRepository (cloud sync) can be added later without touching the UI.
 */
export interface TaskRepository {
  getAll(): Promise<Task[]>
  getById(id: string): Promise<Task | undefined>
  create(task: Task): Promise<void>
  update(task: Task): Promise<void>
  delete(id: string): Promise<void>
  /** Upserts several tasks atomically. */
  saveMany(tasks: Task[]): Promise<void>
}

export interface BoardRepository {
  getAll(): Promise<Board[]>
  saveMany(boards: Board[]): Promise<void>
}

export interface ColumnRepository {
  getAll(): Promise<Column[]>
  saveMany(columns: Column[]): Promise<void>
}

export interface SettingsRepository {
  get(): Promise<Settings | undefined>
  save(settings: Settings): Promise<void>
}

export interface DataSnapshot {
  boards: Board[]
  columns: Column[]
  tasks: Task[]
  settings?: Settings
}

export interface Repositories {
  tasks: TaskRepository
  boards: BoardRepository
  columns: ColumnRepository
  settings: SettingsRepository
  /** Loads everything in one read transaction. */
  loadAll(): Promise<DataSnapshot>
  /** Replaces all data in a single transaction (import). On failure nothing changes. */
  replaceAll(snapshot: DataSnapshot): Promise<void>
}
