import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data in dependency order
  await prisma.alertRule.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.revokedToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.chain.deleteMany();

  // ── 1. Chain entry for Solana ──
  const solanaChain = await prisma.chain.create({
    data: {
      name: "Solana",
      rpcUrl: "https://api.devnet.solana.com",
    },
  });
  console.log(`  ✅ Chain: ${solanaChain.name} (${solanaChain.id})`);

  // ── 2. Test user with JWT-compatible credentials ──
  const passwordHash = await bcrypt.hash("testpassword123", 10);
  const testUser = await prisma.user.create({
    data: {
      email: "test@argusmonitor.io",
      passwordHash,
    },
  });
  console.log(`  ✅ User: ${testUser.email} (${testUser.id})`);
  console.log(`     Password: testpassword123`);

  // ── 3. Three Solana wallet addresses (devnet, no real funds) ──
  const walletAddresses = [
    "Devnet111111111111111111111111111111111111111", // devnet vanity address
    "Devnet222222222222222222222222222222222222222",
    "Devnet333333333333333333333333333333333333333",
  ];

  const wallets = [];
  for (const address of walletAddresses) {
    const wallet = await prisma.wallet.create({
      data: {
        address,
        userId: testUser.id,
        chain: "SOLANA",
      },
    });
    wallets.push(wallet);
    console.log(`  ✅ Wallet: ${wallet.address} (${wallet.id})`);
  }

  // ── 4. Alert rules ──
  // large_tx: threshold 1 SOL (1_000_000_000 lamports)
  const largeTxRule = await prisma.alertRule.create({
    data: {
      userId: testUser.id,
      walletId: wallets[0].id,
      chain: "SOLANA",
      type: "token_volume",
      threshold: "1000000000", // 1 SOL in lamports
    },
  });
  console.log(
    `  ✅ AlertRule: ${largeTxRule.type} (threshold: ${largeTxRule.threshold} lamports)`,
  );

  // balance_change: no threshold needed (any change triggers)
  const balanceChangeRule = await prisma.alertRule.create({
    data: {
      userId: testUser.id,
      walletId: wallets[1].id,
      chain: "SOLANA",
      type: "balance_low",
      threshold: "100000000",
    },
  });
  console.log(`  ✅ AlertRule: ${balanceChangeRule.type}`);

  console.log("\n🎉 Seed complete!");
  console.log("──────────────────────────────────────");
  console.log("Login credentials:");
  console.log("  Email:    test@argusmonitor.io");
  console.log("  Password: testpassword123");
  console.log("──────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
