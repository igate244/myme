package app.myme.healthrelay

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZoneId

/** SwitchBot から「いまの温湿度」を読んで、MYME（Firestore）に1件足す。30分おきに呼ばれる */
object RoomSampler {

    /** 成功すれば「24.5℃ 48%」。SwitchBot の鍵が未設定なら null */
    suspend fun run(ctx: Context): String? = withContext(Dispatchers.IO) {
        val (token, secret) = Pairing.loadSwitchBot(ctx) ?: return@withContext null
        val pairing = Pairing.load(ctx) ?: throw IllegalStateException("連携コードがまだ入っていません")
        val reading = SwitchBot.read(token, secret, Pairing.switchBotDevice(ctx))
        Pairing.saveSwitchBotDevice(ctx, reading.deviceId)

        val session = FirestoreClient.signIn(pairing)
        if (session.refreshToken != pairing.refreshToken) Pairing.save(ctx, Pairing(pairing.uid, session.refreshToken))
        val date = LocalDate.now(ZoneId.systemDefault()).toString()
        FirestoreClient.appendRoomSample(session, date, System.currentTimeMillis() / 60000L, reading.temp, reading.hum)
        "${"%.1f".format(java.util.Locale.US, reading.temp)}℃ ${reading.hum}%"
    }
}
