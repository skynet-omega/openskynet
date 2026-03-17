#!/usr/bin/env node

/**
 * Empirical Measurement Suite: JEPA Tension Bridge Impact on Autonomy
 * 
 * PURPOSE: Measure whether JEPA enhancement actually improves autonomous decision-making
 * 
 * METHODOLOGY:
 * 1. Simulate kernel timeline with success/failure outcomes
 * 2. Evaluate drives with and without JEPA enhancement
 * 3. Count autonomous decisions vs idle
 * 4. Calculate improvement percentage
 * 
 * EXPECTED OUTCOME: >50% improvement in autonomous decisions when frustration detected
 */

import fs from 'fs';
import path from 'path';

// Mock JEPA Enhancement Logic (mirrored from src/omega/jepa-drive-enhancement.ts)
function parseJepaTensionFromKernelTimeline(timeline) {
  if (!timeline || timeline.length === 0) {
    return { frustration: 0, confidence: 1, lastFailureMs: null };
  }

  const recentTimeline = timeline.slice(-20); // Last 20 events
  const failures = recentTimeline.filter(e => e.kind === 'failure').length;
  const total = recentTimeline.length;
  const failureRate = total > 0 ? failures / total : 0;

  return {
    frustration: failureRate * 2, // 0-2 scale
    confidence: 1 - failureRate,
    lastFailureMs: recentTimeline
      .reverse()
      .find(e => e.kind === 'failure')?.timestampMs || null
  };
}

function enhanceDriveWithJepaTension(driveSignal, jepaTension) {
  const enhanced = { ...driveSignal };

  // Rule 1: Idle + extreme frustration → entropy alert (unchanged)
  if (jepaTension.frustration > 1.5 && driveSignal.kind === 'idle') {
    enhanced.kind = 'entropy_alert';
    enhanced.urgency = 0.8;
    return enhanced;
  }

  // Rule 2: Idle + moderate/low frustration → activate homeostasis/curiosity (NEW)
  if (jepaTension.frustration > 0.5 && jepaTension.frustration <= 1.5 && driveSignal.kind === 'idle') {
    enhanced.kind = jepaTension.frustration > 1.0 ? 'curiosity' : 'homeostasis';
    enhanced.urgency = 0.4 + jepaTension.frustration * 0.15;
    return enhanced;
  }

  // Rule 3: Active drive + frustration > 0.5 → boost urgency (lowered threshold from 1.0)
  if (driveSignal.kind !== 'idle' && jepaTension.frustration > 0.5) {
    const boostAmount = jepaTension.frustration * 0.15;
    enhanced.urgency = Math.min(1.0, (enhanced.urgency || 0.5) + boostAmount);
  }

  return enhanced;
}

// Mock kernel timeline simulator
function generateKernelTimeline(successRate = 0.7, length = 20) {
  const timeline = [];
  for (let i = 0; i < length; i++) {
    const isSuccess = Math.random() < successRate;
    timeline.push({
      kind: isSuccess ? 'success' : 'failure',
      timestampMs: Date.now() - (length - i) * 1000,
      action: `action_${i}`
    });
  }
  return timeline;
}

// Mock drive evaluator (mirrors evaluateInnerDrives)
function evaluateInnerDrivesWithout(timeline, successRate) {
  // Baseline: 30% of the time, homeostasis drive activates (autonomous)
  // Otherwise idle (needs human input)
  const isAutonomous = Math.random() < 0.3;
  return isAutonomous
    ? { kind: 'homeostasis', urgency: 0.6 }
    : { kind: 'idle', urgency: 0 };
}

function evaluateInnerDrivesWith(timeline, successRate) {
  // Baseline drive
  let signal = evaluateInnerDrivesWithout(timeline, successRate);
  
  // Apply JEPA enhancement
  const jepaTension = parseJepaTensionFromKernelTimeline(timeline);
  signal = enhanceDriveWithJepaTension(signal, jepaTension);
  
  return signal;
}

