#include <jni.h>
#include <gdal.h>
#include <gdal_priv.h>
#include <sstream>
#include <string>

extern "C" JNIEXPORT jstring JNICALL
Java_com_agis_nativeapp_MainActivity_nativeGdalStatus(JNIEnv* env, jobject) {
    GDALAllRegister();
    std::ostringstream out;
    out << "Native GDAL is linked into this Android process.\n\n";
    out << "GDAL version: " << GDALVersionInfo("--version") << "\n";
    auto* manager = GetGDALDriverManager();
    out << "Registered drivers: " << manager->GetDriverCount() << "\n\n";
    out << "Available drivers:\n";
    for (int i = 0; i < manager->GetDriverCount(); ++i) {
        auto* driver = manager->GetDriver(i);
        if (driver) out << "- " << driver->GetDescription() << "\n";
    }
    out << "\nArchitecture: Android ARM64 (arm64-v8a)\n";
    out << "Runtime: C++17 + JNI · Python-free\n";
    const std::string result = out.str();
    return env->NewStringUTF(result.c_str());
}
