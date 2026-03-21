package com.handtrackapp.cursor

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.view.*
import android.widget.ImageView
import androidx.annotation.RequiresApi

/**
 * CursorOverlayService
 * ---------------------
 * Draws a floating native mouse-pointer cursor on top of all apps via
 * WindowManager. Receives smoothed coordinates from HandTrackingModule via
 * a static singleton so no IPC is needed.
 *
 * Smoothing: Exponential Moving Average (EMA) with configurable alpha.
 *   smoothed = alpha * raw + (1 - alpha) * previous
 *   alpha = 0.15 → very smooth (laggy), 0.35 → balanced (recommended)
 *
 * Usage:
 *   CursorOverlayService.updatePosition(normX, normY)   // from any thread
 *   startService(Intent(context, CursorOverlayService::class.java))
 */
class CursorOverlayService : Service() {

    companion object {
        private const val EMA_ALPHA = 0.25f          // smoothing factor (0–1)
        private const val CURSOR_SIZE_DP = 32f

        // Thread-safe raw input updated by HandTrackingModule
        @Volatile private var rawNormX: Float = 0.5f
        @Volatile private var rawNormY: Float = 0.5f

        /** Called by HandTrackingModule on every MediaPipe frame */
        fun updatePosition(normX: Float, normY: Float) {
            rawNormX = normX.coerceIn(0f, 1f)
            rawNormY = normY.coerceIn(0f, 1f)
        }

        /** Shared state so the RN module can query last smoothed position */
        @Volatile var smoothedScreenX: Float = 0f
        @Volatile var smoothedScreenY: Float = 0f
    }

    // ── WindowManager ──────────────────────────────────────────────────────
    private lateinit var windowManager: WindowManager
    private lateinit var cursorView: ImageView
    private lateinit var layoutParams: WindowManager.LayoutParams

    // ── EMA state ──────────────────────────────────────────────────────────
    private var emaX: Float = 0.5f
    private var emaY: Float = 0.5f

    // ── Screen dimensions ──────────────────────────────────────────────────
    private var screenWidth: Int = 1080
    private var screenHeight: Int = 1920

    // ── Runnable loop ──────────────────────────────────────────────────────
    private val updateRunnable = object : Runnable {
        override fun run() {
            applyEMA()
            moveCursor()
            cursorView.handler?.postDelayed(this, 16L) // ~60 fps
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    override fun onCreate() {
        super.onCreate()
        resolveScreenSize()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createCursorView()
        attachToWindowManager()
        emaX = rawNormX
        emaY = rawNormY
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        cursorView.post(updateRunnable)
        return START_STICKY
    }

    override fun onDestroy() {
        cursorView.handler?.removeCallbacks(updateRunnable)
        runCatching { windowManager.removeView(cursorView) }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Helpers ────────────────────────────────────────────────────────────

    private fun resolveScreenSize() {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val bounds = wm.currentWindowMetrics.bounds
            screenWidth = bounds.width()
            screenHeight = bounds.height()
        } else {
            val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(metrics)
            screenWidth = metrics.widthPixels
            screenHeight = metrics.heightPixels
        }
    }

    private fun createCursorView() {
        val sizePx = dpToPx(CURSOR_SIZE_DP).toInt()
        cursorView = ImageView(this).apply {
            setImageDrawable(buildCursorDrawable())
            layoutParams = ViewGroup.LayoutParams(sizePx, sizePx)
        }
    }

    private fun attachToWindowManager() {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_SYSTEM_ALERT

        layoutParams = WindowManager.LayoutParams(
            dpToPx(CURSOR_SIZE_DP).toInt(),
            dpToPx(CURSOR_SIZE_DP).toInt(),
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = screenWidth / 2
            y = screenHeight / 2
        }
        windowManager.addView(cursorView, layoutParams)
    }

    /** Apply EMA smoothing to raw normalized coordinates */
    private fun applyEMA() {
        emaX = EMA_ALPHA * rawNormX + (1f - EMA_ALPHA) * emaX
        emaY = EMA_ALPHA * rawNormY + (1f - EMA_ALPHA) * emaY
    }

    /** Convert smoothed normalized → absolute pixels and update WindowManager */
    private fun moveCursor() {
        val px = (emaX * screenWidth).toInt()
        val py = (emaY * screenHeight).toInt()
        smoothedScreenX = px.toFloat()
        smoothedScreenY = py.toFloat()

        layoutParams.x = px
        layoutParams.y = py
        runCatching { windowManager.updateViewLayout(cursorView, layoutParams) }
    }

    /** Programmatically draw an arrow-cursor bitmap */
    private fun buildCursorDrawable(): android.graphics.drawable.Drawable {
        val size = dpToPx(CURSOR_SIZE_DP).toInt()
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)

        // Shadow
        val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(80, 0, 0, 0)
            style = Paint.Style.FILL
        }
        // Arrow fill
        val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.FILL
        }
        // Arrow stroke
        val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#212121")
            style = Paint.Style.STROKE
            strokeWidth = dpToPx(1.5f)
        }

        val s = size.toFloat()
        val path = Path().apply {
            moveTo(2f, 2f)
            lineTo(2f, s * 0.72f)
            lineTo(s * 0.28f, s * 0.50f)
            lineTo(s * 0.44f, s * 0.86f)
            lineTo(s * 0.56f, s * 0.80f)
            lineTo(s * 0.40f, s * 0.44f)
            lineTo(s * 0.66f, s * 0.44f)
            close()
        }
        // Draw shadow offset
        canvas.save()
        canvas.translate(2f, 2f)
        canvas.drawPath(path, shadowPaint)
        canvas.restore()

        canvas.drawPath(path, fillPaint)
        canvas.drawPath(path, strokePaint)

        return android.graphics.drawable.BitmapDrawable(resources, bmp)
    }

    private fun dpToPx(dp: Float): Float =
        dp * resources.displayMetrics.density
}
