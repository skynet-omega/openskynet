import { BifasicClient } from "./src/omega/bifasic-client.js";

async function run() {
  const client = new BifasicClient();

  // Vamos a inyectar energía hasta lograr un spike (Cristalización)
  for (let i = 0; i < 5; i++) {
    console.log(`\n--- Tick ${i} ---`);
    if (i < 2) {
      await client.injectEnergy([42], 0.9);
    }
    const res = await client.step();
    console.log(res);
  }
}

run().catch(console.error);
