// src/native/AccessibilityBridge.ts
import { NativeModules } from 'react-native';

const { AccessibilityActionModule } = NativeModules;

/**
 * JS-side wrapper around HandTrackAccessibilityService.
 * Falls back gracefully if the native module isn't linked yet.
 */
export const HandTrackAccessibilityService = {
  performClick: (x: number, y: number) =>
    AccessibilityActionModule?.performClick(x, y),

  performBack: () =>
    AccessibilityActionModule?.performBack(),

  performRecents: () =>
    AccessibilityActionModule?.performRecents(),

  performScrollUp: (x: number, y: number) =>
    AccessibilityActionModule?.performScrollUp(x, y),

  performScrollDown: (x: number, y: number) =>
    AccessibilityActionModule?.performScrollDown(x, y),

  performScrollLeft: (x: number, y: number) =>
    AccessibilityActionModule?.performScrollLeft(x, y),

  performScrollRight: (x: number, y: number) =>
    AccessibilityActionModule?.performScrollRight(x, y),

  performDragStart: (x: number, y: number) =>
    AccessibilityActionModule?.performDragStart(x, y),

  performDragEnd: (x: number, y: number) =>
    AccessibilityActionModule?.performDragEnd(x, y),
};
