import { PlatformModule } from './types';
import { createLinuxPlatform } from './linux';
import { createMacPlatform } from './darwin';
import { createWindowsPlatform } from './win32';

export function createPlatform(): PlatformModule {
  switch (process.platform) {
    case 'linux':
      return createLinuxPlatform();
    case 'darwin':
      return createMacPlatform();
    case 'win32':
      return createWindowsPlatform();
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

