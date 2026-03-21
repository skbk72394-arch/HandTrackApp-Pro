// src/hooks/useHandGestures.ts
import { useEffect, useRef, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { HandTrackAccessibilityService } from '../native/AccessibilityBridge';

const { HandTrackingModule } = NativeModules;

export type GestureName =
  | 'CLICK'
  | 'BACK'
  | 'RECENTS'
  | 'SCROLL_UP'
  | 'SCROLL_DOWN'
  | 'SCROLL_LEFT'
  | 'SCROLL_RIGHT'
  | 'DRAG_START'
  | 'DRAG_END';

export interface GestureEvent {
  gesture: GestureName;
  normX: number;
  normY: number;
  screenX: number;
  screenY: number;
}

interface UseHandGesturesOptions {
  onGesture?: (event: GestureEvent) => void;
  /** Override specific gestures — return true to suppress default action */
  onBeforeAction?: (event: GestureEvent) => boolean;
  enabled?: boolean;
}

/**
 * useHandGestures
 * ----------------
 * Subscribes to native gesture events and dispatches system actions
 * (click, back, recents, scroll, drag) via the AccessibilityService.
 *
 * Usage:
 *   const { lastGesture } = useHandGestures({
 *     onGesture: (e) => console.log(e.gesture),
 *   });
 */
export function useHandGestures({
  onGesture,
  onBeforeAction,
  enabled = true,
}: UseHandGesturesOptions = {}) {
  const lastGestureRef = useRef<GestureEvent | null>(null);

  const handleGesture = useCallback(
    (event: GestureEvent) => {
      lastGestureRef.current = event;
      onGesture?.(event);

      // Allow caller to suppress default system action
      const suppressed = onBeforeAction?.(event) ?? false;
      if (suppressed || !enabled) return;

      // Dispatch to native accessibility service
      const { gesture, screenX, screenY } = event;
      switch (gesture) {
        case 'CLICK':
          HandTrackAccessibilityService.performClick(screenX, screenY);
          break;
        case 'BACK':
          HandTrackAccessibilityService.performBack();
          break;
        case 'RECENTS':
          HandTrackAccessibilityService.performRecents();
          break;
        case 'SCROLL_UP':
          HandTrackAccessibilityService.performScrollUp(screenX, screenY);
          break;
        case 'SCROLL_DOWN':
          HandTrackAccessibilityService.performScrollDown(screenX, screenY);
          break;
        case 'SCROLL_LEFT':
          HandTrackAccessibilityService.performScrollLeft(screenX, screenY);
          break;
        case 'SCROLL_RIGHT':
          HandTrackAccessibilityService.performScrollRight(screenX, screenY);
          break;
        case 'DRAG_START':
          HandTrackAccessibilityService.performDragStart(screenX, screenY);
          break;
        case 'DRAG_END':
          HandTrackAccessibilityService.performDragEnd(screenX, screenY);
          break;
      }
    },
    [onGesture, onBeforeAction, enabled],
  );

  useEffect(() => {
    if (Platform.OS !== 'android' || !HandTrackingModule) return;

    const emitter = new NativeEventEmitter(HandTrackingModule);
    const subscription = emitter.addListener('onGestureDetected', handleGesture);

    return () => subscription.remove();
  }, [handleGesture]);

  return { lastGestureRef };
}
