package app.myme.healthrelay

import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import kotlinx.coroutines.launch

/**
 * 画面はほぼ無し。やることは3つだけ。
 *  1. MYME の「からだ」画面で出した連携コードを貼る（最初の1回）
 *  2. ヘルスコネクトの許可を出す
 *  3. あとは自動で同期される（「今すぐ同期」でいつでも手動でも）
 */
class MainActivity : ComponentActivity() {

    private lateinit var status: TextView
    private lateinit var codeInput: EditText

    private val permissionContract = PermissionController.createRequestPermissionResultContract()

    private val corePermissionLauncher = registerForActivityResult(permissionContract) { granted ->
        if (granted.containsAll(HealthReader.CORE_PERMISSIONS)) {
            // 続けて、アプリを開いていない間も読めるようにする許可を頼む（出せない端末では何も起きない）
            try {
                backgroundPermissionLauncher.launch(setOf(HealthReader.BACKGROUND_PERMISSION))
            } catch (e: Exception) {
                refreshStatus()
            }
        } else {
            refreshStatus()
        }
    }

    private val backgroundPermissionLauncher = registerForActivityResult(permissionContract) {
        refreshStatus()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SyncWorker.schedule(this)
        setContentView(buildView())
        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun label(text: String, sizeSp: Float = 14f, color: Int = Color.DKGRAY): TextView =
        TextView(this).apply {
            this.text = text
            textSize = sizeSp
            setTextColor(color)
            setPadding(0, dp(6), 0, dp(6))
        }

    private fun button(text: String, onClick: () -> Unit): Button =
        Button(this).apply {
            this.text = text
            isAllCaps = false
            setOnClickListener { onClick() }
        }

    private fun buildView(): ScrollView {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(48), dp(20), dp(32))
        }
        root.addView(label("MYME 中継", 22f, Color.BLACK))
        root.addView(label("バンドの記録を、ヘルスコネクトから MYME に送るアプリです。"))

        status = label("")
        root.addView(status)

        root.addView(label("① 連携コード", 16f, Color.BLACK))
        root.addView(label("MYME の「からだ」→「連携コードを出す」でコピーして、ここに貼ります。"))
        codeInput = EditText(this).apply {
            hint = "ここに貼り付け"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 3
            gravity = Gravity.TOP
            textSize = 12f
        }
        root.addView(codeInput, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(button("コードを保存") { saveCode() })

        root.addView(label("② ヘルスコネクトの許可", 16f, Color.BLACK))
        root.addView(button("許可する") { requestPermissions() })

        root.addView(label("③ 同期", 16f, Color.BLACK))
        root.addView(label("普段は6時間おきに自動で送ります。すぐ送りたいときはこちら。"))
        root.addView(button("今すぐ同期") { syncNow() })

        return ScrollView(this).apply { addView(root) }
    }

    private fun saveCode() {
        val pairing = Pairing.decode(codeInput.text.toString())
        if (pairing == null) {
            status.text = "コードの形が違います。MYME で出し直して、全部コピーして貼ってください。"
            return
        }
        Pairing.save(this, pairing)
        codeInput.setText("")
        refreshStatus()
    }

    private fun requestPermissions() {
        if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
            status.text = "ヘルスコネクトが使えない状態です（Playストアで更新してください）。"
            return
        }
        corePermissionLauncher.launch(HealthReader.CORE_PERMISSIONS)
    }

    private fun syncNow() {
        status.text = "同期中…"
        lifecycleScope.launch {
            val message = try {
                Syncer.run(this@MainActivity)
            } catch (e: Exception) {
                "失敗：${e.message}"
            }
            Pairing.saveLastSync(this@MainActivity, message)
            refreshStatus()
        }
    }

    private fun refreshStatus() {
        val paired = Pairing.load(this) != null
        val lines = ArrayList<String>()
        lines.add(if (paired) "連携コード：入っています" else "連携コード：まだです（①）")
        lines.add(
            when (HealthConnectClient.getSdkStatus(this)) {
                HealthConnectClient.SDK_AVAILABLE -> "ヘルスコネクト：使えます"
                else -> "ヘルスコネクト：使えません"
            },
        )
        Pairing.lastSync(this)?.let { lines.add("前回：$it") }
        status.text = lines.joinToString("\n")
    }
}
