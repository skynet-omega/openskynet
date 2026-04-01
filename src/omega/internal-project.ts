import fs from "node:fs/promises";
import path from "node:path";

export type OpenSkynetInternalProjectProfile = {
  key: string;
  name: string;
  role: string;
  mission: string;
  benchmarkPurpose: string;
  successCriteria: string[];
};

const DEFAULT_INTERNAL_PROJECT: OpenSkynetInternalProjectProfile = {
  key: "skynet",
  name: "Skynet",
  role: "Optional experimental self-improvement lab pursued by OpenSkyNet during free autonomous cycles.",
  mission:
    "Investigate ideas that might improve OpenSkyNet, then transfer only validated gains into the OpenSkyNet/Omega kernel.",
  benchmarkPurpose:
    "Measure whether OpenSkyNet can maintain, improve, and empirically advance a long-running internal research project without constant human prompting.",
  successCriteria: [
    "The project preserves continuity across autonomous cycles.",
    "The project produces runnable artifacts, measurements, or falsifiable findings.",
    "OpenSkyNet distinguishes platform maintenance from project progress.",
    "Validated findings can be transferred into the OpenSkyNet kernel without making the platform depend on src/skynet.",
    "The project can be replaced by another domain without code changes to the runtime spine.",
  ],
};

export function resolveInternalProjectConfigFile(workspaceRoot: string): string {
  return path.join(workspaceRoot, "INTERNAL_PROJECT.json");
}

export async function loadOpenSkynetInternalProjectProfile(
  workspaceRoot: string,
): Promise<OpenSkynetInternalProjectProfile> {
  const filePath = resolveInternalProjectConfigFile(workspaceRoot);
  try {
    const raw = JSON.parse(
      await fs.readFile(filePath, "utf-8"),
    ) as Partial<OpenSkynetInternalProjectProfile>;
    return {
      key:
        typeof raw.key === "string" && raw.key.trim()
          ? raw.key.trim()
          : DEFAULT_INTERNAL_PROJECT.key,
      name:
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name.trim()
          : DEFAULT_INTERNAL_PROJECT.name,
      role:
        typeof raw.role === "string" && raw.role.trim()
          ? raw.role.trim()
          : DEFAULT_INTERNAL_PROJECT.role,
      mission:
        typeof raw.mission === "string" && raw.mission.trim()
          ? raw.mission.trim()
          : DEFAULT_INTERNAL_PROJECT.mission,
      benchmarkPurpose:
        typeof raw.benchmarkPurpose === "string" && raw.benchmarkPurpose.trim()
          ? raw.benchmarkPurpose.trim()
          : DEFAULT_INTERNAL_PROJECT.benchmarkPurpose,
      successCriteria: Array.isArray(raw.successCriteria)
        ? raw.successCriteria.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          )
        : DEFAULT_INTERNAL_PROJECT.successCriteria,
    };
  } catch {
    return DEFAULT_INTERNAL_PROJECT;
  }
}
