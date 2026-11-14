package app.myme.healthrelay

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Firebase の設定値（MYME の config.ts と同じ。公開して問題ない値） */
private const val API_KEY = "AIzaSyC-VPVNpKD2yTrf73hbm6QpocGQB-7LiKk"
private const val PROJECT = "myme-c829c"

data class Session(val uid: String, val idToken: String, val refreshToken: String)

/**
 * Firebase SDK は使わず REST だけで動かす。
 *  1. 連携コードの更新用トークンから、短い期間だけ使える ID トークンをもらう
 *  2. その ID トークンで Firestore の users/{uid}/health/{日付} に書く
 */
object FirestoreClient {

    private fun post(
        url: String,
        contentType: String,
        body: String,
        bearer: String? = null,
        referer: String? = null,
    ): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15000
            c.readTimeout = 30000
            c.doOutput = true
            c.setRequestProperty("Content-Type", contentType)
            if (bearer != null) c.setRequestProperty("Authorization", "Bearer $bearer")
            if (referer != null) c.setRequestProperty("Referer", referer)
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return code to text
        } finally {
            c.disconnect()
        }
    }

    fun signIn(pairing: Pairing): Session {
        val body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(pairing.refreshToken, "UTF-8")
        val (code, text) = post(
            "https://securetoken.googleapis.com/v1/token?key=$API_KEY",
            "application/x-www-form-urlencoded",
            body,
            // API キーが MYME のアドレスからの利用に限定されていても通るように
            referer = "https://myme-c829c.web.app/",
        )
        if (code != 200) throw IOException("認証に失敗しました（$code）。連携コードを入れ直してください")
        val json = JSONObject(text)
        val uid = json.getString("user_id")
        if (uid != pairing.uid) throw IOException("連携コードのアカウントが一致しません")
        return Session(uid, json.getString("id_token"), json.optString("refresh_token", pairing.refreshToken))
    }

    /** 日ごとのドキュメントをまとめて書き込む（同じ日があれば上書き） */
    fun writeDays(session: Session, days: List<DayData>) {
        if (days.isEmpty()) return
        val base = "projects/$PROJECT/databases/(default)/documents"
        val writes = JSONArray()
        for (d in days) {
            writes.put(
                JSONObject().put(
                    "update",
                    JSONObject()
                        .put("name", "$base/users/${session.uid}/health/${d.date}")
                        .put("fields", d.toFields()),
                ),
            )
        }
        val (code, text) = post(
            "https://firestore.googleapis.com/v1/$base:commit",
            "application/json",
            JSONObject().put("writes", writes).toString(),
            session.idToken,
        )
        if (code !in 200..299) throw IOException("書き込みに失敗しました（$code）${text.take(120)}")
    }
}
