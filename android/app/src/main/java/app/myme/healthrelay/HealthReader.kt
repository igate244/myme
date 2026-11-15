package app.myme.healthrelay

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId

/** 1日分。取れなかった項目は null（Firestore には書かない） */
data class DayData(
    val date: String,
    val steps: Long?,
    val hrMin: Long?,
    val hrAvg: Long?,
    val hrMax: Long?,
    val spo2Avg: Double?,
    val spo2Min: Double?,
    val sleepMin: Long?,
    val deepMin: Long?,
    val lightMin: Long?,
    val remMin: Long?,
    val awakeMin: Long?,
    val sleepStartMs: Long?,
    val sleepEndMs: Long?,
    val workoutsJson: String?,
    val hrSleepAvg: Long? = null,
    val hrSleepMin: Long? = null,
    val stagesJson: String? = null,
    val hrSeries: String? = null,
    val spo2Series: String? = null,
    val kcalTotal: Long? = null,
    val kcalActive: Long? = null,
) {
    fun hasAny(): Boolean = (steps ?: 0L) > 0L || hrAvg != null || spo2Avg != null || sleepMin != null || workoutsJson != null

    /** Firestore（REST）の形。MYME の src/domain/body.ts がこれを読む */
    fun toFields(): JSONObject {
        val f = JSONObject()
        fun int(name: String, v: Long?) { if (v != null) f.put(name, JSONObject().put("integerValue", v.toString())) }
        fun dbl(name: String, v: Double?) { if (v != null) f.put(name, JSONObject().put("doubleValue", v)) }
        int("steps", steps)
        int("hrSleepAvg", hrSleepAvg)
        int("hrSleepMin", hrSleepMin)
        if (stagesJson != null) f.put("stages", JSONObject().put("stringValue", stagesJson))
        if (hrSeries != null) f.put("hrSeries", JSONObject().put("stringValue", hrSeries))
        if (spo2Series != null) f.put("spo2Series", JSONObject().put("stringValue", spo2Series))
        int("kcalTotal", kcalTotal)
        int("kcalActive", kcalActive)
        int("hrMin", hrMin)
        int("hrAvg", hrAvg)
        int("hrMax", hrMax)
        dbl("spo2Avg", spo2Avg)
        dbl("spo2Min", spo2Min)
        int("sleepMin", sleepMin)
        int("deepMin", deepMin)
        int("lightMin", lightMin)
        int("remMin", remMin)
        int("awakeMin", awakeMin)
        int("sleepStartMs", sleepStartMs)
        int("sleepEndMs", sleepEndMs)
        if (workoutsJson != null) f.put("workouts", JSONObject().put("stringValue", workoutsJson))
        int("updatedAt", System.currentTimeMillis())
        return f
    }
}

object HealthReader {

    /** Mi Fitness が書いたデータだけを使う（スマホ本体の歩数と二重にならないように） */
    private val MI_ORIGINS = setOf(DataOrigin("com.mi.health"), DataOrigin("com.xiaomi.wearable"))

