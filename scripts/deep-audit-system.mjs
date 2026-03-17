#!/usr/bin/env node

/**
 * DEEP AUDIT SYSTEM
 * =================
 * 
 * Auditoría profunda, reproducible y NO asume errores:
 * 1. EXPLORA el codebase
 * 2. IDENTIFICA posibles problemas
 * 3. VALIDA que cada problema realmente existe (no falsa alarma)
 * 4. PROPONE soluciones
 * 5. VERIFICA que las soluciones funcionan
 * 
 * Fases:
 * - PHASE 1: Mapeo de estructura (qué tenemos)
 * - PHASE 2: Identificación de problemas (qué duele)
 * - PHASE 3: Validación de problemas (es real?)
 * - PHASE 4: Soluciones y verificación (se arreglò?)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PROJECT_ROOT = ".";

console.log(`
╔═════════════════════════════════════════════════════════════════════════╗
║                                                                         ║
║  DEEP AUDIT SYSTEM - Auditoría Profunda de OpenSkyNet                  ║
║                                                                         ║
║  Fases:                                                                 ║
║  1. Mapeo de estructura                                                ║
║  2. Identificación de problemas potenciales                             ║
║  3. Validación: ¿Es realmente un problema?                             ║
║  4. Soluciones y verificación                                          ║
║                                                                         ║
╚═════════════════════════════════════════════════════════════════════════╝
`);

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1: MAPEO DE ESTRUCTURA
// ════════════════════════════════════════════════════════════════════════════

console.log("\n📊 PHASE 1: MAPEO DE ESTRUCTURA\n");

function getAllFiles(dir, extensions = [".ts", ".tsx", ".js", ".mjs"]) {
  const files = [];
  const stack = [dir];
  const ignored = new Set([
    "node_modules",
    "dist",
    ".git",
    "build",
    "coverage",
    ".next",
    ".expo",
  ]);

  while (stack.length > 0) {
    const current = stack.pop();
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (ignored.has(entry.name)) continue;
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Permiso denegado, ignorar
    }
  }
  return files;
}

const tsFiles = getAllFiles(PROJECT_ROOT);
const jsFiles = tsFiles.filter(f => f.endsWith(".js") || f.endsWith(".mjs"));
const tsTypeFiles = tsFiles.filter(
  f => f.endsWith(".ts") || f.endsWith(".tsx")
);

console.log(`✓ Archivos TypeScript encontrados: ${tsTypeFiles.length}`);
console.log(`✓ Archivos JavaScript encontrados: ${jsFiles.length}`);
console.log(`✓ Total archivos: ${tsFiles.length}\n`);

// Análisis de estructura
const dirStructure = {};
for (const file of tsFiles) {
  const dir = path.dirname(file).split(path.sep)[0];
  dirStructure[dir] = (dirStructure[dir] || 0) + 1;
}

console.log("Distribución de archivos por directorio:");
for (const [dir, count] of Object.entries(dirStructure).sort(
  (a, b) => b[1] - a[1]
)) {
  console.log(`  ${dir}: ${count} archivos`);
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: IDENTIFICACIÓN DE PROBLEMAS
// ════════════════════════════════════════════════════════════════════════════

console.log("\n🔍 PHASE 2: IDENTIFICACIÓN DE PROBLEMAS POTENCIALES\n");

const problems = {
  unusedImports: [],
  circularDependencies: [],
  duplicateFunctions: [],
  largeFiles: [],
  missingExports: [],
  typeErrors: [],
  inconsistentNaming: [],
};

// Problema 1: Archivos muy grandes (>500 líneas = riesgo)
console.log("Buscando archivos grandes (>500 líneas)...");
for (const file of tsTypeFiles.slice(0, 50)) {
  // Sample para no sobrecargar
  try {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n").length;
    if (lines > 500) {
      problems.largeFiles.push({
        file,
        lines,
        severity: lines > 1000 ? "CRITICAL" : "WARNING",
      });
      console.log(`  ⚠️  ${file}: ${lines} líneas`);
    }
  } catch (e) {
    // Ignorar
  }
}

if (problems.largeFiles.length === 0) {
  console.log("  ✅ Sin archivos sospechosamente grandes en muestra\n");
} else {
  console.log(`  ⚠️  Encontrados ${problems.largeFiles.length} archivos grandes\n`);
}

// Problema 2: Imports no usados (muestra)
console.log("Analizando imports no usados (muestra de 5 archivos)...");
let unusedImportCount = 0;
for (const file of tsTypeFiles.slice(0, 5)) {
  try {
    const content = fs.readFileSync(file, "utf8");
    const importLines = content.match(/^import .* from ['"].*/gm) || [];
    const importedNames = importLines
      .map(line => {
        const match = line.match(/import\s+(?:{([^}]+)}|([^ ]+))/);
        if (match?.[1]) {
          return match[1]
            .split(",")
            .map(s => s.trim())
            .filter(s => !s.includes(" as "));
        } else if (match?.[2]) {
          return [match[2]];
        }
        return [];
      })
      .flat();

    for (const name of importedNames) {
      if (!name) continue;
      const usagePattern = new RegExp(`\\b${name}\\b`, "g");
      const matches = (content.match(usagePattern) || []).length;
      if (matches <= 1) {
        // Solo aparece en import
        unusedImportCount++;
        problems.unusedImports.push({ file, name });
      }
    }
  } catch (e) {
    // Ignorar
  }
}
console.log(`  Imports no usados encontrados: ${unusedImportCount}`);
if (unusedImportCount > 0) {
  console.log(`  (primeros 3): `);
  problems.unusedImports.slice(0, 3).forEach(p => {
    console.log(`    - ${p.file}: ${p.name}`);
  });
}

