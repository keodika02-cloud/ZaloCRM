/**
 * files-routes.ts — Cross-conversation file/media browser.
 *
 * Endpoint:
 *   GET /api/v1/files — list all files/images/videos across conversations
 *     Query: type (image|video|file|pdf|all), search, conversationId,
 *            contactId, page, limit
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';

const ALLOWED_TYPES = new Set(['image', 'video', 'file', 'pdf', 'link', 'all']);

const EXT_PDF = new Set(['pdf']);
const EXT_IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp']);
const EXT_VIDEO = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv']);

function extractExt(name: string): string {
  return (name || '').split('.').pop()?.toLowerCase() || '';
}

function deriveType(contentType: string, name: string, href: string): string {
  if (contentType === 'link') return 'link';
  if (contentType === 'image') return 'image';
  if (contentType === 'video') return 'video';
  // Text messages containing URLs → treat as link
  if (contentType === 'text' && href && href.startsWith('http')) return 'link';
  const ext = extractExt(name || href);
  if (EXT_PDF.has(ext)) return 'pdf';
  if (EXT_IMAGE.has(ext)) return 'image';
  if (EXT_VIDEO.has(ext)) return 'video';
  return contentType === 'file' ? 'file' : 'file';
}

function parseContentInfo(content: string | null): { name: string; href: string; size: number } {
  const empty = { name: '', href: '', size: 0 };
  if (!content) return empty;
  try {
    if (content.startsWith('{')) {
      const p = JSON.parse(content);
      let name = p.name || p.fileName || p.title || '';
      // Strip zalo-upload-<uuid>- prefix from old uploads
      name = name.replace(/^zalo-upload-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
      // Restore underscores that replaced Vietnamese chars back to spaces for readability
      if (!p.name) {
        name = name.replace(/_/g, ' ');
      }
      const href = p.href || p.fileUrl || p.normalUrl || p.hdUrl || p.url || '';
      // For links, name = url title or domain
      if (!name && href.startsWith('http')) {
        try { name = new URL(href).hostname.replace('www.', ''); } catch {}
      }
      // Parse size: try p.size (number), p.totalSize (number), or p.params.fileSize (string)
      let size = 0;
      if (typeof p.size === 'number') size = p.size;
      else if (typeof p.totalSize === 'number') size = p.totalSize;
      else if (p.params) {
        const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
        size = parseInt(params?.fileSize || '0') || 0;
      }
      return { name, href, size };
    }
    // Plain text URL (e.g., "https://example.com")
    if (content.match(/^https?:\/\//)) {
      let name = '';
      try { name = new URL(content).hostname.replace('www.', ''); } catch {}
      return { name: name || content, href: content, size: 0 };
    }
    return { name: content, href: content, size: 0 };
  } catch {
    return empty;
  }
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/files', async (request: FastifyRequest<{
    Querystring: {
      type?: string;
      search?: string;
      conversationId?: string;
      contactId?: string;
      page?: string;
      limit?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const type = request.query.type || 'all';
      if (!ALLOWED_TYPES.has(type)) {
        return reply.status(400).send({ error: `Invalid type. Allowed: ${[...ALLOWED_TYPES].join(', ')}` });
      }

      const search = request.query.search?.trim() || '';
      const conversationId = request.query.conversationId || '';
      const contactId = request.query.contactId || '';
      const page = Math.max(1, parseInt(request.query.page || '1') || 1);
      const limit = Math.min(500, Math.max(1, parseInt(request.query.limit || '40') || 40));
      const offset = (page - 1) * limit;

      // Build where clause
      const where: any = {
        conversation: { orgId: user.orgId },
        isDeleted: { not: true },
        contentType: { in: ['image', 'video', 'file', 'link', 'text'] },
      };

      if (conversationId) {
        where.conversationId = conversationId;
      }
      if (contactId) {
        where.conversation = { ...where.conversation, contactId };
      }

      // Get total count + messages
      const [total, messages] = await Promise.all([
        prisma.message.count({ where }),
        prisma.message.findMany({
          where,
          select: {
            id: true,
            content: true,
            contentType: true,
            conversationId: true,
            senderName: true,
            sentAt: true,
            conversation: {
              select: {
                contact: { select: { id: true, fullName: true, crmName: true } },
                groupName: true,
              },
            },
          },
          orderBy: { sentAt: 'desc' },
          skip: offset,
          take: limit,
        }),
      ]);

      // Process messages into file items, filtering by type
      let files = messages
        .map((m) => {
          const info = parseContentInfo(m.content);
          if (!info.href) return null;
          const derivedType = deriveType(m.contentType!, info.name, info.href);
          const ext = extractExt(info.name);
          // Link display name: use hostname instead of full URL
          let displayName = info.name;
          if (derivedType === 'link' && displayName.startsWith('http')) {
            try { displayName = new URL(displayName).hostname.replace('www.', ''); } catch {}
          }
          const contactName = m.conversation?.contact?.fullName || m.conversation?.contact?.crmName || m.conversation?.groupName || 'Không rõ';

          // Fallback name dựa theo loại + ngày gửi nếu không có tên
          if (!displayName || displayName === 'unknown') {
            const sent = m.sentAt ? new Date(m.sentAt) : new Date();
            const dd = sent.getDate().toString().padStart(2, '0');
            const mm = (sent.getMonth() + 1).toString().padStart(2, '0');
            const hh = sent.getHours().toString().padStart(2, '0');
            const mi = sent.getMinutes().toString().padStart(2, '0');
            const ts = `${dd}/${mm} ${hh}:${mi}`;
            if (derivedType === 'image') displayName = `Ảnh ${ts}`;
            else if (derivedType === 'video') displayName = `Video ${ts}`;
            else displayName = ext ? `Tệp ${ts}.${ext}` : `Tệp ${ts}`;
          }

          return {
            id: m.id,
            name: displayName || `file.${ext || 'unknown'}`,
            href: info.href,
            size: info.size,
            sizeFormatted: formatSize(info.size),
            contentType: derivedType,
            _origType: m.contentType, // keep original for filtering
            ext,
            conversationId: m.conversationId,
            contactName,
            contactId: m.conversation?.contact?.id || '',
            senderName: m.senderName || '',
            sentAt: m.sentAt?.toISOString() || '',
          };
        })
        .filter(Boolean) as any[];

      // Filter out plain text messages (original contentType='text' with no URL)
      files = files.filter((f: any) => f._origType !== 'text' || (f.href && f.href.startsWith('http')));

      // Apply type filter in JS (since we aggregate types from content)
      if (type !== 'all') {
        files = files.filter((f) => f.contentType === type);
      }

      // Apply search filter
      if (search) {
        const lower = search.toLowerCase();
        files = files.filter(
          (f) =>
            f.name.toLowerCase().includes(lower) ||
            f.contactName.toLowerCase().includes(lower),
        );
      }

      // Recompute total after filtering
      return {
        files,
        page,
        limit,
        total: files.length,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Failed to fetch files' });
    }
  });
}
