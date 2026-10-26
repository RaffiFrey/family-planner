import { createConnection } from 'node:net';

export type ScanResult = { clean: true } | { clean: false; signature: string };

/** Scans a buffer with clamd using the INSTREAM protocol. */
export function scanWithClamd(
  host: string,
  port: number,
  data: Buffer,
  timeoutMs = 60_000,
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port, autoSelectFamily: true });
    const chunks: Buffer[] = [];
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error('clamd timeout')));
    socket.on('error', reject);
    socket.on('data', (c: Buffer) => chunks.push(c));
    socket.on('end', () => {
      const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
      if (reply.endsWith('OK')) resolve({ clean: true });
      else if (reply.endsWith('FOUND'))
        resolve({
          clean: false,
          signature: reply.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, ''),
        });
      else reject(new Error(`Unexpected clamd reply: ${reply}`));
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      const size = 64 * 1024;
      for (let i = 0; i < data.length; i += size) {
        const chunk = data.subarray(i, i + size);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        socket.write(len);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
  });
}

/** True when clamd answers PING with PONG (used for readiness checks). */
export function pingClamd(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, autoSelectFamily: true });
    let reply = '';
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.on('data', (c: Buffer) => (reply += c.toString('utf8')));
    socket.on('end', () => {
      resolve(reply.replace(/\0/g, '').trim() === 'PONG');
    });
    socket.on('connect', () => socket.end('zPING\0'));
  });
}
