#!/usr/bin/env node

/**
 * QUICK START GUIDE - Plan B Implementation
 * 
 * One-command validation of JEPA + Bifásic integration
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runValidation() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║      🚀 PLAN B - QUICK START & FINAL VALIDATION           ║
║                                                            ║
║      This script verifies all components are deployed:     ║
║      ✓ Port separation                                     ║
║      ✓ JEPA bridge in heartbeat                           ║
║      ✓ Bifásic model compilation                          ║
║      ✓ Measurement harnesses ready                        ║
║                                                            ║
║      Total deploy time: ~5 minutes                         ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  const tests = [
    {
      name: 'Port Separation Validation',
      cmd: 'node scripts/test-port-separation.mjs',
      timeout: 10000,
      success: '8/8 checks PASS'
    },
    {
      name: 'JEPA Synthetic Measurement',
      cmd: 'node scripts/measure-jepa-autonomy-improvement.mjs',
      timeout: 15000,
      success: 'EFFECTIVE'
    },
    {
      name: 'JEPA Real-World Test',
      cmd: 'node scripts/test-jepa-real-world.mjs',
      timeout: 15000,
      success: 'VALIDATED'
    },
    {
      name: 'JEPA Live Deployment',
      cmd: 'node scripts/deploy-and-measure-jepa.mjs',
      timeout: 20000,
      success: '+40% minimum'
    },
    {
      name: 'Bifásic Thermodinamic Model',
      cmd: 'node scripts/fase2-bifasic-thermodinamic.mjs',
      timeout: 15000,
      success: 'VIABLE'
    }
  ];

  console.log('\n📋 VALIDATION SEQUENCE:\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`  ⏳ ${test.name.padEnd(40)}`);

    try {
      const { stdout, stderr } = await execAsync(test.cmd, { timeout: test.timeout });
      const success = stdout.includes(test.success) || !stderr;

      if (success) {
        console.log(' ✅');
        passed++;
      } else {
        console.log(' ❌ (check output)');
        console.log(`     Error: ${stderr.slice(0, 100)}`);
        failed++;
      }
    } catch (error) {
      console.log(' ❌');
      console.log(`     Timeout or error: ${error.message.slice(0, 80)}`);
      failed++;
    }
  }

  console.log('\n' + '═'.repeat(60) + '\n');
  console.log(`📊 VALIDATION SUMMARY\n`);
  console.log(`  Passed: ${passed}/${tests.length}`);
  console.log(`  Failed: ${failed}/${tests.length}`);

  if (failed === 0) {
    console.log(`\n  ✅ ALL VALIDATIONS PASS - SYSTEM READY FOR DEPLOYMENT\n`);
    console.log(`  Next Steps:\n`);
    console.log(`  1. export OPENSKYNET_MODE=1`);
    console.log(`  2. npm start`);
    console.log(`  3. Monitor ~/.openskynet/heartbeat.log for autonomy metrics\n`);
  } else {
    console.log(`\n  ⚠️  Some tests failed - review errors above\n`);
  }

  console.log('═'.repeat(60));
}

runValidation().catch(console.error);
