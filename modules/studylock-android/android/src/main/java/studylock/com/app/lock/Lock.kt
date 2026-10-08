package studylock.com.app.lock

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import java.util.Calendar

// Shared by the JS module and the accessibility service. State lives in SharedPreferences.
object Lock {
  fun prefs(c: Context) = c.getSharedPreferences("studylock", Context.MODE_PRIVATE)

  fun goal(c: Context) = prefs(c).getInt("goal", 30)
  fun study(c: Context): Set<String> = prefs(c).getStringSet("study", emptySet())!!
  fun allowed(c: Context): Set<String> = prefs(c).getStringSet("allowed", emptySet())!!
  fun isSetUp(c: Context) = prefs(c).getBoolean("setup", false)
  fun lockAt(c: Context) = prefs(c).getInt("lockAt", 0) // minutes after midnight

  // Locked from today's lock time until today's study goal is met.
  fun isLocked(c: Context): Boolean {
    if (!isSetUp(c)) return false
    val now = Calendar.getInstance()
    val nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
    return nowMin >= lockAt(c) && minutesToday(c) < goal(c)
  }

  // Foreground time since local midnight in StudyLock itself (elon.io runs inside it)
  // plus any extra study apps, from Android's usage events.
  fun minutesToday(c: Context): Int {
    val study = study(c) + c.packageName
    val midnight = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val now = System.currentTimeMillis()
    val events = c.getSystemService(UsageStatsManager::class.java).queryEvents(midnight, now)
    val resumedAt = mutableMapOf<String, Long>()
    var total = 0L
    val e = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      if (e.packageName !in study) continue
      when (e.eventType) {
        UsageEvents.Event.ACTIVITY_RESUMED -> resumedAt.putIfAbsent(e.packageName, e.timeStamp)
        UsageEvents.Event.ACTIVITY_PAUSED -> resumedAt.remove(e.packageName)?.let { total += e.timeStamp - it }
      }
    }
    resumedAt.values.forEach { total += now - it } // still open
    // ponytail: a study session that started before midnight only counts from its next resume.
    return (total / 60_000).toInt()
  }

  // Only launchable user apps get blocked; system UI, keyboards etc. never do.
  fun isBlockable(c: Context, pkg: String): Boolean {
    if (pkg == c.packageName || pkg == "com.android.settings") return false
    if (pkg in study(c) || pkg in allowed(c)) return false
    val pm = c.packageManager
    if (pm.getLaunchIntentForPackage(pkg) == null) return false
    val home = pm.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)
    if (home?.activityInfo?.packageName == pkg) return false
    val ime = Settings.Secure.getString(c.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
    return ime?.startsWith("$pkg/") != true
  }
}
