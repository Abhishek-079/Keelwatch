import "./env";
import { getSql, migrate } from "../lib/db";

async function main() {
  const sql = getSql();
  if (!sql) {
    console.error("❌ DATABASE_URL is not set. Add it to .env.local first (see README step 6).");
    process.exit(1);
  }
  await migrate(sql);
  console.log("✅ Database tables are ready.");
}
main().catch((e) => {
  console.error("❌ Database setup failed:", e.message);
  process.exit(1);
});
