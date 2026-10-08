package studylock.com.app.lock

import android.app.AppOpsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StudyLockAndroidModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  private fun open(intent: Intent) = context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

  override fun definition() = ModuleDefinition {
    Name("StudyLockAndroid")

    Function("listApps") {
      val pm = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { mapOf("packageName" to it.activityInfo.packageName, "label" to it.loadLabel(pm).toString()) }
        .filter { it["packageName"] != context.packageName }
        .distinctBy { it["packageName"] }
        .sortedBy { it["label"]!!.lowercase() }
    }

    Function("getConfig") {
      mapOf(
        "goal" to Lock.goal(context),
        "study" to Lock.study(context).toList(),
        "allowed" to Lock.allowed(context).toList(),
        "setup" to Lock.isSetUp(context),
        "lockAt" to Lock.lockAt(context),
      )
    }

    Function("setConfig") { goal: Int, lockAt: Int, study: List<String>, allowed: List<String> ->
      Lock.prefs(context).edit()
        .putInt("goal", goal)
        .putInt("lockAt", lockAt)
        .putStringSet("study", study.toSet())
        .putStringSet("allowed", allowed.toSet())
        .putBoolean("setup", true)
        .apply()
    }

    Function("minutesToday") { Lock.minutesToday(context) }
    Function("isLocked") { Lock.isLocked(context) }

    Function("getLastUrl") { Lock.prefs(context).getString("lastUrl", null) }
    Function("setLastUrl") { url: String -> Lock.prefs(context).edit().putString("lastUrl", url).apply() }

    Function("hasUsageAccess") {
      val ops = context.getSystemService(AppOpsManager::class.java)
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) ==
        AppOpsManager.MODE_ALLOWED
    }

    Function("isServiceEnabled") {
      val me = ComponentName(context, BlockService::class.java)
      val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
      enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }

    Function("openUsageAccess") { open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }
    Function("openAccessibility") { open(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
    Function("openAppDetails") {
      open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
    }
  }
}
