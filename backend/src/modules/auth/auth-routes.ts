/**
 * Auth routes — setup, login, and profile endpoints.
 * Registered as a Fastify plugin via app.register(authRoutes).
 */
import type { FastifyInstance } from 'fastify';
import '@fastify/cookie';
import { authMiddleware } from './auth-middleware.js';
import {
  checkSetupStatus,
  setup,
  login,
  getProfile,
  getRecoveryUser,
  resetPassword,
} from './auth-service.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/setup/status — check if first-run setup is needed
  app.get('/api/v1/setup/status', async () => {
    return checkSetupStatus();
  });

  // POST /api/v1/setup — create org + owner user, return JWT
  app.post<{
    Body: { orgName: string; fullName: string; email: string; password: string };
  }>('/api/v1/setup', async (request, reply) => {
    const { orgName, fullName, email, password } = request.body;
    if (!orgName || !fullName || !email || !password) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }
    const payload = await setup(orgName, fullName, email, password);
    const token = app.jwt.sign(payload, { expiresIn: '7d' });
    const proto = request.headers['x-forwarded-proto'] || request.protocol;
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: proto === 'https',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });
    return { user: payload };
  });

  // POST /api/v1/auth/login — verify credentials, return JWT
  app.post<{
    Body: { email: string; password: string };
  }>('/api/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body;
    if (!email || !password) {
      return reply.status(400).send({ error: 'Missing email or password' });
    }
    const payload = await login(email, password);
    const token = app.jwt.sign(payload, { expiresIn: '7d' });
    const proto = request.headers['x-forwarded-proto'] || request.protocol;
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: proto === 'https',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });
    return { user: payload };
  });

  // POST /api/v1/auth/logout — clear HttpOnly cookie
  app.post('/api/v1/auth/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { success: true };
  });

  // POST /api/v1/auth/forgot-password
  app.post<{ Body: { email: string } }>('/api/v1/auth/forgot-password', async (request, reply) => {
    const { email } = request.body;
    if (!email) return reply.status(400).send({ error: 'Missing email' });

    const user = await getRecoveryUser(email);
    if (!user) {
      // Prevent user enumeration by always returning success
      return { message: 'If an account exists, a recovery link has been sent.' };
    }

    const token = app.jwt.sign({ id: user.id, type: 'reset' } as any, { expiresIn: '15m' });
    // In production, send this via email. For now, we return it to the client for dev/testing.
    return { message: 'If an account exists, a recovery link has been sent.', token };
  });

  // POST /api/v1/auth/reset-password
  app.post<{ Body: { token: string; password: string } }>('/api/v1/auth/reset-password', async (request, reply) => {
    const { token, password } = request.body;
    if (!token || !password) return reply.status(400).send({ error: 'Missing token or password' });

    try {
      const decoded = app.jwt.verify(token) as any;
      if (decoded.type !== 'reset' || !decoded.id) throw new Error('Invalid token type');
      
      await resetPassword(decoded.id, password);
      return { success: true };
    } catch {
      return reply.status(400).send({ error: 'Invalid or expired token' });
    }
  });

  // GET /api/v1/profile — return current user (requires auth)
  app.get('/api/v1/profile', { preHandler: authMiddleware }, async (request) => {
    const user = request.user as { id: string; email: string; role: string; orgId: string };
    return getProfile(user.id);
  });
}
