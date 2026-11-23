package ph.ownpos.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Downloads an OwnPOS update inside the app (with progress) and hands it to Android's installer. */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private volatile boolean cancelled = false;

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        final String name = call.getString("fileName", "OwnPOS-update.apk");
        if (url == null || url.isEmpty()) { call.reject("No download address"); return; }
        cancelled = false;
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("Can't make a folder for the update");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File out = new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_"));

                URL u = new URL(url);
                int redirects = 0;
                while (true) {
                    conn = (HttpURLConnection) u.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(30000);
                    conn.setRequestProperty("Accept", "application/octet-stream");
                    int code = conn.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (loc == null || ++redirects > 6) throw new IOException("The download address didn't work");
                        u = new URL(u, loc);
                        continue;
                    }
                    if (code != 200) throw new IOException("The server answered " + code);
                    break;
                }
                long total = conn.getContentLengthLong();
                long done = 0;
                int lastPct = -1;
                long lastEmit = 0;
                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        if (cancelled) throw new IOException("cancelled");
                        os.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        long now = System.currentTimeMillis();
                        if (pct != lastPct && now - lastEmit > 150) {
                            emit(pct, done, total);
                            lastPct = pct;
                            lastEmit = now;
                        }
                    }
                }
                emit(100, done, total);
                JSObject ret = new JSObject();
                ret.put("path", out.getAbsolutePath());
                ret.put("size", done);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(cancelled ? "cancelled" : (e.getMessage() == null ? "Download failed" : e.getMessage()));
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void emit(int pct, long done, long total) {
        JSObject ev = new JSObject();
        ev.put("percent", pct);
        ev.put("done", done);
        ev.put("total", total);
        notifyListeners("progress", ev);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject r = new JSObject();
        r.put("allowed", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("No update file"); return; }
        File f = new File(path);
        if (!f.exists()) { call.reject("The downloaded update is missing. Download it again."); return; }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Couldn't open the installer" : e.getMessage());
        }
    }
}
