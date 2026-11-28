package com.seadrift.game;

import android.app.Activity;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.WebView;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String OTA_PREFS = "SeaDriftOtaPrefs";
    private static final String KEY_OTA_VERSION = "otaVersion";
    private static final String BACKUP_PREFS = "SeaDriftProgressBackup";
    private static final String KEY_BACKUP_JSON = "snapshot";
    private static final String[] STATIC_PUBLIC_FILES = new String[] {
        "apple-touch-icon.png",
        "favicon.png",
        "icon-192.png",
        "icon.png",
        "icon.svg",
        "manifest.webmanifest",
    };

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getUpdateInfo(PluginCall call) {
        SharedPreferences otaPrefs = getContext().getSharedPreferences(OTA_PREFS, Activity.MODE_PRIVATE);
        SharedPreferences wvPrefs = getContext().getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE);
        String savedPath = wvPrefs.getString(WebView.CAP_SERVER_PATH, "");
        boolean usingOta = savedPath != null && !savedPath.isEmpty() && new File(savedPath, "index.html").exists();

        JSObject ret = new JSObject();
        ret.put("usingOta", usingOta);
        ret.put("otaVersion", usingOta ? otaPrefs.getString(KEY_OTA_VERSION, "") : "");
        ret.put("serverBasePath", bridge != null ? bridge.getServerBasePath() : "");
        call.resolve(ret);
    }

    @PluginMethod
    public void checkUpdate(PluginCall call) {
        String manifestUrl = call.getString("manifestUrl");
        if (manifestUrl == null || manifestUrl.isEmpty()) {
            call.reject("Missing manifestUrl");
            return;
        }

        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                String sep = manifestUrl.contains("?") ? "&" : "?";
                URL url = new URL(manifestUrl + sep + "t=" + System.currentTimeMillis());
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(8000);
                conn.setUseCaches(false);
                conn.setRequestProperty("Cache-Control", "no-cache");

                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    JSObject offlineRet = new JSObject();
                    offlineRet.put("online", false);
                    call.resolve(offlineRet);
                    return;
                }

                String body = readUtf8(conn.getInputStream());
                JSONObject json = new JSONObject(body);
                JSObject ret = new JSObject();
                ret.put("online", true);
                ret.put("version", json.optString("version", ""));
                ret.put("bundleUrl", json.optString("bundleUrl", ""));
                ret.put("builtAt", json.optString("builtAt", ""));
                call.resolve(ret);
            } catch (Exception e) {
                JSObject offlineRet = new JSObject();
                offlineRet.put("online", false);
                call.resolve(offlineRet);
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    @PluginMethod
    public void applyUpdate(PluginCall call) {
        String bundleUrl = call.getString("bundleUrl");
        String rawVersion = call.getString("version", "latest");
        if (bundleUrl == null || bundleUrl.isEmpty()) {
            call.reject("Missing bundleUrl");
            return;
        }
        String safeVersion = (rawVersion == null ? "latest" : rawVersion).replaceAll("[^a-zA-Z0-9_-]", "_");
        if (safeVersion.isEmpty()) safeVersion = "latest";
        final String targetVersion = safeVersion;

        executor.execute(() -> {
            File otaRoot = new File(getContext().getFilesDir(), "ota");
            File stagingDir = new File(otaRoot, "staging_" + targetVersion + "_" + System.currentTimeMillis());
            File finalDir = new File(otaRoot, "bundle_" + targetVersion);

            HttpURLConnection conn = null;
            try {
                if (!stagingDir.exists() && !stagingDir.mkdirs()) {
                    call.reject("Unable to prepare update folder");
                    return;
                }

                String sep = bundleUrl.contains("?") ? "&" : "?";
                URL url = new URL(bundleUrl + sep + "v=" + targetVersion);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(25000);
                conn.setUseCaches(false);
                conn.setRequestProperty("Cache-Control", "no-cache");

                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    deleteRecursive(stagingDir);
                    call.reject("Server returned HTTP " + code);
                    return;
                }

                byte[] htmlBytes = readBytes(conn.getInputStream());
                String previewHead = new String(
                    htmlBytes,
                    0,
                    Math.min(htmlBytes.length, 4096),
                    StandardCharsets.UTF_8
                ).toLowerCase();
                String previewTail = new String(
                    htmlBytes,
                    Math.max(0, htmlBytes.length - 1024),
                    Math.min(htmlBytes.length, 1024),
                    StandardCharsets.UTF_8
                ).toLowerCase();

                if (
                    htmlBytes.length < 30000 ||
                    !previewHead.contains("<!doctype html") ||
                    !previewTail.contains("</html>")
                ) {
                    deleteRecursive(stagingDir);
                    call.reject("Downloaded update failed integrity check");
                    return;
                }

                File stagedIndex = new File(stagingDir, "index.html");
                try (FileOutputStream fos = new FileOutputStream(stagedIndex)) {
                    fos.write(htmlBytes);
                }

                copyBundledStaticAssets(stagingDir);

                if (finalDir.exists()) {
                    deleteRecursive(finalDir);
                }
                if (!stagingDir.renameTo(finalDir)) {
                    deleteRecursive(stagingDir);
                    call.reject("Failed to activate downloaded update");
                    return;
                }

                cleanupOldBundles(otaRoot, finalDir.getName());

                String activePath = finalDir.getAbsolutePath();
                getContext()
                    .getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE)
                    .edit()
                    .putString(WebView.CAP_SERVER_PATH, activePath)
                    .apply();

                getContext()
                    .getSharedPreferences(OTA_PREFS, Activity.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_OTA_VERSION, rawVersion)
                    .apply();

                JSObject ret = new JSObject();
                ret.put("updated", true);
                ret.put("version", rawVersion);
                ret.put("path", activePath);

                call.resolve(ret);
                bridge.setServerBasePath(activePath);
            } catch (Exception e) {
                deleteRecursive(stagingDir);
                call.reject("Update failed: " + e.getMessage(), e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    @PluginMethod
    public void rollbackToBundled(PluginCall call) {
        getContext()
            .getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE)
            .edit()
            .remove(WebView.CAP_SERVER_PATH)
            .apply();
        getContext()
            .getSharedPreferences(OTA_PREFS, Activity.MODE_PRIVATE)
            .edit()
            .remove(KEY_OTA_VERSION)
            .apply();
        if (bridge != null) {
            bridge.setServerAssetPath("public");
        }
        call.resolve();
    }

    @PluginMethod
    public void saveProgressBackup(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("Missing snapshot");
            return;
        }
        getContext()
            .getSharedPreferences(BACKUP_PREFS, Activity.MODE_PRIVATE)
            .edit()
            .putString(KEY_BACKUP_JSON, snapshot)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void loadProgressBackup(PluginCall call) {
        String snapshot = getContext()
            .getSharedPreferences(BACKUP_PREFS, Activity.MODE_PRIVATE)
            .getString(KEY_BACKUP_JSON, null);
        JSObject ret = new JSObject();
        ret.put("snapshot", snapshot);
        call.resolve(ret);
    }

    private void copyBundledStaticAssets(File targetDir) {
        AssetManager assets = getContext().getAssets();
        byte[] buf = new byte[8192];
        for (String name : STATIC_PUBLIC_FILES) {
            try (InputStream is = assets.open("public/" + name);
                 FileOutputStream fos = new FileOutputStream(new File(targetDir, name))) {
                int n;
                while ((n = is.read(buf)) != -1) {
                    fos.write(buf, 0, n);
                }
            } catch (IOException ignored) {
                // Optional asset; ignore if absent
            }
        }
    }

    private static void cleanupOldBundles(File otaRoot, String keepName) {
        File[] children = otaRoot.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (!child.getName().equals(keepName)) {
                deleteRecursive(child);
            }
        }
    }

    private static void deleteRecursive(File target) {
        if (target == null || !target.exists()) return;
        if (target.isDirectory()) {
            File[] files = target.listFiles();
            if (files != null) {
                for (File f : files) deleteRecursive(f);
            }
        }
        target.delete();
    }

    private static String readUtf8(InputStream is) throws IOException {
        return new String(readBytes(is), StandardCharsets.UTF_8);
    }

    private static byte[] readBytes(InputStream is) throws IOException {
        try (BufferedInputStream bis = new BufferedInputStream(is);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = bis.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }
}
