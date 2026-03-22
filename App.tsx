import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert,
  StatusBar, Animated, Switch, ScrollView, Platform, NativeModules
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import GestureGuideScreen from './src/screens/GestureGuideScreen';
import AirKeyboard from './src/components/AirKeyboard';
import { useHandGestures, GestureEvent } from './src/hooks/useHandGestures';

const { CursorControlModule, HandTrackingModule } = NativeModules;

const App: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'running'>('idle');
  const [showGuide, setShowGuide] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [lastGesture, setLastGesture] = useState('–');
  const [gestureCount, setGestureCount] = useState(0);
  const [gesturesEnabled, setGesturesEnabled] = useState(true);

  // EXPO CAMERA PERMISSION HOOK
  const [permission, requestPermission] = useCameraPermissions();

  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const gestureFlashOpacity = React.useRef(new Animated.Value(0)).current;

  const flashGesture = useCallback((name: string) => {
    setLastGesture(name);
    setGestureCount((c) => c + 1);
    gestureFlashOpacity.setValue(1);
    Animated.timing(gestureFlashOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }).start();
  }, [gestureFlashOpacity]);

  useHandGestures({
    enabled: gesturesEnabled,
    onGesture: (e: GestureEvent) => flashGesture(e.gesture),
    onBeforeAction: (e: GestureEvent) => {
      if (showKeyboard && e.gesture === 'CLICK') return true;
      return false;
    },
  });

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const handleStart = async () => {
    if (Platform.OS !== 'android') return;
    
    // 1. Check Overlay Permission
    const hasOverlay = await CursorControlModule?.checkOverlayPermission();
    if (!hasOverlay) {
      Alert.alert('Permission Needed', 'HandTrack needs Overlay permission.', [
        { text: 'Settings', onPress: () => CursorControlModule?.requestOverlayPermission() }
      ]);
      return;
    }

    // 2. Request Camera Permission via Expo
    if (!permission?.granted) {
      const camPerm = await requestPermission();
      if (!camPerm.granted) {
        Alert.alert("Camera Error", "Camera is required to track gestures.");
        return;
      }
    }

    // 3. Start Engine
    try {
      await CursorControlModule?.startCursor();
      setStatus('running');
    } catch (e) { 
      Alert.alert("Error", "Failed to start."); 
    }
  };

  const handleStop = () => {
    CursorControlModule?.stopCursor();
    setStatus('idle');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0F1A" />
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <View>
              <Text style={styles.appName}>✋ HandTrack Pro</Text>
              <Text style={styles.appTagline}>Next-Gen Air Controller</Text>
            </View>
            <View style={[styles.statusBadge, status === 'running' && styles.statusBadgeActive]}>
              <View style={[styles.statusDot, status === 'running' && styles.statusDotActive]} />
              <Text style={styles.statusText}>{status === 'running' ? 'Active' : 'Idle'}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Control Center</Text>
            <TouchableOpacity 
              style={[styles.button, status === 'running' && styles.buttonDanger]} 
              onPress={status === 'running' ? handleStop : handleStart}
            >
              <Text style={styles.buttonText}>{status === 'running' ? '⏹ STOP ENGINE' : '▶ START ENGINE'}</Text>
            </TouchableOpacity>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Gesture Tracking</Text>
              <Switch value={gesturesEnabled} onValueChange={setGesturesEnabled} trackColor={{ false: '#3A3D50', true: '#4F8EF7' }} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Live Stats</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}><Text style={styles.statValue}>{gestureCount}</Text><Text style={styles.statLabel}>Gestures</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}><Text style={[styles.statValue, {fontSize: 16}]}>{lastGesture}</Text><Text style={styles.statLabel}>Last Detected</Text></View>
            </View>
          </View>

          <View style={styles.featureGrid}>
            <TouchableOpacity style={styles.featureCard} onPress={() => setShowKeyboard(true)}>
              <Text style={{fontSize: 24}}>⌨️</Text><Text style={styles.featureTitle}>Air Keyboard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.featureCard, {backgroundColor: 'rgba(155,89,182,0.1)'}]} onPress={() => setShowGuide(true)}>
              <Text style={{fontSize: 24}}>📖</Text><Text style={styles.featureTitle}>Guide</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>

      {/* THE HIDDEN CAMERA ENGINE (Triggers Green Dot) */}
      {status === 'running' && (
        <View style={{ width: 1, height: 1, overflow: 'hidden', position: 'absolute' }}>
           <CameraView style={{ flex: 1 }} facing="front" />
        </View>
      )}

      <GestureGuideScreen visible={showGuide} onClose={() => setShowGuide(false)} />
      <AirKeyboard visible={showKeyboard} onClose={() => setShowKeyboard(false)} onTextChange={setTypedText} initialText={typedText} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0F1A' },
  container: { flex: 1 },
  scroll: { padding: 16, gap: 15 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  appTagline: { fontSize: 12, color: '#6B7094' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 20, backgroundColor: '#1A1D2E' },
  statusBadgeActive: { borderColor: '#27AE60', borderWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6B7094' },
  statusDotActive: { backgroundColor: '#27AE60' },
  statusText: { fontSize: 11, color: '#fff', fontWeight: 'bold' },
  card: { backgroundColor: '#1A1D2E', padding: 16, borderRadius: 16 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  button: { backgroundColor: '#4F8EF7', padding: 15, borderRadius: 12, alignItems: 'center' },
  buttonDanger: { backgroundColor: '#E74C3C' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },
  toggleLabel: { color: '#8A8FA8', fontSize: 13 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 30, backgroundColor: '#3A3D50' },
  statValue: { fontSize: 24, color: '#4F8EF7', fontWeight: 'bold' },
  statLabel: { fontSize: 10, color: '#6B7094', textTransform: 'uppercase' },
  featureGrid: { flexDirection: 'row', gap: 12 },
  featureCard: { flex: 1, backgroundColor: 'rgba(79,142,247,0.1)', padding: 15, borderRadius: 16, alignItems: 'center' },
  featureTitle: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginTop: 5 },
});

export default App;
