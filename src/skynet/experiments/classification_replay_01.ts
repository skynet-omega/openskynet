import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeSkynetRuntimeGatewayEvent,
  SkynetRuntimeLiveObservation,
} from "../runtime-observer/live-event-normalizer.js";
import { harvestSkynetRuntimeLiveFailures } from "../runtime-observer/live-failure-harvester.js";

async function runClassificationReplayExperiment() {
  const workspaceRoot = process.cwd();
  const sessionKey = "agent:openskynet:darochin-pc";
  const jsonlPath = path.join(
    workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${sessionKey.replace(/[^a-zA-Z0-9._-]+/g, "_")}-runtime-observer-live-01.jsonl`,
  );

  console.log(`Replaying classification on: ${jsonlPath}`);

  try {
    const raw = await fs.readFile(jsonlPath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const observations: SkynetRuntimeLiveObservation[] = [];

    for (const line of lines) {
      const rawEvent = JSON.parse(line);
      // We re-normalize to trigger the updated classification logic
      // We simulate a gateway frame structure as expected by normalizeSkynetRuntimeGatewayEvent
      const frame = {
        type: "event" as const,
        event: rawEvent.event,
        payload: {
          sessionKey: rawEvent.sessionKey,
          runId: rawEvent.runId,
          stream: rawEvent.stream,
          data: {
            phase: rawEvent.phase,
            text: rawEvent.textPreview, // Re-inject text preview as data.text for re-normalization
            isError: rawEvent.isError,
            status: rawEvent.status,
            toolName: rawEvent.toolName,
          },
        },
      };

      const normalized = normalizeSkynetRuntimeGatewayEvent(frame as any);
      if (normalized) {
        observations.push(normalized);
      }
    }

    const harvested = harvestSkynetRuntimeLiveFailures({ observations });

    console.log("--- Classification Replay Results ---");
    console.log(`Events reprocessed: ${observations.length}`);
    console.log(`Lifecycle errors found: ${harvested.lifecycleErrors}`);
    console.log(`Classified lifecycle errors: ${harvested.classifiedLifecycleErrors}`);
    console.log(`Tool errors found: ${harvested.toolErrors}`);
    console.log(`Classified tool errors: ${harvested.classifiedToolErrors}`);
    console.log(`Coverage: ${harvested.classificationCoverage.toFixed(2)}`);

    if (harvested.recentFailures.length > 0) {
      console.log("\nTop Classified Failures:");
      harvested.recentFailures.forEach((f) => {
        console.log(`- [${f.failureDomain}/${f.failureClass}] ${f.textPreview}`);
      });
    }

    // Write artifact
    const artifactPath = path.join(
      workspaceRoot,
      "src/skynet/artifacts/failure-classification-replay.json",
    );
    await fs.writeFile(artifactPath, JSON.stringify(harvested, null, 2));
    console.log(`\nArtifact saved to: ${artifactPath}`);
  } catch (error) {
    console.error("Experiment failed:", error);
  }
}

runClassificationReplayExperiment();
