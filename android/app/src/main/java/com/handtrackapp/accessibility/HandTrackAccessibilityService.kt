package com.handtrackapp.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import androidx.annotation.RequiresApi
import com.handtrackapp.cursor.CursorOverlayService

/**
 * HandTrackAccessibilityService
 * ------------------------------
 * Performs system-level actions triggered by gesture events from
 * HandTrackingModule. Register this in AndroidManifest.xml with
 *   android:accessibilityEventTypes="typeAllMask"
 *   android:accessibilityFlags="flagRequestFilterKeyEvents|flagRetrieveInteractiveWindows"
 *   android:canPerformGestures="true"
 *   android:canRetrieveWindowContent="true"
 *
 * Trigger actions by calling the companion object methods from
 * your RN gesture event handler (or directly from HandTrackingModule).
 */
class HandTrackAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        private var instance: HandTrackAccessibilityService? = null

        // ── Public API called from HandTrackingModule / RN ────────────────

        fun performClick(screenX: Float, screenY: Float) {
            instance?.doTap(screenX, screenY)
        }

        fun performBack() {
            instance?.performGlobalAction(GLOBAL_ACTION_BACK)
        }

        fun performRecents() {
            instance?.performGlobalAction(GLOBAL_ACTION_RECENTS)
        }

        fun performScrollUp(screenX: Float, screenY: Float) {
            instance?.doSwipe(
                screenX, screenY,
                screenX, screenY - 400f,
                durationMs = 300
            )
        }

        fun performScrollDown(screenX: Float, screenY: Float) {
            instance?.doSwipe(
                screenX, screenY,
                screenX, screenY + 400f,
                durationMs = 300
            )
        }

        fun performScrollLeft(screenX: Float, screenY: Float) {
            instance?.doSwipe(
                screenX, screenY,
                screenX - 500f, screenY,
                durationMs = 300
            )
        }

        fun performScrollRight(screenX: Float, screenY: Float) {
            instance?.doSwipe(
                screenX, screenY,
                screenX + 500f, screenY,
                durationMs = 300
            )
        }

        fun performDragStart(screenX: Float, screenY: Float) {
            instance?.dragStartX = screenX
            instance?.dragStartY = screenY
        }

        fun performDragMove(screenX: Float, screenY: Float) {
            instance?.dragCurrentX = screenX
            instance?.dragCurrentY = screenY
        }

        fun performDragEnd(screenX: Float, screenY: Float) {
            val svc = instance ?: return
            svc.doSwipe(
                svc.dragStartX, svc.dragStartY,
                screenX, screenY,
                durationMs = 600
            )
        }
    }

    // ── Drag state ─────────────────────────────────────────────────────────
    var dragStartX = 0f
    var dragStartY = 0f
    var dragCurrentX = 0f
    var dragCurrentY = 0f

    private val mainHandler = Handler(Looper.getMainLooper())

    // ── Lifecycle ──────────────────────────────────────────────────────────
    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* unused */ }
    override fun onInterrupt() { /* unused */ }

    // ── Gesture helpers ────────────────────────────────────────────────────

    @RequiresApi(Build.VERSION_CODES.N)
    private fun doTap(x: Float, y: Float) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 50L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }

    @RequiresApi(Build.VERSION_CODES.N)
    private fun doSwipe(
        fromX: Float, fromY: Float,
        toX: Float, toY: Float,
        durationMs: Long
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        val path = Path().apply {
            moveTo(fromX, fromY)
            lineTo(toX, toY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0L, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }
}
