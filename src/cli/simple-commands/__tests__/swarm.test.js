/**
 * Tests for swarm command
 */

import { jest } from '@jest/globals';

// Mock modules before importing the module under test
jest.unstable_mockModule('fs-extra', () => ({
  default: {
    ensureDir: jest.fn(),
    writeJson: jest.fn(),
    pathExists: jest.fn(),
    readJson: jest.fn(),
    remove: jest.fn(),
  },
  ensureDir: jest.fn(),
  writeJson: jest.fn(),
  pathExists: jest.fn(),
  readJson: jest.fn(),
  remove: jest.fn(),
}));

jest.unstable_mockModule('child_process', () => ({
  spawn: jest.fn(),
  execSync: jest.fn(),
}));

jest.unstable_mockModule('ora', () => ({
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    info: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    text: '',
  })),
}));

// Import mocked modules
const fs = await import('fs-extra');
const { spawn, execSync } = await import('child_process');
const ora = await import('ora');

// Import the module under test after mocks are set up
const { swarmCommand } = await import('../swarm.js');

describe('Swarm Command', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let mockSpinner;
  let mockSpawnProcess;
  let processExitSpy;
  let originalEnv;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
    
    // Save and clear environment variables to prevent headless detection
    originalEnv = { ...process.env };
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.JENKINS_URL;
    delete process.env.CIRCLECI;
    delete process.env.TRAVIS;
    delete process.env.BUILDKITE;
    delete process.env.DRONE;
    delete process.env.DOCKER_CONTAINER;
    
    // Mock TTY to be true
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true
    });

    mockSpinner = {
      start: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      info: jest.fn().mockReturnThis(),
      warn: jest.fn().mockReturnThis(),
      text: '',
    };
    ora.default.mockReturnValue(mockSpinner);

    mockSpawnProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn(),
      killed: false,
    };
    spawn.mockReturnValue(mockSpawnProcess);

    // Mock execSync to simulate Claude CLI is available
    execSync.mockImplementation((cmd) => {
      if (cmd === 'which claude') {
        return '/usr/local/bin/claude';
      }
      return '';
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    
    // Restore original environment
    process.env = originalEnv;
  });

  describe('main swarm command', () => {
    test('should launch Claude with swarm objective', async () => {
      // Mock spawn process events for Claude
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 10);
        }
        return mockSpawnProcess;
      });

      await swarmCommand(['Build a REST API'], {});

      // Should spawn Claude with the swarm prompt
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          expect.stringContaining('Build a REST API'),
          '--dangerously-skip-permissions'
        ]),
        expect.objectContaining({
          stdio: 'inherit',
          shell: false,
        })
      );
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Launching Claude Flow Swarm System'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Build a REST API'));
    });

    test('should handle custom strategy', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') callback(0);
        return mockSpawnProcess;
      });

      await swarmCommand(['Research task'], { strategy: 'research' });

      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1][0]).toContain('Research task');
      expect(spawnCall[1][0]).toContain('Strategy: research');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Strategy: research'));
    });

    test('should handle custom topology mode', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') callback(0);
        return mockSpawnProcess;
      });

      await swarmCommand(['Task'], { mode: 'mesh' });

      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1][0]).toContain('Mode: mesh');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Mode: mesh'));
    });

    test('should set max agents', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') callback(0);
        return mockSpawnProcess;
      });

      await swarmCommand(['Task'], { 'max-agents': '10' });

      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1][0]).toContain('Max Agents: 10');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Max Agents: 10'));
    });

    test('should handle executor flag', async () => {
      // Force executor mode by setting the flag
      await swarmCommand(['Task'], { executor: true });

      // In executor mode, it should show the message about compiled module not found
      // or attempt to use basic swarm
      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toMatch(/Compiled swarm module not found|Starting basic swarm execution/);
    });

    test('should handle Claude CLI not found', async () => {
      // Mock execSync to throw error (Claude not found)
      execSync.mockImplementation((cmd) => {
        if (cmd === 'which claude') {
          throw new Error('Command not found');
        }
        return '';
      });

      await swarmCommand(['Task'], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Claude Code CLI not found'));
      expect(spawn).not.toHaveBeenCalled();
    });

    test('should force Claude with --claude flag even if not found', async () => {
      // Mock execSync to throw error (Claude not found)
      execSync.mockImplementation((cmd) => {
        if (cmd === 'which claude') {
          throw new Error('Command not found');
        }
        return '';
      });

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback({ code: 'ENOENT' });
        }
        return mockSpawnProcess;
      });

      await swarmCommand(['Task'], { claude: true });

      expect(spawn).toHaveBeenCalledWith('claude', expect.any(Array), expect.any(Object));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Claude Code CLI not found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    test('should handle missing objective', async () => {
      await swarmCommand([], {});

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Usage: swarm <objective>');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Claude Flow Advanced Swarm System'));
    });

    test('should handle spawn process errors', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('Spawn failed'));
        }
        return mockSpawnProcess;
      });

      await swarmCommand(['Task'], {});

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Failed to launch Claude Code:', 'Spawn failed'
      );
    });
  });

  describe('headless environment detection', () => {
    test('should detect headless environment correctly', async () => {
      // Save original environment
      const originalEnv = process.env.CI;
      
      // Test CI environment detection
      process.env.CI = 'true';
      
      // Mock spawn to exit immediately
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setImmediate(() => callback(0));
        }
        return mockSpawnProcess;
      });
      
      // Call swarmCommand with headless flag
      await swarmCommand(['test objective'], { headless: true });
      
      // Verify it runs in non-interactive mode
      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1]).toContain('-p');
      expect(spawnCall[1]).toContain('--output-format');
      expect(spawnCall[1]).toContain('stream-json');
      expect(spawnCall[1]).toContain('--verbose');
      
      // Check console output
      const output = consoleLogSpy.mock.calls.flat().join('\n');
      expect(output).toContain('non-interactive mode');
      
      // Restore
      if (originalEnv !== undefined) process.env.CI = originalEnv;
      else delete process.env.CI;
    });

    test('should auto-detect CI environment', async () => {
      // Save original environment
      const originalEnv = process.env.GITHUB_ACTIONS;
      
      // Set GitHub Actions environment
      process.env.GITHUB_ACTIONS = 'true';
      
      // Mock spawn to exit immediately
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setImmediate(() => callback(0));
        }
        return mockSpawnProcess;
      });
      
      // Call swarmCommand without explicit headless flag
      await swarmCommand(['test objective'], {});
      
      // Should still detect headless and use non-interactive mode
      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1]).toContain('-p');
      expect(spawnCall[1]).toContain('--output-format');
      expect(spawnCall[1]).toContain('stream-json');
      
      // Restore
      if (originalEnv !== undefined) process.env.GITHUB_ACTIONS = originalEnv;
      else delete process.env.GITHUB_ACTIONS;
    });
  });

  describe('output formats', () => {
    test('should handle JSON output format', async () => {
      // Mock execSync to throw (no Claude), forcing executor mode
      execSync.mockImplementation((cmd) => {
        if (cmd === 'which claude') {
          throw new Error('Command not found');
        }
        return '';
      });

      await swarmCommand(['Task'], { 'output-format': 'json' });

      // JSON format with no Claude should show the compiled module message
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Compiled swarm module not found'));
    });

    test('should handle stream-json output format with Claude', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') callback(0);
        return mockSpawnProcess;
      });

      await swarmCommand(['Task'], { 'output-format': 'stream-json' });

      // stream-json should use Claude in non-interactive mode
      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1]).toContain('-p');
      expect(spawnCall[1]).toContain('--output-format');
      expect(spawnCall[1]).toContain('stream-json');
    });
  });

  describe('permission flags', () => {
    test('should add --dangerously-skip-permissions by default', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') callback(0);
        return mockSpawnProcess;
      });

      await swarmCommand(['Task'], {});

      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1]).toContain('--dangerously-skip-permissions');
    });

    test('should not add permissions flag with --no-auto-permissions', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') callback(0);
        return mockSpawnProcess;
      });

      await swarmCommand(['Task'], { 'no-auto-permissions': true });

      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1]).not.toContain('--dangerously-skip-permissions');
    });
  });

  describe('analysis mode', () => {
    test('should enable read-only mode with --analysis flag', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') callback(0);
        return mockSpawnProcess;
      });

      await swarmCommand(['Analyze codebase'], { analysis: true });

      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1][0]).toContain('ANALYSIS MODE CONSTRAINTS');
      expect(spawnCall[1][0]).toContain('READ-ONLY MODE ACTIVE');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Analysis Mode: ENABLED'));
    });

    test('should enable read-only mode with --read-only flag', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') callback(0);
        return mockSpawnProcess;
      });

      await swarmCommand(['Review code'], { 'read-only': true });

      const spawnCall = spawn.mock.calls[0];
      expect(spawnCall[1][0]).toContain('ANALYSIS MODE CONSTRAINTS');
      expect(spawnCall[1][0]).toContain('READ-ONLY MODE ACTIVE');
    });
  });
});