plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.myme.healthrelay"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.myme.healthrelay"
        minSdk = 28
        targetSdk = 34
        versionCode = 8
        versionName = "1.5"
    }

    // 自分のスマホに直接入れる（Playストアに出さない）ためのアプリ。
    // 上書きインストールで更新できるよう、署名の鍵は固定してリポジトリに置いている。
    signingConfigs {
        create("relay") {
            storeFile = file("relay.keystore")
            storePassword = "mymerelay"
            keyAlias = "relay"
            keyPassword = "mymerelay"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("relay")
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
