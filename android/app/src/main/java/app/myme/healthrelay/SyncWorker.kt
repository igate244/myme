package app.myme.healthrelay

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.IOException
import java.util.concurrent.TimeUnit

/** 6時間おきにこっそり同期する */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result =
        try {
            Syncer.run(applicationContext)
            Result.success()
        } catch (e: IOException) {
            // 電波が悪いなど。あとでやり直す
            Result.retry()
        } catch (e: Exception) {
            // 許可が足りない・連携コードが無いなど。アプリを開いたときに画面に出る
            Pairing.saveLastSync(applicationContext, "自動同期に失敗：${e.message}")
            Result.success()
        }

    companion object {
        private const val NAME = "myme-health-sync"

        fun schedule(ctx: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
