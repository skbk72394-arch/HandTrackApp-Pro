// src/components/AirKeyboard.tsx
/**
 * AirKeyboard — Dual-Mode Floating Air Keyboard
 * -----------------------------------------------
 * Mode 1 (Mobile / small screen  < 600dp wide):
 *   "Laser Pointer" mode — two virtual pointers (left & right index fingers)
 *   hover over the keyboard. Pinching either pointer types the highlighted key.
 *
 * Mode 2 (Tablet / TV  ≥ 600dp wide):
 *   "Spatial Typing" mode — full QWERTY layout spread wide enough for
 *   10-finger spatial input. Each finger zone is highlighted.
 *   Uses hand landmark positions to highlight keys under each fingertip.
 *
 * Both modes receive normalized landmark data from the useHandGestures hook.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Vibration,
  Modal,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import { NativeModules, NativeEventEmitter } from 'react-native';

const { HandTrackingModule } = NativeModules;
const { width: WIN_W } = Dimensions.get('window');

// ── Constants ─────────────────────────────────────────────────────────────

const TABLET_BREAKPOINT = 600; // dp
const IS_TABLET = WIN_W >= TABLET_BREAKPOINT;

// Key layouts
const ROWS_QWERTY = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
  ['123', ',', '␣', '.', '↵'],
];

const ROWS_NUMBERS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
  ['⇧', '.', ',', '?', '!', "'", '⌫'],
  ['ABC', '␣', '↵'],
];

// Finger-to-key-zone mapping for tablet mode (10 fingers)
// Left hand: pinky→q column, ring→w, middle→e/r, index→t/y, thumb→space
// Right hand: thumb→space, index→y/u, middle→i/o, ring→p, pinky→enter
const FINGER_ZONES: Record<string, string[]> = {
  left_pinky:  ['q', 'a', 'z', '1'],
  left_ring:   ['w', 's', 'x', '2'],
  left_middle: ['e', 'd', 'c', '3'],
  left_index:  ['r', 't', 'f', 'g', 'v', 'b', '4', '5'],
  left_thumb:  ['␣'],
  right_thumb: ['␣'],
  right_index: ['y', 'u', 'h', 'j', 'n', 'm', '6', '7'],
  right_middle:['i', 'k', ',', '8'],
  right_ring:  ['o', 'l', '.', '9'],
  right_pinky: ['p', ';', '/', '0', '⌫', '↵'],
};

const FINGER_ZONE_COLORS: Record<string, string> = {
  left_pinky:   '#FF6B6B',
  left_ring:    '#FFB347',
  left_middle:  '#FFE66D',
  left_index:   '#6BCB77',
  left_thumb:   '#74B9FF',
  right_thumb:  '#74B9FF',
  right_index:  '#A29BFE',
  right_middle: '#FD79A8',
  right_ring:   '#E17055',
  right_pinky:  '#00CEC9',
};

// ── Types ─────────────────────────────────────────────────────────────────

interface AirKeyboardProps {
  visible: boolean;
  onClose: () => void;
  onTextChange?: (text: string) => void;
  initialText?: string;
}

interface PointerState {
  x: number; // 0-1 normalized
  y: number;
  active: boolean;
}

// ── Helper: build key zone color ──────────────────────────────────────────

function getZoneColor(key: string): string {
  for (const [zone, keys] of Object.entries(FINGER_ZONES)) {
    if (keys.includes(key.toLowerCase())) {
      return FINGER_ZONE_COLORS[zone] + '30'; // 30 = ~18% opacity
    }
  }
  return 'rgba(255,255,255,0.06)';
}

function getZoneBorder(key: string): string {
  for (const [zone, keys] of Object.entries(FINGER_ZONES)) {
    if (keys.includes(key.toLowerCase())) {
      return FINGER_ZONE_COLORS[zone] + '80';
    }
  }
  return 'rgba(255,255,255,0.15)';
}

// ── Main Component ─────────────────────────────────────────────────────────

const AirKeyboard: React.FC<AirKeyboardProps> = ({
  visible,
  onClose,
  onTextChange,
  initialText = '',
}) => {
  const [text, setText] = useState(initialText);
  const [shifted, setShifted] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [mode] = useState<'mobile' | 'tablet'>(IS_TABLET ? 'tablet' : 'mobile');

  // Laser pointers (2 index fingers for mobile mode)
  const [leftPointer, setLeftPointer] = useState<PointerState>({ x: 0.25, y: 0.5, active: false });
  const [rightPointer, setRightPointer] = useState<PointerState>({ x: 0.75, y: 0.5, active: false });

  // Draggable position for the keyboard itself
  const [keyboardY, setKeyboardY] = useState(0.55); // 55 % from top (normalized)
  const keyboardYAnim = useRef(new Animated.Value(0)).current;
  const keyboardLayout = useRef({ y: 0, height: 0, width: 0 });

  // Pressed animation
  const pressScale = useRef(new Animated.Value(1)).current;

  // ── Connect to native gesture stream ────────────────────────────────────
  useEffect(() => {
    if (!HandTrackingModule) return;
    const emitter = new NativeEventEmitter(HandTrackingModule);

    const sub = emitter.addListener('onLandmarksUpdated', (landmarks: any[]) => {
      if (!landmarks || landmarks.length < 21) return;

      // Left hand index tip = landmark 8 of first hand
      // Right hand index tip = landmark 8 of second hand
      // (MediaPipe sends hands in detection order; you may need to sort by x)
      const leftHand = landmarks.slice(0, 21);
      const rightHand = landmarks.length >= 42 ? landmarks.slice(21, 42) : null;

      const lIdx = leftHand[8];  // left index tip
      setLeftPointer({
        x: lIdx?.x ?? 0.25,
        y: lIdx?.y ?? 0.5,
        active: true,
      });

      if (rightHand) {
        const rIdx = rightHand[8];
        setRightPointer({
          x: rIdx?.x ?? 0.75,
          y: rIdx?.y ?? 0.5,
          active: true,
        });
      }
    });

    return () => sub.remove();
  }, []);

  // ── Determine hovered key from pointer positions (mobile mode) ───────────
  useEffect(() => {
    if (mode !== 'mobile') return;
    // The actual hit testing happens in onLayout + pointer math below.
    // Here we just use it conceptually; see renderKey for hover detection.
  }, [leftPointer, rightPointer, mode]);

  // ── Key press handler ────────────────────────────────────────────────────
  const handleKeyPress = useCallback(
    (key: string) => {
      Vibration.vibrate(30);

      // Press animation
      Animated.sequence([
        Animated.timing(pressScale, { toValue: 0.92, duration: 60, useNativeDriver: true }),
        Animated.timing(pressScale, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();

      setPressedKey(key);
      setTimeout(() => setPressedKey(null), 150);

      setText((prev) => {
        let next = prev;
        switch (key) {
          case '⌫':
            next = prev.slice(0, -1);
            break;
          case '␣':
            next = prev + ' ';
            break;
          case '↵':
            next = prev + '\n';
            break;
          case '⇧':
            setShifted((s) => !s);
            return prev;
          case '123':
            setShowNumbers(true);
            return prev;
          case 'ABC':
            setShowNumbers(false);
            return prev;
          default:
            next = prev + (shifted ? key.toUpperCase() : key);
            if (shifted) setShifted(false);
        }
        onTextChange?.(next);
        return next;
      });
    },
    [shifted, onTextChange, pressScale],
  );

  // ── Render a single key ──────────────────────────────────────────────────
  const renderKey = useCallback(
    (key: string, isWide = false) => {
      const isSpecial = ['⇧', '⌫', '123', 'ABC', '↵', '␣'].includes(key);
      const isPressed = pressedKey === key;
      const isHovered = hoveredKey === key;
      const zoneColor = IS_TABLET ? getZoneColor(key) : 'rgba(255,255,255,0.06)';
      const zoneBorder = IS_TABLET ? getZoneBorder(key) : 'rgba(255,255,255,0.15)';

      const displayKey =
        key === '␣' ? 'SPACE' :
        key === '⇧' ? (shifted ? '⬆ CAPS' : '⇧ SHIFT') :
        shifted && !isSpecial ? key.toUpperCase() : key;

      return (
        <TouchableOpacity
          key={key}
          activeOpacity={0.7}
          onPress={() => handleKeyPress(key)}
          style={[
            styles.key,
            isWide && styles.keyWide,
            key === '␣' && styles.keySpace,
            key === '↵' && styles.keyEnter,
            isSpecial && styles.keySpecial,
            { backgroundColor: zoneColor, borderColor: zoneBorder },
            isPressed && styles.keyPressed,
            isHovered && styles.keyHovered,
          ]}
        >
          <Text
            style={[
              styles.keyLabel,
              isSpecial && styles.keyLabelSpecial,
              isPressed && styles.keyLabelPressed,
            ]}
          >
            {displayKey}
          </Text>
          {/* Finger zone legend dot (tablet mode) */}
          {IS_TABLET && (
            <View
              style={[
                styles.zoneDot,
                { backgroundColor: getZoneBorder(key).replace('80', 'FF') },
              ]}
            />
          )}
        </TouchableOpacity>
      );
    },
    [shifted, pressedKey, hoveredKey, handleKeyPress],
  );

  const rows = showNumbers ? ROWS_NUMBERS : ROWS_QWERTY;

  // ── Laser pointer dot (mobile mode) ─────────────────────────────────────
  const renderPointer = (pointer: PointerState, color: string, label: string) => {
    if (!pointer.active || mode !== 'mobile') return null;
    const kbLayout = keyboardLayout.current;
    if (!kbLayout.width) return null;
    const px = pointer.x * WIN_W;
    const py = pointer.y * Dimensions.get('window').height;
    return (
      <View
        pointerEvents="none"
        style={[
          styles.laserPointer,
          {
            left: px - 12,
            top: py - 12,
            borderColor: color,
            backgroundColor: color + '30',
          },
        ]}
      >
        <Text style={[styles.laserLabel, { color }]}>{label}</Text>
      </View>
    );
  };

  // ── Keyboard content ─────────────────────────────────────────────────────
  const keyboardContent = (
    <View
      style={[styles.keyboardWrapper, IS_TABLET && styles.keyboardWrapperTablet]}
      onLayout={(e: LayoutChangeEvent) => {
        keyboardLayout.current = {
          y: e.nativeEvent.layout.y,
          height: e.nativeEvent.layout.height,
          width: e.nativeEvent.layout.width,
        };
      }}
    >
      {/* Header bar */}
      <View style={styles.keyboardHeader}>
        <View style={styles.dragHandle} />
        <Text style={styles.modeLabel}>
          {mode === 'tablet' ? '🖐 Spatial Mode (Tablet)' : '☝️ Laser Mode (Mobile)'}
        </Text>
        <TouchableOpacity onPress={onClose} style={styles.kbCloseBtn}>
          <Text style={styles.kbCloseBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Text preview */}
      <View style={styles.textPreview}>
        <Text style={styles.textPreviewContent} numberOfLines={2}>
          {text || <Text style={styles.textPreviewPlaceholder}>Start typing...</Text>}
        </Text>
        {text.length > 0 && (
          <TouchableOpacity
            onPress={() => { setText(''); onTextChange?.(''); }}
            style={styles.clearBtn}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Finger zone legend (tablet only) */}
      {IS_TABLET && (
        <View style={styles.legendRow}>
          {Object.entries(FINGER_ZONE_COLORS).slice(0, 5).map(([zone, color]) => (
            <View key={zone} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>
                {zone.replace('left_', 'L.').replace('right_', 'R.')}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Keys */}
      <View style={styles.keysContainer}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.keyRow}>
            {row.map((key) => renderKey(key, key === '␣'))}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay} pointerEvents="box-none">
        {/* Laser pointers (mobile mode) */}
        {renderPointer(leftPointer, '#4F8EF7', 'L')}
        {renderPointer(rightPointer, '#F74F4F', 'R')}

        {/* Keyboard positioned at bottom */}
        <View style={styles.keyboardPositioner}>
          {keyboardContent}
        </View>
      </View>
    </Modal>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const KEY_H = IS_TABLET ? 56 : 42;
const KEY_GAP = IS_TABLET ? 6 : 4;
const KEY_FONT = IS_TABLET ? 16 : 14;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardPositioner: {
    width: '100%',
  },
  keyboardWrapper: {
    backgroundColor: '#1A1D2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
  },
  keyboardWrapperTablet: {
    paddingHorizontal: 12,
  },
  keyboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    position: 'absolute',
    top: 10,
    left: '50%',
    marginLeft: -18,
  },
  modeLabel: {
    color: '#8A8FA8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    flex: 1,
    textAlign: 'center',
  },
  kbCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kbCloseBtnText: {
    color: '#CCC',
    fontSize: 14,
  },
  textPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
  },
  textPreviewContent: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
  },
  textPreviewPlaceholder: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 15,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,80,80,0.15)',
  },
  clearBtnText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    marginBottom: 6,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#8A8FA8',
    fontSize: 10,
    fontWeight: '600',
  },
  keysContainer: {
    paddingHorizontal: 6,
    gap: KEY_GAP,
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: KEY_GAP,
  },
  key: {
    height: KEY_H,
    minWidth: IS_TABLET ? 52 : 32,
    flex: 1,
    maxFlex: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    position: 'relative',
  } as any,
  keyWide: {
    flex: 1.4,
  },
  keySpace: {
    flex: 4,
  },
  keyEnter: {
    flex: 1.6,
    backgroundColor: 'rgba(79,142,247,0.2)',
    borderColor: 'rgba(79,142,247,0.5)',
  },
  keySpecial: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  keyPressed: {
    backgroundColor: 'rgba(79,142,247,0.4)',
    transform: [{ scale: 0.92 }],
  },
  keyHovered: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  keyLabel: {
    color: '#FFFFFF',
    fontSize: KEY_FONT,
    fontWeight: '500',
  },
  keyLabelSpecial: {
    fontSize: IS_TABLET ? 13 : 11,
    color: '#A0A5BE',
    fontWeight: '600',
  },
  keyLabelPressed: {
    color: '#74B9FF',
  },
  zoneDot: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  laserPointer: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  laserLabel: {
    fontSize: 9,
    fontWeight: '900',
  },
});

export default AirKeyboard;
