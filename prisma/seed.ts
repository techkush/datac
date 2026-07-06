// Seeds the single owner account, default settings, and starter categories.
// Idempotent: safe to run repeatedly. Reads OWNER_* from the environment.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/index.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: "Work", color: "#38bdf8" },
  { name: "Personal", color: "#34d399" },
  { name: "Focus", color: "#a78bfa" },
  { name: "Errands", color: "#fbbf24" },
];

async function main() {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  const name = process.env.OWNER_NAME || "Owner";

  if (!email || !password) {
    throw new Error("OWNER_EMAIL and OWNER_PASSWORD must be set in .env");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, passwordHash, role: "OWNER" },
  });

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  for (const c of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { userId_name: { userId: user.id, name: c.name } },
      update: {},
      create: { userId: user.id, name: c.name, color: c.color },
    });
  }

  console.log(`Seeded owner ${email} (${user.id}) with default categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
