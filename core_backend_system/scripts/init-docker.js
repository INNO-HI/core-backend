const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

// Use the singleton structure or new client
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔄 Checking database state...');
    
    // Check if any users exist to determine if seeding is needed
    // Assuming 'User' table is populated by seed
    const userCount = await prisma.user.count();

    if (userCount === 0) {
      console.log('py  Database appears empty. Running seed...');
      execSync('node prisma/seed.js', { stdio: 'inherit' });
      console.log('✅ Seeding complete.');
    } else {
      console.log(`ℹ️  Database already contains ${userCount} users. Skipping seed.`);
    }
  } catch (error) {
    console.error('❌ Initialization check failed:', error);
    // Do not exit with error, let the server try to start anyway
  } finally {
    await prisma.$disconnect();
  }
}

main();