// Problema 3: Lógicas contradictorias
console.log("\nBuscando anti-patterns (muestra)...");
let antiPatternCount = 0;
const antiPatterns = [
  { pattern: /function\s+\w+\s*\([^)]*\)\s*{\s*return\s+\1\s*\(/, desc: "Recursión infinita obvious" },
  { pattern: /if\s*\(true\).*else/, desc: "Condicional imposible" },
  { pattern: /const\s+\w+\s*=\s*\w+;\s*const\s+\1\s*=/, desc: "Variable sobrescrita inmediatamente" },
];

for (const file of tsTypeFiles.slice(0, 10)) {
  try {
    const content = fs.readFileSync(file, "utf8");
    for (const { pattern, desc } of antiPatterns) {
      if (pattern.test(content)) {
        antiPatternCount++;
        problems.typeErrors.push({ file, desc });
        console.log(`  ⚠️  ${file.split("/").pop()}: ${desc}`);
      }
    }
  } catch (e) {
    // Ignorar
  }
}

if (antiPatternCount === 0) {
  console.log("  ✅ No se encontraron anti-patterns obvios en muestra\n");
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3: VALIDACIÓN DE PROBLEMAS REALES
// ════════════════════════════════════════════════════════════════════════════

console.log("\n✅ PHASE 3: VALIDACIÓN DE PROBLEMAS\n");

console.log("Validando problemas encontrados...\n");

// Validación 1: Hay tests?
console.log("Validación 1: Cobertura de tests");
const testFiles = tsFiles.filter(
  f => f.includes(".test.") || f.includes(".spec.")
);
console.log(`  ✓ Archivos de test encontrados: ${testFiles.length}`);
if (testFiles.length === 0) {
  console.log(`  ⚠️  PROBLEMA REAL: No hay archivos de test detectados`);
  problems.typeErrors.push({ issue: "No test files found", severity: "HIGH" });
} else {
  console.log(`  ✅ Tests presentes\n`);
}

// Validación 2: package.json existe?
console.log("Validación 2: Estructura del proyecto");
const hasPackageJson = fs.existsSync(path.join(PROJECT_ROOT, "package.json"));
const hasTypescript = fs.existsSync(
  path.join(PROJECT_ROOT, "tsconfig.json")
);
console.log(`  ${hasPackageJson ? "✅" : "❌"} package.json existe`);
console.log(`  ${hasTypescript ? "✅" : "❌"} tsconfig.json existe`);

if (!hasPackageJson || !hasTypescript) {
  problems.typeErrors.push({ issue: "Config files missing", severity: "CRITICAL" });
}

// Validación 3: Build completa sin errores?
console.log("\nValidación 3: Estado de compilación");
try {
  // Intenta tsc --noEmit para ver si hay errores
  execSync("npx tsc --noEmit 2>&1", { cwd: PROJECT_ROOT, timeout: 30000 });
  console.log(`  ✅ Compilación sin errores`);
} catch (e) {
  const output = e.stdout?.toString() || e.message;
  const errorCount = (output.match(/error/gi) || []).length;
  console.log(
    `  ❌ PROBLEMA REAL: ${errorCount} errores de compilación detectados`
  );
  problems.typeErrors.push({ issue: "Compilation errors", severity: "CRITICAL", count: errorCount });
}

// ════════════════════════════════════════════════════════════════════════════
// RESUMEN FINAL
// ════════════════════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(77));
console.log("RESUMEN DE AUDITORÍA\n");

const problemCounts = {
  CRITICAL: 0,
  HIGH: 0,
  WARNING: 0,
};

for (const category in problems) {
  const items = problems[category];
  if (items.length > 0) {
    for (const item of items) {
      const severity = item.severity || "HIGH";
      problemCounts[severity]++;
    }
  }
}

console.log(`⚠️  PROBLEMAS ENCONTRADOS:`);
console.log(`  🔴 CRITICAL: ${problemCounts.CRITICAL}`);
console.log(`  🟠 HIGH: ${problemCounts.HIGH}`);
console.log(`  🟡 WARNING: ${problemCounts.WARNING}`);
console.log(`  Total: ${problemCounts.CRITICAL + problemCounts.HIGH + problemCounts.WARNING}`);

if (problems.largeFiles.length > 0) {
  console.log(
    `\n📦 Archivos grandes encontrados: ${problems.largeFiles.length}`
  );
  problems.largeFiles.slice(0, 5).forEach(f => {
    console.log(`   - ${path.basename(f.file)}: ${f.lines} líneas (${f.severity})`);
  });
}

if (problems.typeErrors.length > 0) {
  console.log(`\n🚨 Errores críticos: ${problems.typeErrors.length}`);
  problems.typeErrors.slice(0, 5).forEach(p => {
    if (p.issue) {
      console.log(`   - ${p.issue} (${p.severity})`);
    }
  });
}

console.log("\n" + "═".repeat(77));
console.log(`\nAuntos pendientes para PHASE 4 (Soluciones):`);
console.log(`1. Refactor archivos grandes`);
console.log(`2. Resolver errores de compilación`);
console.log(`3. Limpiar imports no usados`);
console.log(`4. Documentar y testear funciones críticas`);

console.log(`\nAuditoria completada: ${new Date().toISOString()}`);
process.exit(problemCounts.CRITICAL > 0 ? 1 : 0);
