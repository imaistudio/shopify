/**
 * Cleans app-specific data from the database (ApiKey, ImaiJob).
 * Session data is preserved so shops stay authenticated.
 * For a full reset (including sessions), run: npx prisma migrate reset
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  let deletedKeys = 0;
  let deletedJobs = 0;
  try {
    const keys = await prisma.apiKey.deleteMany({});
    deletedKeys = keys.count;
  } catch (e) {
    if (e.code !== "P2021") throw e;
    console.warn("ApiKey table not found (run setup first).");
  }
  try {
    const jobs = await prisma.imaiJob.deleteMany({});
    deletedJobs = jobs.count;
  } catch (e) {
    if (e.code !== "P2021") throw e;
    console.warn("ImaiJob table not found (run setup first).");
  }
  console.log(
    `Cleaned database: removed ${deletedKeys} API key(s), ${deletedJobs} job(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
