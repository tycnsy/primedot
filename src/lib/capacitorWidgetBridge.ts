import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PaceWidgetSnapshotV1 } from './widgetSnapshot';

export interface PaceWidgetPublishResult {
  ok: boolean;
  error?: string;
  bytes?: number;
  synced?: boolean;
  appGroupIdentifier?: string;
  containerAvailable?: boolean;
}

export interface PaceWidgetDebugInfo {
  appGroupIdentifier: string;
  defaultsAvailable: boolean;
  containerAvailable: boolean;
  hasSnapshot: boolean;
  snapshotBytes: number;
  itemCount: number;
}

export interface PaceWidgetDebugResult {
  supported: boolean;
  info: PaceWidgetDebugInfo | null;
  error: string | null;
}

interface PaceWidgetBridgePlugin {
  updatePaceSnapshot(options: { snapshot: string }): Promise<PaceWidgetPublishResult>;
  getPaceSnapshotDebug(): Promise<PaceWidgetDebugInfo>;
}

const paceWidgetBridge = registerPlugin<PaceWidgetBridgePlugin>('PaceWidgetBridge');

const isIOSNative = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

export async function publishPaceWidgetSnapshot(
  snapshot: PaceWidgetSnapshotV1,
): Promise<boolean> {
  if (!isIOSNative()) return false;

  try {
    const result = await paceWidgetBridge.updatePaceSnapshot({
      snapshot: JSON.stringify(snapshot),
    });
    if (!result.ok) {
      console.warn('Failed to publish pace widget snapshot', result);
      return false;
    }
    return result.ok;
  } catch (error) {
    console.warn('Failed to publish pace widget snapshot', error);
    return false;
  }
}

export async function getPaceWidgetDebugInfo(): Promise<PaceWidgetDebugInfo | null> {
  if (!isIOSNative()) return null;
  try {
    return await paceWidgetBridge.getPaceSnapshotDebug();
  } catch (error) {
    console.warn('Failed to read pace widget debug info', error);
    return null;
  }
}

export async function getPaceWidgetDebugResult(): Promise<PaceWidgetDebugResult> {
  if (!isIOSNative()) {
    return { supported: false, info: null, error: 'Not running on native iOS' };
  }
  try {
    const info = await paceWidgetBridge.getPaceSnapshotDebug();
    return { supported: true, info, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { supported: true, info: null, error: message };
  }
}
