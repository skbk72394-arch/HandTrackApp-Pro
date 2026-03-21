package com.handtrackapp.gesture

import android.content.Context
import android.util.DisplayMetrics
import com.facebook.react.bridge.*
import com.handtrackapp.cursor.CursorOverlayService
import kotlin.math.sqrt

/**
 * HandTrackingModule
 * -------------------
 * React-Native bridge that receives raw MediaPipe landmark data from JS,
 * applies coordinate scaling + EMA smoothing, detects gestures, and
 * feeds the cursor service.
 *
 * JS usage:
 *   import { NativeModules } from 'react-native';
 *   const { HandTrackingModule } = NativeModules;
 *
 *   // Call on every MediaPipe frame (landmarks array of 21 points)
 *   HandTrackingModule.processLandmarks(landmarksArray);
 *
 *   // Listen for gesture events
 *   const emitter = new NativeEventEmitter(HandTrackingModule);
 *   emitter.addListener('onGestureDetected', ({ gesture, x, y }) => { ... });
 */
class HandTrackingModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "HandTrackingModule"

    // ── EMA state ──────────────────────────────────────────────────────────
    private val EMA_ALPHA = 0.25f
    private var emaX = 0.5f
    private var emaY = 0.5f

    // ── Screen size ────────────────────────────────────────────────────────
    private val screenWidth: Int
    private val screenHeight: Int

    // ── Gesture cooldown (ms) ──────────────────────────────────────────────
    private var lastGestureTime = 0L
    private val GESTURE_COOLDOWN_MS = 400L

    // ── Swipe state ────────────────────────────────────────────────────────
    private var swipeStartX = 0f
    private var swipeStartY = 0f
    private var swipeTracking = false
    private val SWIPE_MIN_DISTANCE_NORM = 0.15f   // 15 % of screen

    // ── Drag state ─────────────────────────────────────────────────────────
    private var isDragging = false

    // ── Distance thresholds (normalized 0-1) ──────────────────────────────
    companion object {
        /** Fingers are "pinched" when closer than this */
        const val PINCH_THRESHOLD = 0.055f
        /** Fingers are "released" when farther than this (hysteresis) */
        const val PINCH_RELEASE_THRESHOLD = 0.085f
        /** All 4 finger MCPs folded → fist */
        const val FIST_THRESHOLD = 0.12f

        // Landmark indices (MediaPipe Hand model)
        const val WRIST = 0
        const val THUMB_TIP = 4
        const val INDEX_TIP = 8
        const val MIDDLE_TIP = 12
        const val RING_TIP = 16
        const val PINKY_TIP = 20
        const val INDEX_MCP = 5
        const val MIDDLE_MCP = 9
        const val RING_MCP = 13
        const val PINKY_MCP = 17

        // Gesture name constants
        const val GESTURE_CLICK = "CLICK"
        const val GESTURE_BACK = "BACK"
        const val GESTURE_RECENTS = "RECENTS"
        const val GESTURE_SCROLL_UP = "SCROLL_UP"
        const val GESTURE_SCROLL_DOWN = "SCROLL_DOWN"
        const val GESTURE_SCROLL_LEFT = "SCROLL_LEFT"
        const val GESTURE_SCROLL_RIGHT = "SCROLL_RIGHT"
        const val GESTURE_DRAG_START = "DRAG_START"
        const val GESTURE_DRAG_END = "DRAG_END"
    }

    init {
        val metrics = reactContext.resources.displayMetrics
        screenWidth = metrics.widthPixels
        screenHeight = metrics.heightPixels
    }

    // ── Active pinch booleans (hysteresis prevents rapid re-fire) ──────────
    private var clickPinchActive = false
    private var backPinchActive = false
    private var recentsPinchActive = false

    // ──────────────────────────────────────────────────────────────────────
    // Main entry point called from JS on every MediaPipe frame
    // landmarks: ReadableArray of 21 objects { x: Float, y: Float, z: Float }
    // ──────────────────────────────────────────────────────────────────────
    @ReactMethod
    fun processLandmarks(landmarks: ReadableArray) {
        if (landmarks.size() < 21) return

        val lm = Array(21) { i ->
            val pt = landmarks.getMap(i)!!
            floatArrayOf(pt.getDouble("x").toFloat(), pt.getDouble("y").toFloat())
        }

        // ── 1. Cursor position = Index finger MCP (knuckle) ──────────────
        val cursorNormX = lm[INDEX_MCP][0]
        val cursorNormY = lm[INDEX_MCP][1]

        // Apply EMA smoothing
        emaX = EMA_ALPHA * cursorNormX + (1f - EMA_ALPHA) * emaX
        emaY = EMA_ALPHA * cursorNormY + (1f - EMA_ALPHA) * emaY

        // Feed cursor service (runs on UI thread internally)
        CursorOverlayService.updatePosition(emaX, emaY)

        // ── 2. Compute key distances ──────────────────────────────────────
        val thumbTip  = lm[THUMB_TIP]
        val indexTip  = lm[INDEX_TIP]
        val middleTip = lm[MIDDLE_TIP]
        val ringTip   = lm[RING_TIP]

        val clickDist   = dist(thumbTip, indexTip)
        val backDist    = dist(thumbTip, middleTip)
        val recentsDist = dist(thumbTip, ringTip)

        // ── 3. Pinch detection with hysteresis ────────────────────────────
        val now = System.currentTimeMillis()

        // CLICK  (Thumb + Index)
        if (!clickPinchActive && clickDist < PINCH_THRESHOLD) {
            clickPinchActive = true
            if (now - lastGestureTime > GESTURE_COOLDOWN_MS) {
                lastGestureTime = now
                emitGesture(GESTURE_CLICK, emaX, emaY)
            }
        } else if (clickPinchActive && clickDist > PINCH_RELEASE_THRESHOLD) {
            clickPinchActive = false
        }

        // BACK  (Thumb + Middle)
        if (!backPinchActive && backDist < PINCH_THRESHOLD) {
            backPinchActive = true
            if (now - lastGestureTime > GESTURE_COOLDOWN_MS) {
                lastGestureTime = now
                emitGesture(GESTURE_BACK, emaX, emaY)
            }
        } else if (backPinchActive && backDist > PINCH_RELEASE_THRESHOLD) {
            backPinchActive = false
        }

        // RECENTS  (Thumb + Ring)
        if (!recentsPinchActive && recentsDist < PINCH_THRESHOLD) {
            recentsPinchActive = true
            if (now - lastGestureTime > GESTURE_COOLDOWN_MS) {
                lastGestureTime = now
                emitGesture(GESTURE_RECENTS, emaX, emaY)
            }
        } else if (recentsPinchActive && recentsDist > PINCH_RELEASE_THRESHOLD) {
            recentsPinchActive = false
        }

        // ── 4. Fist detection → Drag Start/End ───────────────────────────
        val isFist = isFistPose(lm)
        if (isFist && !isDragging) {
            isDragging = true
            emitGesture(GESTURE_DRAG_START, emaX, emaY)
        } else if (!isFist && isDragging) {
            isDragging = false
            emitGesture(GESTURE_DRAG_END, emaX, emaY)
        }

        // ── 5. Swipe detection (only when not pinching or dragging) ───────
        if (!clickPinchActive && !backPinchActive && !recentsPinchActive && !isFist) {
            detectSwipe(emaX, emaY, now)
        } else {
            swipeTracking = false
        }
    }

    /** Expose smoothed screen coordinates to JS */
    @ReactMethod
    fun getSmoothedPosition(promise: Promise) {
        val map = WritableNativeMap().apply {
            putDouble("x", CursorOverlayService.smoothedScreenX.toDouble())
            putDouble("y", CursorOverlayService.smoothedScreenY.toDouble())
            putDouble("normX", emaX.toDouble())
            putDouble("normY", emaY.toDouble())
        }
        promise.resolve(map)
    }

    // ── Swipe logic ────────────────────────────────────────────────────────
    private fun detectSwipe(nx: Float, ny: Float, now: Long) {
        if (!swipeTracking) {
            swipeStartX = nx
            swipeStartY = ny
            swipeTracking = true
            return
        }

        val dx = nx - swipeStartX
        val dy = ny - swipeStartY
        val distance = sqrt(dx * dx + dy * dy)

        if (distance > SWIPE_MIN_DISTANCE_NORM && now - lastGestureTime > GESTURE_COOLDOWN_MS) {
            val gesture = when {
                kotlin.math.abs(dx) > kotlin.math.abs(dy) ->
                    if (dx > 0) GESTURE_SCROLL_RIGHT else GESTURE_SCROLL_LEFT
                else ->
                    if (dy > 0) GESTURE_SCROLL_DOWN else GESTURE_SCROLL_UP
            }
            lastGestureTime = now
            swipeTracking = false
            emitGesture(gesture, emaX, emaY)
        }
    }

    // ── Fist: all 4 finger tips below their MCPs ──────────────────────────
    private fun isFistPose(lm: Array<FloatArray>): Boolean {
        val fingerTips   = intArrayOf(INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP)
        val fingerMcps   = intArrayOf(INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP)
        var closedCount  = 0
        for (i in fingerTips.indices) {
            // In normalized coords, Y increases downward; tip BELOW mcp = folded
            if (lm[fingerTips[i]][1] > lm[fingerMcps[i]][1]) closedCount++
        }
        return closedCount >= 3
    }

    // ── Euclidean distance (normalized coords) ─────────────────────────────
    private fun dist(a: FloatArray, b: FloatArray): Float {
        val dx = a[0] - b[0]
        val dy = a[1] - b[1]
        return sqrt(dx * dx + dy * dy)
    }

    // ── Emit event to JS ───────────────────────────────────────────────────
    private fun emitGesture(gesture: String, normX: Float, normY: Float) {
        val params = Arguments.createMap().apply {
            putString("gesture", gesture)
            putDouble("normX", normX.toDouble())
            putDouble("normY", normY.toDouble())
            putDouble("screenX", (normX * screenWidth).toDouble())
            putDouble("screenY", (normY * screenHeight).toDouble())
        }
        reactContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onGestureDetected", params)
    }

    @ReactMethod
    fun addListener(eventName: String) { /* Required for NativeEventEmitter */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* Required for NativeEventEmitter */ }
}
