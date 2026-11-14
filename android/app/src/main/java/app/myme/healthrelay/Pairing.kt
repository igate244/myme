package app.myme.healthrelay

import android.content.Context
import android.util.Base64
import org.json.JSONObject

/** MYME の「からだ」画面で出した連携コードの中身（uid と、ログインの更新用トークン） */
data class Pairing(val uid: String, val refreshToken: String) {
    companion object {
        private const val PREFS = "relay"

        /** 貼られたコードを読む。形が違えば null */
        fun decode(code: String): Pairing? {
            return try {
                var s = code.trim().replace("\\s".toRegex(), "")
                while (s.length % 4 != 0) s += "="
                val json = JSONObject(String(Base64.decode(s, Base64.URL_SAFE), Charsets.UTF_8))
                val uid = json.getString("u")
                val refresh = json.getString("r")
                if (uid.isEmpty() || refresh.isEmpty()) null else Pairing(uid, refresh)
            } catch (e: Exception) {
                null
            }
        }

        fun load(ctx: Context): Pairing? {
            val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val uid = p.getString("uid", null) ?: return null
            val refresh = p.getString("refresh", null) ?: return null
            return Pairing(uid, refresh)
        }

        fun save(ctx: Context, pairing: Pairing) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("uid", pairing.uid)
                .putString("refresh", pairing.refreshToken)
                .apply()
        }

        fun clear(ctx: Context) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        }

        fun saveLastSync(ctx: Context, text: String) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("lastSync", text)
                .putLong("lastSyncAt", System.currentTimeMillis())
                .apply()
        }

        /** 過去分をまとめて送る作業が済んでいるか */
        fun backfilled(ctx: Context): Boolean =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("backfilled3", false)

        fun setBackfilled(ctx: Context) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("backfilled3", true).apply()
        }

        /** SwitchBot のトークンとシークレット（この端末の中だけに置く） */
        fun saveSwitchBot(ctx: Context, token: String, secret: String) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("sbToken", token).putString("sbSecret", secret).remove("sbDevice").apply()
        }

        fun loadSwitchBot(ctx: Context): Pair<String, String>? {
            val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val t = p.getString("sbToken", null) ?: return null
            val s = p.getString("sbSecret", null) ?: return null
            return t to s
        }

        fun switchBotDevice(ctx: Context): String? =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("sbDevice", null)

        fun saveSwitchBotDevice(ctx: Context, id: String) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("sbDevice", id).apply()
        }

        fun lastSync(ctx: Context): String? =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("lastSync", null)
    }
}
