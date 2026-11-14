package app.myme.healthrelay

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZoneId

object Syncer {

    /** 直近 days 日分をヘルスコネクトから読んで Firestore に送る。結果の短い説明を返す */
    suspend fun run(ctx: Context, recentDays: Int = 14): String = withContext(Dispatchers.IO) {
        val pairing = Pairing.load(ctx) ?: throw IllegalStateException("連携コードがまだ入っていません")
        if (HealthConnectClient.getSdkStatus(ctx) != HealthConnectClient.SDK_AVAILABLE) {
            throw IllegalStateException("ヘルスコネクトが使えません")
        }
        val client = HealthConnectClient.getOrCreate(ctx)
        val granted = client.permissionController.getGrantedPermissions()
        if (!granted.containsAll(HealthReader.CORE_PERMISSIONS)) {
            throw IllegalStateException("ヘルスコネクトの許可が足りません（アプリを開いて「許可する」）")
        }

        val session = FirestoreClient.signIn(pairing)
        if (session.refreshToken != pairing.refreshToken) Pairing.save(ctx, Pairing(pairing.uid, session.refreshToken))

        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        // 古い記録を読む許可があって、まだ過去分を送っていなければ、1年分を一度だけまとめて送る
        val canBackfill = granted.contains(HealthReader.HISTORY_PERMISSION) && !Pairing.backfilled(ctx)
        val days = if (canBackfill) 365 else recentDays
        // 30日ずつ、5日ぶんを同時に読んでは送る（1年分でも途中で止まりにくく、速い）
        val withData = mutableListOf<DayData>()
        for (chunk in (0 until days).chunked(30)) {
            val read = coroutineScope {
                chunk.chunked(5).flatMap { group ->
                    group.map { async { HealthReader.readDay(client, today.minusDays(it.toLong()), zone) } }.awaitAll()
                }
            }
            val found = read.filter { it.hasAny() }
            FirestoreClient.writeDays(session, found)
            withData.addAll(found)
        }
        if (canBackfill) Pairing.setBackfilled(ctx)

        val stepDays = withData.count { (it.steps ?: 0L) > 0L }
        var text = "${withData.size}日分を送信（歩数あり${stepDays}日）" + if (canBackfill) "／過去1年分を取り込み" else ""
        if (stepDays == 0) {
            // 歩数が1日も取れないときは、取り込み元の名前を見せて原因を探しやすくする
            val origins = try { HealthReader.recentOrigins(client, zone) } catch (e: Exception) { emptySet() }
            text += "／歩数の取り込み元：${origins.joinToString().ifEmpty { "なし" }}"
        }
        Pairing.saveLastSync(ctx, text)
        text
    }
}
