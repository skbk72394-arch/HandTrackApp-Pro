// src/screens/GestureGuideScreen.tsx
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Image,
  Animated,
  FlatList,
  ListRenderItem,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Gesture data ───────────────────────────────────────────────────────────

interface GestureCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  tip: string;
  imagePlaceholder: string;
  color: string;
  icon: string;
  steps: string[];
}

const GESTURE_CARDS: GestureCard[] = [
  {
    id: 'click',
    title: 'Click / Tap',
    subtitle: 'Index + Thumb Pinch',
    description:
      'Bring your index fingertip and thumb tip together to perform a tap at the cursor location.',
    tip: 'Keep your other fingers extended to avoid misfires.',
    imagePlaceholder: 'assets/gestures/click.png',
    color: '#4F8EF7',
    icon: '👆',
    steps: [
      'Point index finger toward screen',
      'Hold thumb extended',
      'Quickly pinch index + thumb together',
      'Release to complete the click',
    ],
  },
  {
    id: 'back',
    title: 'Go Back',
    subtitle: 'Middle + Thumb Pinch',
    description:
      'Pinch your middle fingertip and thumb together to trigger the Android Back action.',
    tip: 'The middle finger is taller — make sure you\'re not accidentally using the index.',
    imagePlaceholder: 'assets/gestures/back.png',
    color: '#F76F4F',
    icon: '↩️',
    steps: [
      'Extend your middle finger forward',
      'Hold thumb out to the side',
      'Pinch middle finger + thumb together',
      'Release — the Back action fires',
    ],
  },
  {
    id: 'recents',
    title: 'Recent Apps',
    subtitle: 'Ring + Thumb Pinch',
    description:
      'Pinch your ring fingertip and thumb together to open the Android Recent Apps overview.',
    tip: 'The ring finger is naturally shorter — practice the gesture a few times for accuracy.',
    imagePlaceholder: 'assets/gestures/recents.png',
    color: '#9B59B6',
    icon: '🗂️',
    steps: [
      'Extend your ring finger forward',
      'Keep other fingers relaxed',
      'Pinch ring finger + thumb tip',
      'Hold 1 second for Recents to open',
    ],
  },
  {
    id: 'swipe',
    title: 'Scroll / Swipe',
    subtitle: 'Open-Hand Swipe',
    description:
      'With your hand open and flat, swipe Up, Down, Left, or Right to scroll the current page.',
    tip: 'Keep all fingers extended. A closed fist triggers Drag instead of Scroll.',
    imagePlaceholder: 'assets/gestures/swipe.png',
    color: '#27AE60',
    icon: '✋',
    steps: [
      'Open your hand flat (all fingers extended)',
      'Move your entire hand in one direction:',
      '⬆️ Up = scroll up   ⬇️ Down = scroll down',
      '⬅️ Left = swipe left   ➡️ Right = swipe right',
    ],
  },
  {
    id: 'drag',
    title: 'Drag & Drop',
    subtitle: 'Fist → Move → Open Hand',
    description:
      'Close your hand into a fist to grab, move to drag the item, then open your hand to drop.',
    tip: 'Closing at least 3 fingers counts as a fist — you don\'t need to be perfectly clenched.',
    imagePlaceholder: 'assets/gestures/drag.png',
    color: '#E67E22',
    icon: '✊',
    steps: [
      'Move cursor over the item to drag',
      'Close hand into a tight fist (grab)',
      'Move your fist to the target location',
      'Open your hand to release (drop)',
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────

interface GestureGuideScreenProps {
  visible: boolean;
  onClose: () => void;
}

const GestureGuideScreen: React.FC<GestureGuideScreenProps> = ({
  visible,
  onClose,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<GestureCard>>(null);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Animate in when modal opens
  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      setActiveIndex(0);
    }
  }, [visible]);

  const handleScroll = (event: any) => {
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.round(offset / SCREEN_W);
    setActiveIndex(index);
  };

  const goToNext = () => {
    const next = Math.min(activeIndex + 1, GESTURE_CARDS.length - 1);
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
    setActiveIndex(next);
  };

  const goToPrev = () => {
    const prev = Math.max(activeIndex - 1, 0);
    flatListRef.current?.scrollToIndex({ index: prev, animated: true });
    setActiveIndex(prev);
  };

  const renderCard: ListRenderItem<GestureCard> = ({ item }) => (
    <View style={[styles.card, { width: SCREEN_W - 40 }]}>
      {/* Image placeholder */}
      <View style={[styles.imagePlaceholder, { backgroundColor: item.color + '20' }]}>
        <Text style={styles.placeholderIcon}>{item.icon}</Text>
        {/* Replace with: <Image source={require(`../../${item.imagePlaceholder}`)} style={styles.gestureImage} resizeMode="contain" /> */}
        <Text style={styles.placeholderLabel}>{item.title} Gesture</Text>
      </View>

      {/* Card content */}
      <View style={[styles.cardBadge, { backgroundColor: item.color }]}>
        <Text style={styles.cardBadgeText}>{item.subtitle}</Text>
      </View>

      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDescription}>{item.description}</Text>

      {/* Steps */}
      <View style={styles.stepsContainer}>
        {item.steps.map((step, idx) => (
          <View key={idx} style={styles.stepRow}>
            <View style={[styles.stepDot, { backgroundColor: item.color }]}>
              <Text style={styles.stepNumber}>{idx + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {/* Tip */}
      <View style={[styles.tipBox, { borderLeftColor: item.color }]}>
        <Text style={styles.tipTitle}>💡 Pro Tip</Text>
        <Text style={styles.tipText}>{item.tip}</Text>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Gesture Guide</Text>
              <Text style={styles.headerSubtitle}>
                {activeIndex + 1} of {GESTURE_CARDS.length} gestures
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Dot indicators */}
          <View style={styles.dotsRow}>
            {GESTURE_CARDS.map((card, idx) => (
              <TouchableOpacity
                key={card.id}
                onPress={() => {
                  flatListRef.current?.scrollToIndex({ index: idx, animated: true });
                  setActiveIndex(idx);
                }}
              >
                <View
                  style={[
                    styles.dot,
                    idx === activeIndex && {
                      width: 20,
                      backgroundColor: GESTURE_CARDS[activeIndex].color,
                    },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Carousel */}
          <FlatList
            ref={flatListRef}
            data={GESTURE_CARDS}
            renderItem={renderCard}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.carouselContent}
            snapToInterval={SCREEN_W - 40}
            decelerationRate="fast"
            getItemLayout={(_, index) => ({
              length: SCREEN_W - 40,
              offset: (SCREEN_W - 40) * index,
              index,
            })}
          />

          {/* Navigation buttons */}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[
                styles.navButton,
                activeIndex === 0 && styles.navButtonDisabled,
              ]}
              onPress={goToPrev}
              disabled={activeIndex === 0}
            >
              <Text style={styles.navButtonText}>‹ Prev</Text>
            </TouchableOpacity>

            {activeIndex === GESTURE_CARDS.length - 1 ? (
              <TouchableOpacity
                style={[
                  styles.navButton,
                  styles.navButtonPrimary,
                  { backgroundColor: GESTURE_CARDS[activeIndex].color },
                ]}
                onPress={onClose}
              >
                <Text style={[styles.navButtonText, { color: '#fff' }]}>
                  Got it! ✓
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.navButton,
                  styles.navButtonPrimary,
                  { backgroundColor: GESTURE_CARDS[activeIndex].color },
                ]}
                onPress={goToNext}
              >
                <Text style={[styles.navButtonText, { color: '#fff' }]}>
                  Next ›
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: SCREEN_W - 24,
    maxHeight: SCREEN_H * 0.88,
    backgroundColor: '#1A1D2E',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8A8FA8',
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#CCC',
    fontSize: 16,
    fontWeight: '600',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 3,
    // Width is overridden inline for active dot
    transitionDuration: '200ms',
  } as any,
  carouselContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    marginRight: 12,
  },
  imagePlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gestureImage: {
    width: '100%',
    height: 160,
    borderRadius: 16,
  },
  placeholderIcon: {
    fontSize: 56,
    marginBottom: 8,
  },
  placeholderLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  cardBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 10,
  },
  cardBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#A0A5BE',
    lineHeight: 22,
    marginBottom: 16,
  },
  stepsContainer: {
    gap: 10,
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumber: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: '#C8CEDE',
    lineHeight: 20,
  },
  tipBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    marginBottom: 20,
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  tipText: {
    fontSize: 13,
    color: '#A0A5BE',
    lineHeight: 20,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonPrimary: {
    flex: 1.5,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default GestureGuideScreen;
