import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';

// SHA-256 of the commercial license key. DO NOT inline the plaintext key.
const EXPECTED_HASH_HEX = 'd6866658cdd1c1b5766159f986dcba98a1369e4cb95fd141577d043286acca5f';

function isLicensed(): boolean {
  const key = process.env.FRIENDS;
  if (!key || key.length < 8) return false;

  const actual = createHash('sha256').update(key).digest();
  const expected = Buffer.from(EXPECTED_HASH_HEX, 'hex');
  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

export async function brandingRoutes(app: FastifyInstance) {
  app.get('/api/v1/branding', async () => {
    return { hideAttribution: isLicensed() };
  });
}