// Main measurement
function runMeasurement() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📊 EMPIRICAL MEASUREMENT: JEPA Tension Bridge Impact on Autonomy');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Test scenarios
  const scenarios = [
    { name: 'High Success (70%)', successRate: 0.7, frustration: 'low' },
    { name: 'Medium Success (50%)', successRate: 0.5, frustration: 'medium' },
    { name: 'Low Success (30%)', successRate: 0.3, frustration: 'high' }
  ];

  const results = [];

  for (const scenario of scenarios) {
    console.log(`\n┌─ Scenario: ${scenario.name} (frustration: ${scenario.frustration})`);
    
    // Run 10 heartbeat cycles
    let autonomousWithoutJEPA = 0;
    let autonomousWithJEPA = 0;
    const iterations = 10;

    const timeline = generateKernelTimeline(scenario.successRate);
    const jepaTension = parseJepaTensionFromKernelTimeline(timeline);

    for (let i = 0; i < iterations; i++) {
      // WITHOUT JEPA
      const driveWithout = evaluateInnerDrivesWithout(timeline, scenario.successRate);
      if (driveWithout.kind !== 'idle') {
        autonomousWithoutJEPA++;
      }

      // WITH JEPA
      const driveWith = evaluateInnerDrivesWith(timeline, scenario.successRate);
      if (driveWith.kind !== 'idle') {
        autonomousWithJEPA++;
      }
    }

    const percentWithout = (autonomousWithoutJEPA / iterations) * 100;
    const percentWith = (autonomousWithJEPA / iterations) * 100;
    const improvement = ((autonomousWithJEPA - autonomousWithoutJEPA) / Math.max(autonomousWithoutJEPA, 1)) * 100;

    console.log(`│`);
    console.log(`├─ JEPA Metrics:`);
    console.log(`│  ├─ Frustration: ${jepaTension.frustration.toFixed(2)} (scale 0-2)`);
    console.log(`│  ├─ Confidence: ${jepaTension.confidence.toFixed(2)}`);
    console.log(`│  └─ Last Failure: ${jepaTension.lastFailureMs ? 'recent' : 'none'}`);
    console.log(`│`);
    console.log(`├─ Autonomous Decisions (${iterations} cycles):`);
    console.log(`│  ├─ Without JEPA: ${autonomousWithoutJEPA}/${iterations} (${percentWithout.toFixed(1)}%)`);
    console.log(`│  ├─ With JEPA:    ${autonomousWithJEPA}/${iterations} (${percentWith.toFixed(1)}%)`);
    console.log(`│  └─ Improvement:  ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%`);
    console.log(`└─\n`);

    results.push({
      scenario: scenario.name,
      frustration: jepaTension.frustration,
      autonomousWithout: percentWithout,
      autonomousWith: percentWith,
      improvement
    });
  }

  // Summary
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📈 SUMMARY\n');

  const avgImprovement = results.reduce((sum, r) => sum + r.improvement, 0) / results.length;
  const successRate = results.filter(r => r.improvement > 0).length / results.length;

  console.log(`Average Improvement: ${avgImprovement >= 0 ? '+' : ''}${avgImprovement.toFixed(1)}%`);
  console.log(`Scenarios with Positive Impact: ${(successRate * 100).toFixed(0)}%`);
  
  console.log('\nDetailed Results:');
  console.table(results.map(r => ({
    Scenario: r.scenario,
    'Frustration': r.frustration.toFixed(2),
    'Autonomy Without': `${r.autonomousWithout.toFixed(1)}%`,
    'Autonomy With': `${r.autonomousWith.toFixed(1)}%`,
    'Improvement': `${r.improvement >= 0 ? '+' : ''}${r.improvement.toFixed(1)}%`
  })));

  // Interpretation
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🎯 INTERPRETATION\n');

  if (avgImprovement > 20) {
    console.log('✅ JEPA Enhancement is EFFECTIVE');
    console.log('   → Frustration detection successfully boosts autonomous decision-making');
    console.log('   → Recommendation: Deploy in production, measure real-world impact');
  } else if (avgImprovement > 0) {
    console.log('⚠️  JEPA Enhancement has MARGINAL EFFECT');
    console.log('   → Some improvement, but may need tuning');
    console.log('   → Recommendation: Adjust thresholds in jepa-drive-enhancement.ts');
  } else {
    console.log('❌ JEPA Enhancement is INEFFECTIVE (or negative)');
    console.log('   → No improvement detected with current logic');
    console.log('   → Recommendation: Review enhancement rules, increase boost factors');
  }

  console.log('\n════════════════════════════════════════════════════════════════\n');

  return results;
}

// Save results to JSON
function saveResults(results) {
  const filename = path.join(process.cwd(), 'benchmark_jepa_autonomy_improvement.json');
  fs.writeFileSync(filename, JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    interpretation: {
      avgImprovement: results.reduce((s, r) => s + r.improvement, 0) / results.length,
      positiveCases: results.filter(r => r.improvement > 0).length,
      totalScenarios: results.length
    }
  }, null, 2));
  console.log(`📁 Results saved to: ${filename}`);
}

// Execute
const results = runMeasurement();
saveResults(results);
