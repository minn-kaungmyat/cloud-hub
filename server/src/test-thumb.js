const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

async function run() {
  const file = await prisma.file.findFirst({
    where: { hasThumbnail: true },
    include: { cloudAccount: true }
  });

  if (!file) return console.log('No file');
  
  const token = jwt.sign({ id: file.cloudAccount.userId }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
  
  console.log('FileId:', file.id);
  const res = await fetch(`http://localhost:3000/api/files/${file.id}/thumbnail?token=${token}`, { redirect: 'manual' });
  console.log('Status:', res.status);
  console.log('Location:', res.headers.get('location'));
  const text = await res.text();
  console.log('Body:', text);
}

run().catch(console.error).finally(() => prisma.$disconnect());
