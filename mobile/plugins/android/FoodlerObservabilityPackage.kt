package com.foodler.observability

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager
import com.my.tracker.MyTracker

class FoodlerMyTrackerModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "FoodlerMyTracker"

  @ReactMethod fun init(apiKey: String, promise: Promise) = try {
    val config = MyTracker.getTrackerConfig()
    config.setAutotrackingPurchaseEnabled(false)
    config.setTrackingPreinstallEnabled(false)
    config.setLocationTrackingMode(0) // LocationTrackingMode.NONE
    MyTracker.initTracker(apiKey, reactApplicationContext)
    promise.resolve(null)
  } catch (error: Exception) { promise.reject("MYTRACKER_INIT", error) }

  @ReactMethod fun setCustomUserId(value: String, promise: Promise) = try {
    MyTracker.getTrackerParams().setCustomUserId(value)
    promise.resolve(null)
  } catch (error: Exception) { promise.reject("MYTRACKER_IDENTITY", error) }

  @ReactMethod fun trackEvent(name: String, properties: ReadableMap, promise: Promise) = try {
    val params = hashMapOf<String, String>()
    val iterator = properties.keySetIterator()
    while (iterator.hasNextKey()) {
      val key = iterator.nextKey()
      if (!properties.isNull(key)) params[key] = properties.getDynamic(key).asString()
    }
    MyTracker.trackEvent(name, params)
    promise.resolve(null)
  } catch (error: Exception) { promise.reject("MYTRACKER_EVENT", error) }

  @ReactMethod fun flush(promise: Promise) = try { MyTracker.flush(); promise.resolve(null) }
  catch (error: Exception) { promise.reject("MYTRACKER_FLUSH", error) }
}

class FoodlerTracerModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "FoodlerTracer"
  @ReactMethod fun init(dsn: String, promise: Promise) {
    // Crash/ANR/native and crash-free are installed by the Tracer Android SDK at app start.
    // JS native capture stays disabled: this module sends Sentry protocol events itself.
    reactApplicationContext.getSharedPreferences("foodler_observability", 0)
      .edit().putBoolean("consent", true).apply()
    promise.resolve(null)
  }
  @ReactMethod fun capture(payload: String, promise: Promise) {
    // The DSN endpoint is intentionally handled by the JS transport with a timeout.
    promise.resolve(null)
  }
}

class FoodlerObservabilityPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(FoodlerMyTrackerModule(context), FoodlerTracerModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
