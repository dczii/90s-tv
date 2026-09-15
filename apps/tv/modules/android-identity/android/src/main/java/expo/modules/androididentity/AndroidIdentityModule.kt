package expo.modules.androididentity

import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

class AndroidIdentityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AndroidIdentity")

    Function("packageName") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context lost")
      context.packageName
    }

    Function("signingCertSha1Hex") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context lost")
      val pm = context.packageManager
      val packageName = context.packageName
      val signatures = if (Build.VERSION.SDK_INT >= 28) {
        val info = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        val signingInfo = info.signingInfo
          ?: return@Function ""
        if (signingInfo.hasMultipleSigners()) {
          signingInfo.apkContentsSigners
        } else {
          signingInfo.signingCertificateHistory
        }
      } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES).signatures
      }
      val first = signatures?.firstOrNull() ?: return@Function ""
      val digest = MessageDigest.getInstance("SHA-1").digest(first.toByteArray())
      digest.joinToString("") { b -> "%02x".format(b) }
    }
  }
}
