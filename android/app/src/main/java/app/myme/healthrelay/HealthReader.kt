package app.myme.healthrelay

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
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
) {
    fun hasAny(): Boolean = (steps ?: 0L) > 0L || hrAvg != null || spo2Avg != null || sleepMin != null || workoutsJson != null

    /** Firestore（REST）の形。MYME の src/domain/body.ts がこれを読む */
    fun toFields(): JSONObject {
        val f = JSONObject()
        fun int(name: String, v: Long?) { if (v != null) f.put(name, JSONObject().put("integerValue", v.toString())) }
        fun dbl(name: String, v: Double?) { if (v != null) f.put(name, JSONObject().put("doubleValue", v)) }
        int("steps", steps)
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

        // 血中酸素
        val spo2 = client.readRecords(
            ReadRecordsRequest(
                recordType = OxygenSaturationRecord::class,
                timeRangeFilter = range,
                dataOriginFilter = MI_ORIGINS,
            ),
        ).records.map { it.percentage.value }

        // 睡眠：その日に「起きた」ものを、その日の分にする
        val sleepRange = TimeRangeFilter.between(start.minus(Duration.ofHours(18)), end)
        val sessions = client.readRecords(
            ReadRecordsRequest(
                recordType = SleepSessionRecord::class,
                timeRangeFilter = sleepRange,
                dataOriginFilter = MI_ORIGINS,
            ),
        ).records
            .filter { !it.endTime.isBefore(start) && it.endTime.isBefore(end) }
            .sortedBy { it.startTime }

        // 同じ睡眠が途中の同期と最終版で2件入ることがある。重なっていたら終わりが遅いほうだけ使う。
        val kept = ArrayList<SleepSessionRecord>()
        for (s in sessions) {
            val last = kept.lastOrNull()
            if (last != null && s.startTime.isBefore(last.endTime)) {
                if (s.endTime.isAfter(last.endTime)) kept[kept.size - 1] = s
            } else {
                kept.add(s)
            }
        }
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

        return DayData(
            date = date.toString(),
            steps = stepsAgg[StepsRecord.COUNT_TOTAL],
            hrMin = hrAgg[HeartRateRecord.BPM_MIN],
            hrAvg = hrAgg[HeartRateRecord.BPM_AVG],
            hrMax = hrAgg[HeartRateRecord.BPM_MAX],
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
