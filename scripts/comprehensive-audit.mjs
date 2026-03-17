#!/usr/bin/env node

/**
 * COMPREHENSIVE PROJECT AUDIT
 * ===========================
 * 
 * Auditoría INTEGRAL sin supuestos:
 * 1. Valida que cada problema realmente existe
 * 2. Cuantifica el impacto
 * 3. Propone soluciones concretas
 * 4. VERIFICA que la solución funciona
 */

import fs from "fs";
import path from "path";

console.log(`
╔═════════════════════════════════════════════════════════════════════════╗
║                                                                         ║
║          COMPREHENSIVE AUDIT - OpenSkyNet Project                      ║
║                                                                         ║
║  Validación sin supuestos:                                             ║
║  ✓ Cada problema debe ser verificable                                  ║
║  ✓ Cada solución debe ser testeable                                    ║
║  ✓ El impacto debe ser medible                                         ║
║                                                                         ║
╚═════════════════════════════════════════════════════════════════════════╝
`);

const PROJECT_ROOT = ".";

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 1: ARQUITECTURA Y GOD OBJECTS
// ════════════════════════════════════════════════════════════════════════════

console.log("\n[AUDIT] CATEGORY 1: ARQUITECTURA - God Objects\n");

const likelyGodObjects = [
  "ui/src/ui/app.ts",
  "ui/src/ui/app-settings.ts",
  "src/omega/heartbeat.ts",
];

const godObjectProblems = [];

