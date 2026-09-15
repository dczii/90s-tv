package expo.modules.devicetime

import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceTimeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceTime")

    Events("onActivityResume")

    Function("deviceTime") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context lost")
      val bootCountStr = Settings.Global.getString(
        context.contentResolver,
        Settings.Global.BOOT_COUNT,
      )
      val bootCount = bootCountStr?.toIntOrNull()
      mapOf(
        "elapsedRealtimeMs" to SystemClock.elapsedRealtime(),
        "wallClockMs" to System.currentTimeMillis(),
        "bootCount" to bootCount,
      )
    }

    OnActivityEntersForeground {
      sendEvent("onActivityResume", emptyMap<String, Any>())
    }
  }
}
