/**
 * TEST EMPÍRICO 1.1: Validar separación de puertos OpenSkyNet/OpenClaw
 * 
 * Objetivo: Verificar que ambos sistemas usan puertos diferentes y directorios separados
 * Métrica: ¿Pueden ejecutarse simultáneamente sin conflicto?
 * 
 * Fecha: 2026-03-15
 * Resultado esperado: PASS si ports son distintos, FAIL si hay conflicto
 */

import { describe, it, expect, beforeEach } from "vitest";
import { resolveStateDir, resolveNewStateDir } from "../../src/config/paths.js";
import {
  resolveDefaultGatewayPort,
  resolveDefaultBrowserControlPort,
  resolveDefaultCanvasHostPort,
  getPortOffset,
} from "../../src/config/port-defaults.js";
import { resolveCliName, ALT_CLI_NAME } from "../../src/cli/cli-name.js";

describe("EMPIRICAL TEST 1.1: Port Separation OpenSkyNet vs OpenClaw", () => {
  
  describe("Port Offset", () => {
    it("OpenSkyNet should use port offset", () => {
      // Simular ejecución como openskynet
      process.env.OPENSKYNET_MODE = "1";
      
      const offset = getPortOffset();
      expect(offset).toBeGreaterThan(0);
      console.log(`✓ OpenSkyNet port offset: ${offset}`);
    });

    it("OpenClaw should use port offset 0", () => {
      // Simular ejecución como openclaw
      delete process.env.OPENSKYNET_MODE;
      
      const offset = getPortOffset();
      expect(offset).toBe(0);
      console.log(`✓ OpenClaw port offset: ${offset}`);
    });
  });

  describe("Gateway Ports", () => {
    it("OpenClaw gateway port should be 18789", () => {
      delete process.env.OPENSKYNET_MODE;
      
      const port = resolveDefaultGatewayPort();
      expect(port).toBe(18789);
      console.log(`✓ OpenClaw gateway port: ${port}`);
    });

    it("OpenSkyNet gateway port should be different from OpenClaw", () => {
      process.env.OPENSKYNET_MODE = "1";
      
      const portOpenSkyNet = resolveDefaultGatewayPort();
      
      // Volver a OpenClaw
      delete process.env.OPENSKYNET_MODE;
      const portOpenClaw = resolveDefaultGatewayPort();
      
      expect(portOpenSkyNet).not.toBe(portOpenClaw);
      console.log(`✓ OpenSkyNet gateway: ${portOpenSkyNet}, OpenClaw: ${portOpenClaw} (SEPARATED)`);
    });
  });

  describe("State Directories", () => {
    it("OpenClaw should use ~/.openclaw", () => {
      delete process.env.OPENSKYNET_MODE;
      delete process.env.OPENSKYNET_STATE_DIR;
      delete process.env.OPENCLAW_STATE_DIR;
      
      const stateDir = resolveStateDir();
      expect(stateDir).toContain(".openclaw");
      console.log(`✓ OpenClaw state dir: ${stateDir}`);
    });

    it("OpenSkyNet should use ~/.openskynet", () => {
      process.env.OPENSKYNET_MODE = "1";
      
      const stateDir = resolveStateDir();
      expect(stateDir).toContain(".openskynet");
      console.log(`✓ OpenSkyNet state dir: ${stateDir}`);
    });

    it("State directories must be DIFFERENT", () => {
      process.env.OPENSKYNET_MODE = "1";
      const stateOpenSkyNet = resolveStateDir();
      
      delete process.env.OPENSKYNET_MODE;
      const stateOpenClaw = resolveStateDir();
      
      expect(stateOpenSkyNet).not.toBe(stateOpenClaw);
      console.log(`✓ Directories separated: ${stateOpenSkyNet} vs ${stateOpenClaw}`);
    });
  });

  describe("Critical Port Ranges", () => {
    it("All derived ports should be > 1024 (non-privileged)", () => {
      delete process.env.OPENSKYNET_MODE;
      
      const gateway = resolveDefaultGatewayPort();
      const browser = resolveDefaultBrowserControlPort();
      const canvas = resolveDefaultCanvasHostPort();
      
      expect(gateway).toBeGreaterThan(1024);
      expect(browser).toBeGreaterThan(1024);
      expect(canvas).toBeGreaterThan(1024);
      console.log(`✓ All ports non-privileged: ${gateway}, ${browser}, ${canvas}`);
    });

    it("OpenSkyNet ports should not overlap with OpenClaw", () => {
      delete process.env.OPENSKYNET_MODE;
      const portsClaw = {
        gateway: resolveDefaultGatewayPort(),
        browser: resolveDefaultBrowserControlPort(),
        canvas: resolveDefaultCanvasHostPort(),
      };
      
      process.env.OPENSKYNET_MODE = "1";
      const portsSkyNet = {
        gateway: resolveDefaultGatewayPort(),
        browser: resolveDefaultBrowserControlPort(),
        canvas: resolveDefaultCanvasHostPort(),
      };
      
      expect(portsSkyNet.gateway).not.toBe(portsClaw.gateway);
      expect(portsSkyNet.browser).not.toBe(portsClaw.browser);
      expect(portsSkyNet.canvas).not.toBe(portsClaw.canvas);
      
      console.log(`✓ NO port overlap:`);
      console.log(`  OpenClaw:  ${portsClaw.gateway}, ${portsClaw.browser}, ${portsClaw.canvas}`);
      console.log(`  OpenSkyNet: ${portsSkyNet.gateway}, ${portsSkyNet.browser}, ${portsSkyNet.canvas}`);
    });
  });

  describe("CLI Name Detection", () => {
    it("should detect OPENSKYNET_MODE=1 as openskynet", () => {
      process.env.OPENSKYNET_MODE = "1";
      const cliName = resolveCliName();
      expect(cliName).toBe(ALT_CLI_NAME);
      console.log(`✓ CLI detected as: ${cliName}`);
    });
  });
});