    val CORE_PERMISSIONS: Set<String> = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
    )

    /** バックグラウンド（アプリを開いていない間）の読み取り */
    /** 消費カロリー（総・活動）を読む許可。無くても他の項目は同期できる */
    val CALORIE_PERMISSIONS: Set<String> = setOf(
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    )

    /** 入れる前の古い記録（30日より前）も読める許可 */
    const val HISTORY_PERMISSION = "android.permission.health.READ_HEALTH_DATA_HISTORY"

    const val BACKGROUND_PERMISSION = "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"

    suspend fun readDay(client: HealthConnectClient, date: LocalDate, zone: ZoneId): DayData {
        val start = date.atStartOfDay(zone).toInstant()
        val end = date.plusDays(1).atStartOfDay(zone).toInstant()
        val range = TimeRangeFilter.between(start, end)

        // 歩数・心拍（集計）
        val stepsAgg = client.aggregate(
            AggregateRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = range,
                dataOriginFilter = MI_ORIGINS,
            ),
        )
        val hrAgg = client.aggregate(
            AggregateRequest(
                metrics = setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MIN, HeartRateRecord.BPM_MAX),
                timeRangeFilter = range,
                dataOriginFilter = MI_ORIGINS,
            ),
        )

        // 心拍：集計で取れないときは、記録の中身（サンプル）から自分で出す
        var hrMin = hrAgg[HeartRateRecord.BPM_MIN]
        var hrAvg = hrAgg[HeartRateRecord.BPM_AVG]
        var hrMax = hrAgg[HeartRateRecord.BPM_MAX]
        if (hrAvg == null) {
            val bpms = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateRecord::class,
                    timeRangeFilter = range,
                    dataOriginFilter = MI_ORIGINS,
                ),
            ).records.flatMap { r -> r.samples.map { it.beatsPerMinute } }
            if (bpms.isNotEmpty()) {
                hrMin = bpms.min()
                hrMax = bpms.max()
                hrAvg = Math.round(bpms.average())
            }
        }

        // 血中酸素
        val spo2Records = client.readRecords(
            ReadRecordsRequest(
                recordType = OxygenSaturationRecord::class,
                timeRangeFilter = range,
                dataOriginFilter = MI_ORIGINS,
            ),
        ).records
        val spo2 = spo2Records.map { it.percentage.value }

        // 睡眠：その日に「起きた」ものを、その日の分にする。
        // Mi Fitness は寝ている途中でも同じ睡眠を何度も書き込む（20:54-23:21、20:54-4:26、20:54-6:33 のように
        // 開始が同じで終わりだけ伸びていく）。途中の版が前の日に紛れ込まないよう、
        // 前後の日も含めて広めに読み、重なっているものは終わりが一番遅い版だけにしてから日を決める。
        val sleepRange = TimeRangeFilter.between(start.minus(Duration.ofHours(18)), end.plus(Duration.ofHours(18)))
        val allSessions = client.readRecords(
            ReadRecordsRequest(
                recordType = SleepSessionRecord::class,
                timeRangeFilter = sleepRange,
                dataOriginFilter = MI_ORIGINS,
            ),
        ).records.sortedWith(compareBy({ it.startTime }, { it.endTime }))

        val finals = ArrayList<SleepSessionRecord>()
        for (s in allSessions) {
            val last = finals.lastOrNull()
            if (last != null && s.startTime.isBefore(last.endTime)) {
                if (s.endTime.isAfter(last.endTime)) finals[finals.size - 1] = s
            } else {
                finals.add(s)
            }
        }
        val kept = finals.filter { !it.endTime.isBefore(start) && it.endTime.isBefore(end) }
        var deep = 0L
        var light = 0L
        var rem = 0L
        var awake = 0L
        var plainSleep = 0L
        var wholeMin = 0L
        for (s in kept) {
            wholeMin += Duration.between(s.startTime, s.endTime).toMinutes()
            for (st in s.stages) {
                val m = Duration.between(st.startTime, st.endTime).toMinutes()
                when (st.stage) {
                    SleepSessionRecord.STAGE_TYPE_DEEP -> deep += m
                    SleepSessionRecord.STAGE_TYPE_LIGHT -> light += m
                    SleepSessionRecord.STAGE_TYPE_REM -> rem += m
                    SleepSessionRecord.STAGE_TYPE_SLEEPING -> plainSleep += m
                    SleepSessionRecord.STAGE_TYPE_AWAKE,
                    SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
                    SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> awake += m
                    else -> {}
                }
            }
        }
        val hasStages = kept.any { it.stages.isNotEmpty() }
        // 眠っていた時間。段階の記録があればその合計、なければ寝ていた時間の全体
        val sleepMin = if (kept.isEmpty()) null else if (hasStages) deep + light + rem + plainSleep else wholeMin

        // 睡眠の時間帯の中身：眠りの段階の区切り、心拍（10分ごとの平均）、血中酸素。MYME の「睡眠」の時間ごとの図に使う
        var hrSleepAvg: Long? = null
        var hrSleepMin: Long? = null
        var stagesJson: String? = null
        var hrSeries: String? = null
        var spo2Series: String? = null
        if (kept.isNotEmpty()) {
            val from = kept.first().startTime
            val to = kept.last().endTime

            val stages = JSONArray()
            for (sess in kept) {
                for (st in sess.stages.sortedBy { it.startTime }) {
                    val g = when (st.stage) {
                        SleepSessionRecord.STAGE_TYPE_AWAKE,
                        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
                        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> 0
                        SleepSessionRecord.STAGE_TYPE_REM -> 1
                        SleepSessionRecord.STAGE_TYPE_DEEP -> 3
                        SleepSessionRecord.STAGE_TYPE_LIGHT, SleepSessionRecord.STAGE_TYPE_SLEEPING -> 2
                        else -> -1
                    }
                    if (g >= 0) stages.put(JSONObject().put("g", g).put("s", st.startTime.toEpochMilli()).put("e", st.endTime.toEpochMilli()))
                }
            }
            if (stages.length() > 0) stagesJson = stages.toString()

            val hr = heartSleep(client, from, to, MI_ORIGINS).let { if (it.avg != null || it.series != null) it else heartSleep(client, from, to, emptySet()) }
            hrSleepAvg = hr.avg
            hrSleepMin = hr.min
            hrSeries = hr.series

            val spo2Points = spo2Records.filter { !it.time.isBefore(from) && it.time.isBefore(to) }.sortedBy { it.time }
            if (spo2Points.isNotEmpty()) spo2Series = spo2Points.joinToString(";") { "${it.time.toEpochMilli()},${Math.round(it.percentage.value)}" }
        }

        // 運動
        val workouts = JSONArray()
        val exercises = client.readRecords(
            ReadRecordsRequest(
                recordType = ExerciseSessionRecord::class,
                timeRangeFilter = range,
                dataOriginFilter = MI_ORIGINS,
            ),
        ).records.filter { !it.startTime.isBefore(start) && it.startTime.isBefore(end) }
        for (e in exercises) {
            val meters: Double? = try {
                client.aggregate(
                    AggregateRequest(
                        metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(e.startTime, e.endTime),
                        dataOriginFilter = MI_ORIGINS,
                    ),
                )[DistanceRecord.DISTANCE_TOTAL]?.inMeters
            } catch (ex: Exception) {
                null
            }
            val w = JSONObject()
                .put("t", e.exerciseType)
                .put("s", e.startTime.toEpochMilli())
                .put("e", e.endTime.toEpochMilli())
            if (meters != null) w.put("d", Math.round(meters))
            workouts.put(w)
        }

        // 消費カロリー（許可が無い・取れないときは null）。総＝基礎代謝＋活動
        var kcalTotal: Long? = null
        var kcalActive: Long? = null
        try {
            val total = client.aggregate(
                AggregateRequest(metrics = setOf(TotalCaloriesBurnedRecord.ENERGY_TOTAL), timeRangeFilter = range, dataOriginFilter = MI_ORIGINS),
            )[TotalCaloriesBurnedRecord.ENERGY_TOTAL]
            val active = client.aggregate(
                AggregateRequest(metrics = setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), timeRangeFilter = range, dataOriginFilter = MI_ORIGINS),
            )[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]
            kcalTotal = total?.inKilocalories?.let { Math.round(it) }
            kcalActive = active?.inKilocalories?.let { Math.round(it) }
        } catch (e: SecurityException) {
            // 許可が出ていない
        }

        return DayData(
            date = date.toString(),
            hrSleepAvg = hrSleepAvg,
            hrSleepMin = hrSleepMin,
            stagesJson = stagesJson,
            hrSeries = hrSeries,
            spo2Series = spo2Series,
            kcalTotal = kcalTotal,
            kcalActive = kcalActive,
            steps = stepsAgg[StepsRecord.COUNT_TOTAL],
            hrMin = hrMin,
            hrAvg = hrAvg,
            hrMax = hrMax,
            spo2Avg = if (spo2.isEmpty()) null else spo2.average(),
            spo2Min = spo2.minOrNull(),
            sleepMin = sleepMin,
            deepMin = if (hasStages) deep else null,
            lightMin = if (hasStages) light else null,
            remMin = if (hasStages) rem else null,
            awakeMin = if (hasStages) awake else null,
            sleepStartMs = kept.firstOrNull()?.startTime?.toEpochMilli(),
            sleepEndMs = kept.lastOrNull()?.endTime?.toEpochMilli(),
            workoutsJson = if (workouts.length() == 0) null else workouts.toString(),
        )
    }

    class SleepHeart(val avg: Long?, val min: Long?, val series: String?)

    /** 指定の時間帯の心拍。平均・最低と、10分ごとの平均の並び（"ミリ秒,心拍;…"）。集計で取れなければ、記録の中身（サンプル）から自分で出す */
    private suspend fun heartSleep(client: HealthConnectClient, from: java.time.Instant, to: java.time.Instant, origins: Set<DataOrigin>): SleepHeart {
        val range = TimeRangeFilter.between(from, to)
        val agg = client.aggregate(
            AggregateRequest(metrics = setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MIN), timeRangeFilter = range, dataOriginFilter = origins),
        )
        val samples = client.readRecords(
            ReadRecordsRequest(recordType = HeartRateRecord::class, timeRangeFilter = range, dataOriginFilter = origins),
        ).records.flatMap { r -> r.samples.filter { !it.time.isBefore(from) && it.time.isBefore(to) } }
        val bucketMs = 10 * 60 * 1000L
        val series = samples.groupBy { it.time.toEpochMilli() / bucketMs }.toSortedMap()
            .map { (k, v) -> "${k * bucketMs},${Math.round(v.map { it.beatsPerMinute }.average())}" }
            .joinToString(";")
            .ifEmpty { null }
        var avg = agg[HeartRateRecord.BPM_AVG]
        var min = agg[HeartRateRecord.BPM_MIN]
        if (avg == null && samples.isNotEmpty()) {
            avg = Math.round(samples.map { it.beatsPerMinute }.average())
            min = samples.minOf { it.beatsPerMinute }
        }
        return SleepHeart(avg, min, series)
    }

    /** 確認用：最近の歩数が、どのアプリ由来で入っているか */
    suspend fun recentOrigins(client: HealthConnectClient, zone: ZoneId): Set<String> {
        val end = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant()
        val start = end.minus(Duration.ofDays(3))
        return client.readRecords(
            ReadRecordsRequest(
                recordType = StepsRecord::class,
                timeRangeFilter = TimeRangeFilter.between(start, end),
            ),
        ).records.map { it.metadata.dataOrigin.packageName }.toSet()
    }
}
