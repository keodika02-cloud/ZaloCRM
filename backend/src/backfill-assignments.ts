import { prisma } from './shared/database/prisma-client.js';

async function main() {
  try {
    console.log('Starting contact assignment backfill...');
    const contacts = await prisma.contact.findMany({
      where: {
        assignedUserId: null,
        deletedAt: null,
      },
      include: {
        conversations: {
          select: {
            zaloAccount: {
              select: {
                ownerUserId: true,
              },
            },
          },
          orderBy: {
            lastMessageAt: 'desc',
          },
        },
        friends: {
          select: {
            zaloAccount: {
              select: {
                ownerUserId: true,
              },
            },
          },
        },
      },
    });

    console.log(`Found ${contacts.length} unassigned contacts.`);
    
    // Find the default owner (the first user with role 'owner')
    const defaultOwner = await prisma.user.findFirst({
      where: { role: 'owner' },
      select: { id: true },
    });
    console.log('Default owner user ID:', defaultOwner?.id || 'none');

    let updatedCount = 0;

    for (const contact of contacts) {
      let ownerUserId: string | null = contact.conversations?.[0]?.zaloAccount?.ownerUserId ?? null;
      
      // Fallback 1: check friends
      if (!ownerUserId) {
        ownerUserId = contact.friends?.[0]?.zaloAccount?.ownerUserId ?? null;
      }
      
      // Fallback 2: default owner
      if (!ownerUserId) {
        ownerUserId = defaultOwner?.id ?? null;
      }

      if (ownerUserId) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { assignedUserId: ownerUserId },
        });
        updatedCount++;
      }
    }

    console.log(`Successfully updated ${updatedCount} contacts.`);
  } catch (err) {
    console.error('Error during backfill:', err);
  } finally {
    process.exit(0);
  }
}

main();
