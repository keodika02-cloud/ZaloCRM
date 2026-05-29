import { prisma } from './shared/database/prisma-client.js';

async function main() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, fullName: true, email: true, role: true }
    });
    console.log('--- ALL USERS IN DB ---');
    console.log(users);

    const contactsCount = await prisma.contact.count();
    console.log('--- TOTAL CONTACTS ---', contactsCount);

    const assignedContacts = await prisma.contact.groupBy({
      by: ['assignedUserId'],
      _count: true,
    });
    console.log('--- CONTACTS BY ASSIGNED USER ---');
    console.log(assignedContacts);

    const conversations = await prisma.conversation.count();
    console.log('--- TOTAL CONVERSATIONS ---', conversations);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
main();
