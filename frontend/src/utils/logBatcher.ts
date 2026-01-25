// 日志批量上报用于合并埋点与前端日志请求。
import { postLogEvents, LogEvent } from '../api/logCenter';
import { uuid } from './uuid';

const SESSION_KEY = 'rbac_session_id';
const SOURCE = 'web';
const MAX_BATCH = 20;
const FLUSH_INTERVAL = 5000;

let queue: LogEvent[] = [];
let timer: number | null = null;

export const getSessionId = () => {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = uuid();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
};

export const enqueueLogEvent = (event: LogEvent) => {
  const payload: LogEvent = {
    ...event,
    createdAt: event.createdAt ?? new Date().toISOString()
  };
  queue.push(payload);
  if (queue.length >= MAX_BATCH) {
    flushQueue();
    return;
  }
  scheduleFlush();
};

const scheduleFlush = () => {
  if (timer) {
    return;
  }
  timer = window.setTimeout(() => {
    flushQueue();
  }, FLUSH_INTERVAL);
};

export const flushQueue = async () => {
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) {
    return;
  }
  const batch = queue;
  queue = [];
  try {
    await postLogEvents({
      source: SOURCE,
      sessionId: getSessionId(),
      events: batch
    });
  } catch (error) {
    queue = batch.concat(queue);
  }
};
