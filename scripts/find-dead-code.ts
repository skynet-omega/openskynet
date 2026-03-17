#!/usr/bin/env npx tsx
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const srcDir = process.cwd() + '/src';
const tsFiles = globSync('**/*.ts', {
  cwd: srcDir,
  ignore: ['**/*.test.ts', '**/*.d.ts'],
});

console.log('Total de archivos TS:', tsFiles.length);

// Contador de archivos sin ningún export
let orphans = 0;
let almostEmpty = 0;

for (const file of tsFiles.slice(0, 100)) { // Solo analizar los primeros 100 para testing
  const fullPath = path.join(srcDir, file);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  
  if (lines.length === 0) {
    orphans++;
    console.log('VACÍO:', file);
  } else if (lines.length < 3) {
    almostEmpty++;
    console.log('CASI VACÍO:', file, '(' + lines.length + ' líneas)');
  }
}

console.log('\nResumen:');
console.log('Archivos completamente vacíos:', orphans);
console.log('Archivos con <3 líneas:', almostEmpty);
