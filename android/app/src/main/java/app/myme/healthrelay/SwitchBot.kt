package app.myme.healthrelay

import android.util.Base64
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** SwitchBot の公式 API（v1.1）で、ハブ2などの「いまの温湿度」を読む。履歴は取れないので、貯めるのは RoomSampler 側 */
object SwitchBot {

    data class Reading(val deviceId: String, val temp: Double, val hum: Int)

    private const val HOST = "https://api.switch-bot.com"

    /** 温湿度を持つ機種（ハブ2を優先） */
    private val SENSOR_TYPES = listOf("Hub 2", "Hub 3", "MeterPro", "MeterPro(CO2)", "Meter", "MeterPlus", "WoIOSensor")

    private fun get(path: String, token: String, secret: String): JSONObject {
        val t = System.currentTimeMillis().toString()
        val nonce = UUID.randomUUID().toString()
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val sign = Base64.encodeToString(mac.doFinal((token + t + nonce).toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)

        val c = URL(HOST + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "GET"
            c.connectTimeout = 15000
            c.readTimeout = 30000
            c.setRequestProperty("Authorization", token)
            c.setRequestProperty("sign", sign)
            c.setRequestProperty("t", t)
            c.setRequestProperty("nonce", nonce)
            c.setRequestProperty("Content-Type", "application/json; charset=utf8")
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (code !in 200..299) throw IOException("SwitchBot に繋がりません（$code）")
            val json = JSONObject(text)
            if (json.optInt("statusCode", 100) != 100) throw IOException("SwitchBot：${json.optString("message")}（トークンかシークレットが違うかも）")
            return json
        } finally {
            c.disconnect()
        }
    }

    /** 温湿度の機器を探す（見つけたら deviceId を覚えておく） */
    private fun findDevice(token: String, secret: String): String {
        val list = get("/v1.1/devices", token, secret).getJSONObject("body").getJSONArray("deviceList")
        var best: Pair<Int, String>? = null
        for (i in 0 until list.length()) {
            val d = list.getJSONObject(i)
            val rank = SENSOR_TYPES.indexOf(d.optString("deviceType"))
            if (rank >= 0 && (best == null || rank < best.first)) best = rank to d.getString("deviceId")
        }
        return best?.second ?: throw IOException("温湿度のわかる機器（ハブ2など）が見つかりません")
    }

    fun read(token: String, secret: String, knownDeviceId: String?): Reading {
        val id = knownDeviceId ?: findDevice(token, secret)
        val body = get("/v1.1/devices/$id/status", token, secret).getJSONObject("body")
        if (!body.has("temperature") || !body.has("humidity")) throw IOException("この機器は温湿度を返しませんでした")
        return Reading(id, body.getDouble("temperature"), body.getInt("humidity"))
    }
}
