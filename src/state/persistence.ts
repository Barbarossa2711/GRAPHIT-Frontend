/**
 * Persistence via JupyterLab's IStateDB.
 *
 * IStateDB is per workspace and survives reloads and kernel restarts. localStorage is
 * per origin, so two workspaces would overwrite each other's chat.
 */

import { IStateDB } from '@jupyterlab/statedb';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { ChatScope, ClientQuestion } from '../api/types';
import { AnswerMap } from '../quiz/answerModel';
import { ChatEntry, MainTab } from './types';

export const KEY_CHAT = 'graphit:chat';
export const KEY_QUIZ = 'graphit:quiz';
export const KEY_UI = 'graphit:ui';
export const KEY_TOUR = 'graphit:tour';

/** The full history is resent with every chat request, so it must stay bounded. */
export const MAX_CHAT_MESSAGES = 60;
export const MAX_CHAT_CHARS = 200_000;

/** A persisted quiz older than this is discarded on restore. */
export const QUIZ_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface PersistedChat {
  messages: ChatEntry[];
  scope: ChatScope | null;
  updatedAt: number;
  /** Missing in payloads written before session ids existed. */
  sessionId?: string;
}

export interface PersistedQuiz {
  quizId: string;
  conceptId: string;
  conceptName: string;
  questions: ClientQuestion[];
  answers: AnswerMap;
  startedAt: number;
  submitAttempted: boolean;
}

export interface PersistedUi {
  expanded: string[];
  activeTab: MainTab;
  selectionId: string | null;
  /** Missing in payloads written before the splitter existed. */
  splitRatio?: number;
}

/**
 * Whether the tour offer is still shown. Kept under its own key because the UI payload
 * is rewritten on every tab switch and splitter drag.
 */
export interface PersistedTour {
  dismissed: boolean;
}

export class Persistence {
  private readonly timers = new Map<string, number>();

  /**
   * Creates the persistence layer.
   * @param db: The state database, or null to disable persistence
   */
  constructor(private readonly db: IStateDB | null) {}

  /**
   * Whether a state database is available.
   * @returns: True if persistence is enabled
   */
  get enabled(): boolean {
    return this.db !== null;
  }

  /**
   * Loads a value from the state database.
   * @param key: Storage key
   * @returns: The stored value, or null if missing or unreadable
   */
  async load<T>(key: string): Promise<T | null> {
    if (!this.db) {
      return null;
    }
    try {
      const value = await this.db.fetch(key);
      return (value as unknown as T) ?? null;
    } catch (err) {
      console.warn('[GRAPHIT] IStateDB fetch failed for', key, err);
      return null;
    }
  }

  /**
   * Debounced write; successive calls for the same key collapse into one.
   * @param key: Storage key
   * @param value: Value to store
   * @param debounceMs: Delay before writing; 0 writes immediately
   */
  save(key: string, value: unknown, debounceMs = 0): void {
    if (!this.db) {
      return;
    }
    const existing = this.timers.get(key);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    if (debounceMs <= 0) {
      void this.write(key, value);
      return;
    }
    const handle = window.setTimeout(() => {
      this.timers.delete(key);
      void this.write(key, value);
    }, debounceMs);
    this.timers.set(key, handle);
  }

  /**
   * Writes immediately and cancels any pending debounce. Used on widget close.
   * @param key: Storage key
   * @param value: Value to store
   */
  async flush(key: string, value: unknown): Promise<void> {
    const existing = this.timers.get(key);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      this.timers.delete(key);
    }
    await this.write(key, value);
  }

  /**
   * Removes a value and cancels any pending write for it.
   * @param key: Storage key
   */
  async remove(key: string): Promise<void> {
    if (!this.db) {
      return;
    }
    const existing = this.timers.get(key);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      this.timers.delete(key);
    }
    try {
      await this.db.remove(key);
    } catch (err) {
      console.warn('[GRAPHIT] IStateDB remove failed for', key, err);
    }
  }

  /**
   * Cancels all pending writes.
   */
  dispose(): void {
    for (const handle of this.timers.values()) {
      window.clearTimeout(handle);
    }
    this.timers.clear();
  }

  /**
   * Writes a value to the state database, logging failures.
   * @param key: Storage key
   * @param value: Value to store
   */
  private async write(key: string, value: unknown): Promise<void> {
    if (!this.db) {
      return;
    }
    try {
      await this.db.save(key, value as ReadonlyPartialJSONObject);
    } catch (err) {
      console.warn('[GRAPHIT] IStateDB save failed for', key, err);
    }
  }
}

/**
 * Drops the oldest messages until the history fits both caps.
 * @param messages: Chat history
 * @returns: The trimmed history and whether anything was dropped, so the UI can show
 *   a marker
 */
export function trimHistory(messages: ChatEntry[]): {
  messages: ChatEntry[];
  trimmed: boolean;
} {
  let out = messages;
  let trimmed = false;

  if (out.length > MAX_CHAT_MESSAGES) {
    out = out.slice(out.length - MAX_CHAT_MESSAGES);
    trimmed = true;
  }

  let chars = out.reduce((sum, m) => sum + m.content.length, 0);
  while (chars > MAX_CHAT_CHARS && out.length > 2) {
    chars -= out[0].content.length;
    out = out.slice(1);
    trimmed = true;
  }

  return { messages: out, trimmed };
}

/**
 * Checks whether a persisted quiz is too old to restore.
 * @param startedAt: Start time of the quiz in milliseconds
 * @returns: True if the quiz exceeds QUIZ_MAX_AGE_MS
 */
export function isQuizStale(startedAt: number): boolean {
  return Date.now() - startedAt > QUIZ_MAX_AGE_MS;
}
