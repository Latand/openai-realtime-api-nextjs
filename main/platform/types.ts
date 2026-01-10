export interface KeyboardSimulator {
  pressKey(key: string): Promise<void>;
  paste(): Promise<void>;
  pressEnter(): Promise<void>;
}

export interface VolumeController {
  setVolume(percentage: number): Promise<void>;
  getVolume(): Promise<number>;
  setMuted(muted: boolean): Promise<void>;
}

export interface SpotifyController {
  open(): Promise<void>;
  setVolume(percentage: number): Promise<void>;
}

export interface FocusManager {
  saveFocus(): Promise<string | null>;
  restoreFocus(windowId: string): Promise<void>;
}

export interface PlatformModule {
  keyboard: KeyboardSimulator;
  volume: VolumeController;
  spotify: SpotifyController;
  focus: FocusManager;
  checkDependencies?(): Promise<{ success: boolean; missing: string[] }>;
}
