import { BifasicClient } from "./src/omega/bifasic-client.js";

async function run() {
  const client = new BifasicClient();

  console.log("Pinging engine...");
  const ping = await client.ping();
  console.log(ping);

  console.log("Injecting energy into nodes [10, 42, 1023]...");
  await client.injectEnergy([10, 42, 1023], 0.8);

  console.log("Stepping engine...");
  const step1 = await client.step();
  console.log(step1);

  console.log("Injecting more energy...");
  await client.injectEnergy([42], 0.9);
  const step2 = await client.step();
  console.log(step2);
}

run().catch(console.error);