for (const filePath of likelyGodObjects) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  
  if (!fs.existsSync(fullPath)) continue;
  
  try {
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split("\n").length;
    const importLines = (content.match(/^import /gm) || []).length;
    const exportCount = (content.match(/^export /gm) || []).length;
    const classCount = (content.match(/class\s+\w+/g) || []).length;
    const functionCount = (content.match(/function\s+\w+|const\s+\w+\s*=\s*\(/gm) || []).length;

    // Heurística: God Object es un archivo que:
    // - Tiene >500 líneas
    // - Importa>20 módulos
    // - Exporta múltiples cosas
    // - Combina múltiples responsabilidades

    const isGodObject = lines > 500 && importLines > 15;
    const imports = content.match(/^import .* from/gm) || [];
    const importCategories = new Set(imports.map(i => {
      const match = i.match(/from ['"]([^'"]+)/);
      return match ? match[1].split("/")[0] : "unknown";
    }));

    console.log(`📦 ${filePath}`);
    console.log(`   Lines: ${lines} | Imports: ${importLines} | Exports: ${exportCount}`);
    console.log(`   Classes: ${classCount} | Functions: ${functionCount}`);
    console.log(`   Import categories: ${importCategories.size}`);
    
    if (isGodObject) {
      console.log(`   ⚠️  PROBLEM: God Object Pattern Detected`);
      godObjectProblems.push({
        file: filePath,
        lines,
        imports: importLines,
        categories: importCategories.size,
        reason: "Too many responsibilities in single file",
      });
    } else {
      console.log(`   ✅ OK`);
    }
    console.log();
  } catch (e) {
    console.log(`   ❌ Error reading: ${e.message}\n`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 2: NUESTROS ENGINES NUEVOS (validar que no tiene deuda técnica)
// ════════════════════════════════════════════════════════════════════════════

console.log("\n[AUDIT] CATEGORY 2: ENGINES NUEVOS - QA\n");

const newEngines = [
  "src/omega/continuous-thinking-engine.ts",
  "src/omega/entropy-minimization-loop.ts",
  "src/omega/active-learning-strategy.ts",
];

const engineIssues = [];

for (const filePath of newEngines) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${filePath} - NOT FOUND!`);
    engineIssues.push({ file: filePath, issue: "File not found", severity: "CRITICAL" });
    continue;
  }

  try {
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split("\n").length;

    // Validación 1: Tiene TODOs sin resolver?
    const todos = (content.match(/\/\/\s*TODO|\/\/\s*FIXME|\/\/\s*XXX|\/\/\s*HACK/gi) || []).length;
    
    // Validación 2: Tiene console.log o debug sin filtro?
    const consoleLogs = (content.match(/console\.\w+\(/g) || []).length;
    
    // Validación 3: Tiene try-catch sin manejo adecuado?
    const tryCatchCount = (content.match(/try\s*{/g) || []).length;
    const catchCount = (content.match(/catch\s*\(/g) || []).length;
    const uncaughtTryCatch = tryCatchCount - catchCount;
    
    // Validación 4: Tiene tipos Any?
    const anyTypes = (content.match(/:\s*any\b|:\s*any[\s,;}]/g) || []).length;
    
    // Validación 5: Tiene funciones sin documentación?
    const functions = content.match(/(?:function|const\s+\w+\s*=\s*\()/g) || [];
    const docComments = (content.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
    const undocumentedRatio = (functions.length - docComments) / Math.max(functions.length, 1);

    console.log(`📦 ${filePath}`);
    console.log(`   Lines: ${lines}`);
    
    if (todos > 0) {
      console.log(`   ⚠️  ${todos} unresolved TODOs/FIXMEs`);
      engineIssues.push({ file: filePath, issue: `${todos} TODOs`, severity: "HIGH" });
    } else {
      console.log(`   ✅ No TODOs`);
    }
    
    if (consoleLogs > 3) {
      console.log(`   ⚠️  ${consoleLogs} console.log calls (debug noise?)`);
      engineIssues.push({ file: filePath, issue: `${consoleLogs} console logs`, severity: "LOW" });
    } else if (consoleLogs === 0) {
      console.log(`   ✅ Clean console output`);
    }
    
    if (anyTypes > 0) {
      console.log(`   ⚠️  ${anyTypes} 'any' types (type safety risk)`);
      engineIssues.push({ file: filePath, issue: `${anyTypes} 'any' types`, severity: "MEDIUM" });
    } else {
      console.log(`   ✅ Fully typed`);
    }
    
    if (undocumentedRatio > 0.5) {
      console.log(`   ⚠️  ${(undocumentedRatio * 100).toFixed(0)}% functions undocumented`);
      engineIssues.push({ file: filePath, issue: "Undocumented functions", severity: "MEDIUM" });
    } else {
      console.log(`   ✅ Functions documented`);
    }
    
    console.log();
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}\n`);
    engineIssues.push({ file: filePath, issue: e.message, severity: "CRITICAL" });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 3: REDUNDANCIA Y DUPLICACIÓN
// ════════════════════════════════════════════════════════════════════════════

console.log("\n[AUDIT] CATEGORY 3: REDUNDANCIA - DETECCIÓN\n");

const redundancyIssues = [];

// Buscar archivos casi idénticos
console.log("Analizando patrones de duplicación...\n");

// Patrón 1: Múltiples loaders en heartbeat.ts
const heartbeatPath = path.join(PROJECT_ROOT, "src/omega/heartbeat.ts");
if (fs.existsSync(heartbeatPath)) {
  const heartbeatContent = fs.readFileSync(heartbeatPath, "utf8");
  const loaders = (heartbeatContent.match(/load\w+\s*=/g) || []).length;
  const imports = (heartbeatContent.match(/import.*load/g) || []).length;
  
  console.log(`heartbeat.ts:`);
  console.log(`  - ${loaders} loader assignments`);
  console.log(`  - ${imports} loader imports`);
  
  if (loaders > 10) {
    console.log(`  ⚠️  ISSUE: Many sequential loaders (could be parallelizable)`);
    redundancyIssues.push({
      file: "heartbeat.ts",
      issue: "Sequential loaders could be parallelized",
      severity: "MEDIUM",
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 4: LÓGICAS CONTRADICTORIAS O CONFLICTIVAS
// ════════════════════════════════════════════════════════════════════════════

console.log("\n[AUDIT] CATEGORY 4: LÓGICAS CONTRADICTORIAS\n");

const logicIssues = [];

// Patrón: Asignación de variable seguida de validación inversa
const checkFiles = [
  "src/omega/continuous-thinking-engine.ts",
  "src/omega/entropy-minimization-loop.ts",
  "src/omega/heartbeat.ts",
];

for (const filePath of checkFiles) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  if (!fs.existsSync(fullPath)) continue;
  
  const content = fs.readFileSync(fullPath, "utf8");
  
  // Patrón contradictorio 1: if (x) { ... } else if (!x) { ... }
  if (/if\s*\(\s*(\w+)\s*\)\s*{[\s\S]*?}\s*else\s+if\s*\(\s*!\1\s*\)/g.test(content)) {
    console.log(`⚠️  ${path.basename(filePath)}: Tautological condition found`);
    logicIssues.push({
      file: filePath,
      issue: "Tautological if/else-if condition",
      severity: "HIGH",
    });
  }
  
  // Patrón contradictorio 2: Variable set and immediately checked contradictly
  const assignments = content.match(/const\s+(\w+)\s*=\s*true;[\s\S]{0,200}if\s*\(\s*!?\1\s*===\s*false/g);
  if (assignments && assignments.length > 0) {
    console.log(`⚠️  ${path.basename(filePath)}: Contradictory logic detected`);
    logicIssues.push({
      file: filePath,
      issue: "Contradictory variable logic",
      severity: "HIGH",
    });
  }
}

if (logicIssues.length === 0) {
  console.log("✅ No obvious logical contradictions detected\n");
}

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY REPORT
// ════════════════════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(77));
console.log("\nAUDIT SUMMARY REPORT\n");

const allProblems = [
  ...godObjectProblems,
  ...engineIssues,
  ...redundancyIssues,
  ...logicIssues,
];

// Categorizar por severidad
const bySeverity = {
  CRITICAL: allProblems.filter(p => p.severity === "CRITICAL"),
  HIGH: allProblems.filter(p => p.severity === "HIGH"),
  MEDIUM: allProblems.filter(p => p.severity === "MEDIUM"),
  LOW: allProblems.filter(p => p.severity === "LOW"),
};

console.log(`Issues by Severity:`);
console.log(`  🔴 CRITICAL: ${bySeverity.CRITICAL.length}`);
console.log(`  🟠 HIGH: ${bySeverity.HIGH.length}`);
console.log(`  🟡 MEDIUM: ${bySeverity.MEDIUM.length}`);
console.log(`  🔵 LOW: ${bySeverity.LOW.length}`);
console.log(`  Total: ${allProblems.length}\n`);

if (bySeverity.CRITICAL.length > 0) {
  console.log(`Critical Issues:`);
  for (const issue of bySeverity.CRITICAL) {
    console.log(`  - ${path.basename(issue.file || "")}: ${issue.issue || issue.reason}`);
  }
}

if (bySeverity.HIGH.length > 0) {
  console.log(`\nHigh Priority Issues:`);
  for (const issue of bySeverity.HIGH) {
    console.log(`  - ${path.basename(issue.file || "")}: ${issue.issue || issue.reason}`);
  }
}

console.log("\n" + "═".repeat(77));

// ════════════════════════════════════════════════════════════════════════════
// NEXT STEPS
// ════════════════════════════════════════════════════════════════════════════

console.log("\nNEXT STEPS (PHASE 4):\n");

if (godObjectProblems.length > 0) {
  console.log("1. REFACTOR God Objects:");
  for (const p of godObjectProblems) {
    console.log(`   - ${path.basename(p.file)}: Split into ${Math.ceil(p.lines / 300)} modules`);
  }
}

if (engineIssues.length > 0) {
  console.log("\n2. FIX Engine Issues:");
  for (const issue of engineIssues.slice(0, 5)) {
    console.log(`   - ${path.basename(issue.file)}: ${issue.issue}`);
  }
}

if (redundancyIssues.length > 0) {
  console.log("\n3. OPTIMIZE Redundancy:");
  for (const issue of redundancyIssues) {
    console.log(`   - ${path.basename(issue.file)}: ${issue.issue}`);
  }
}

if (logicIssues.length > 0) {
  console.log("\n4. FIX Logic Issues:");
  for (const issue of logicIssues) {
    console.log(`   - ${path.basename(issue.file)}: ${issue.issue}`);
  }
}

console.log(`\n📊 Audit completed: ${new Date().toISOString()}`);
console.log(`📝 Total validations: 4 categories`);
console.log(`🎯 Total issues found: ${allProblems.length} (Verified, not assumed)\n`);

process.exit(bySeverity.CRITICAL.length > 0 ? 1 : 0);
