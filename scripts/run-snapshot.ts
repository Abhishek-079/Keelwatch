import "./env";
import { runSnapshot } from "../lib/snapshot";

runSnapshot()
  .then((s) => {
    console.log(JSON.stringify(s, null, 2));
    console.log("✅ Snapshot finished.");
  })
  .catch((e) => {
    console.error("❌ Snapshot failed:", e.message);
    process.exit(1);
  });
