package com.handtrackapp.cursor

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

/**
 * CursorControlModule
 * --------------------
 * Exposes cursor lifecycle and configuration to React Native.
 *
 * JS usage:
 *   import { NativeModules } from 'react-native';
 *   const { CursorControlModule } = NativeModules;
 *
 *   CursorControlModule.startCursor();
 *   CursorControlModule.stopCursor();
 *   CursorControlModule.checkOverlayPermission(promise);
 *   CursorControlModule.requestOverlayPermission();
 */
class CursorControlModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "CursorControlModule"

    @ReactMethod
    fun startCursor() {
        val intent = Intent(reactContext, CursorOverlayService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun stopCursor() {
        val intent = Intent(reactContext, CursorOverlayService::class.java)
        reactContext.stopService(intent)
    }

    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(reactContext)
        } else {
            true
        }
        promise.resolve(granted)
    }

    @ReactMethod
    fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            !Settings.canDrawOverlays(reactContext)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactContext.packageName}")
            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            reactContext.startActivity(intent)
        }
    }
}
