/**
 * offlineQueue — persistent offline check-in queue
 *
 * Docs: docs/superpowers/plans/2026-07-19-offline-mode.md, Phase B (Task B2)
 *
 * Public API:
 *   enqueueCheckin(payload) — persist a pending check-in for later sync
 *   getQueue()              — read the persisted queue (for UI counters)
 *   flushQueue()            — sequentially attempt to sync pending items
 *   subscribe(listener)     — be notified whenever the persisted queue changes
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import apiClient from './apiClient';
import { STORAGE_KEYS, OFFLINE_CONFIG, ENDPOINTS } from '../config/endpoints';

let listeners = [];
let isFlushing = false;

function notify(queue) {
  listeners.forEach((listener) => {
    try {
      listener(queue);
    } catch (e) {
      // Never let a bad listener break the queue pipeline
    }
  });
}

async function readQueue() {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  notify(queue);
}

export async function getQueue() {
  return readQueue();
}

export async function enqueueCheckin(payload) {
  const queue = await readQueue();

  if (queue.length >= OFFLINE_CONFIG.MAX_QUEUE_SIZE) {
    throw new Error('OFFLINE_QUEUE_FULL');
  }

  const item = {
    client_uuid: Crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    is_offline: true,
    status: 'pending',
    ...payload,
  };

  const newQueue = [...queue, item];
  await writeQueue(newQueue);
  return item;
}

export function subscribe(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function isTooOld(item) {
  const ageMs = Date.now() - new Date(item.occurred_at).getTime();
  return ageMs > OFFLINE_CONFIG.MAX_AGE_HOURS * 3600 * 1000;
}

function sortFifo(queue) {
  return [...queue].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
}

export async function flushQueue() {
  if (isFlushing) {
    const current = await readQueue();
    const remaining = current.filter((i) => i.status === 'pending').length;
    return { synced: 0, failed: 0, remaining };
  }

  isFlushing = true;
  try {
    let queue = await readQueue();
    const pendingOrdered = sortFifo(queue.filter((i) => i.status === 'pending'));

    let synced = 0;
    let failed = 0;
    let networkErrorHit = false;

    for (let idx = 0; idx < pendingOrdered.length; idx++) {
      const item = pendingOrdered[idx];

      if (networkErrorHit) break;

      if (idx > 0) {
        await new Promise((resolve) => setTimeout(resolve, OFFLINE_CONFIG.FLUSH_DELAY_MS));
      }

      if (isTooOld(item)) {
        queue = queue.map((q) => (q.client_uuid === item.client_uuid ? { ...q, status: 'failed' } : q));
        failed += 1;
        continue;
      }

      try {
        await apiClient.post(ENDPOINTS.CHECKINS_POST, item);
        // Success (2xx) — includes deduplicated:true responses
        queue = queue.filter((q) => q.client_uuid !== item.client_uuid);
        synced += 1;
      } catch (error) {
        if (error && error.response) {
          // Definitive application-level rejection — mark failed, keep going
          queue = queue.map((q) => (q.client_uuid === item.client_uuid ? { ...q, status: 'failed' } : q));
          failed += 1;
        } else {
          // Network/timeout error — stop processing entirely, leave remaining items untouched
          networkErrorHit = true;
        }
      }
    }

    await writeQueue(queue);

    const remaining = queue.filter((q) => q.status === 'pending').length;
    return { synced, failed, remaining };
  } finally {
    isFlushing = false;
  }
}

export default { enqueueCheckin, getQueue, flushQueue, subscribe };
