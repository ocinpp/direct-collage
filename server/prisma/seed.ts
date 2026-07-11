import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { env } from "../src/env.js";

const prisma = new PrismaClient();

/**
 * Seed: one admin (credentials from env) + one demo wall (slug: "demo").
 *
 * Idempotent: upserts on the unique email / slug, so re-running is safe.
 */
async function main() {
  const passwordHash = await bcrypt.hash(env.seedAdminPassword, 10);

  await prisma.admin.upsert({
    where: { email: env.seedAdminEmail },
    update: { passwordHash }, // keep seeded pw in sync with env on re-seed
    create: { email: env.seedAdminEmail, passwordHash },
  });

  const wall = await prisma.wall.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "Demo Wall",
      title: "Demo Wall",
      status: "ACTIVE",
      aspectRatio: "1:1",
    },
  });

  console.log("Seed complete:");
  console.log(`  admin : ${env.seedAdminEmail}`);
  console.log(`  wall  : ${wall.slug} (${wall.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
