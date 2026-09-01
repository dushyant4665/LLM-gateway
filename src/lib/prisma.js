const { PrismaClient } = require('@prisma/client');

// Single shared instance — avoids opening too many DB connections
const prisma = new PrismaClient();

module.exports = prisma;
