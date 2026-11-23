/**
 * Server-Sent Events (SSE) helpers.
 *
 * Why (for learners): SSE is a one-way stream from server to browser over a
 * normal HTTP response. Each message looks like:
 *
 *     event: milestone
 *     data: {"index":0,"milestone":{…}}
 *     <blank line>
 *
 * Headers matter:
 *   - `Cache-Control: no-cache, no-transform` stops caches and compressing
 *     proxies from buffering the stream (no-transform = "don't gzip/alter it").
 *   - `X-Accel-Buffering: no` tells nginx-style proxies not to buffer.
 *   - `flushHeaders()` sends the headers immediately so the browser knows the
 *     stream is open before the first event.
 * A comment line (starting with ":") every 15 s keeps idle connections alive
 * through proxies and load balancers that close silent connections.
 */
import type { Response } from 'express';

export interface SseChannel<E extends { event: string; data: unknown }> {
  send(e: E): void;
  readonly closed: boolean;
  close(): void;
}

export function openSse<E extends { event: string; data: unknown }>(
  res: Response,
  opts: { keepAliveMs: number },
): SseChannel<E> {
  let closed = false;
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  // A first comment lets some proxies commit to streaming mode immediately.
  res.write(': stream open\n\n');

  const keepAlive = setInterval(() => {
    if (!closed && !res.writableEnded) res.write(': keepalive\n\n');
  }, opts.keepAliveMs);
  keepAlive.unref?.();

  const stop = () => {
    closed = true;
    clearInterval(keepAlive);
  };
  res.on('close', stop);

  return {
    get closed() {
      return closed || res.writableEnded || res.destroyed;
    },
    send(e) {
      if (closed || res.writableEnded || res.destroyed) return;
      // JSON.stringify never emits raw newlines, so one `data:` line is always enough.
      res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    },
    close() {
      stop();
      if (!res.writableEnded) res.end();
    },
  };
}
