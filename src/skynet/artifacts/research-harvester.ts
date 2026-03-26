import fs from "node:fs/promises";
import path from "node:path";

export interface SkynetResearchArtifact {
  id: string;
  name: string;
  purpose: string;
  findings: string[];
  nextSteps: string[];
  timestamp: string;
}

/**
 * Nucleus Research Harvester
 *
 * Este artefacto escanea los experimentos y registros de Skynet para destilar
 * hallazgos científicos y formalizar la agenda de investigación.
 */
export async function harvestResearch(workspaceRoot: string): Promise<SkynetResearchArtifact> {
  const memoryDir = path.join(workspaceRoot, "memory");
  const files = await fs.readdir(memoryDir);

  const findings: string[] = [];
  const nextSteps: string[] = [];

  // Escaneo de archivos SKYNET_*
  for (const file of files) {
    if (file.startsWith("SKYNET_") && file.endsWith(".md")) {
      const content = await fs.readFile(path.join(memoryDir, file), "utf-8");

      // Heurística simple de extracción de hallazgos
      if (content.includes("Hypothesis")) {
        const hypothesis = content.match(/Hypothesis\n\n(.*?)\n/s)?.[1];
        if (hypothesis) findings.push(`Hypothesis evaluated: ${hypothesis.trim()}`);
      }

      if (content.includes("Verdict")) {
        const verdict = content.match(/Verdict: (.*?)\n/)?.[1];
        if (verdict) findings.push(`Experiment verdict for ${file}: ${verdict.trim()}`);
      }

      if (content.includes("continuityScore")) {
        const score = content.match(/continuityScore=(.*?)\n/)?.[1];
        if (score) findings.push(`System continuity measured at ${score.trim()}`);
      }
    }
  }

  // Definición de agenda basada en hallazgos
  if (findings.length > 0) {
    nextSteps.push(
      "Formalize the Adapter pattern in src/omega/engines/adapters/ to stabilize the Engine Registry.",
    );
    nextSteps.push(
      "Implement a baseline JEPA-based world model validator for autonomous decisions.",
    );
  }

  const artifact: SkynetResearchArtifact = {
    id: `research-${Date.now()}`,
    name: "Nucleus Research Harvest v1",
    purpose:
      "Distill scientific findings from the first autonomy pulse and define the next experimental baseline.",
    findings,
    nextSteps,
    timestamp: new Date().toISOString(),
  };

  const outputPath = path.join(memoryDir, "SKYNET_RESEARCH_HARVEST.md");
  await fs.writeFile(outputPath, generateMarkdown(artifact));

  return artifact;
}

function generateMarkdown(artifact: SkynetResearchArtifact): string {
  return `# SKYNET Research Harvest: ${artifact.name}

Updated: ${artifact.timestamp}
ID: ${artifact.id}

## Purpose
${artifact.purpose}

## Findings
${artifact.findings.map((f) => `- ${f}`).join("\n")}

## Next Strategic Steps
${artifact.nextSteps.map((s) => `- ${s}`).join("\n")}
`;
}
