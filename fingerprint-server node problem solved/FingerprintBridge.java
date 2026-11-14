import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.BindException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.zkteco.biometric.FingerprintSensorEx;

public class FingerprintBridge {

    // ---------- settings ----------
    static final int PORT = 8765;
    static final int TOUCH_TIMEOUT_MS = 20000;
    static final int LIFT_TIMEOUT_MS = 10000;
    static final int IDENTIFY_TIMEOUT_MS = 10000;
    static final int TEMPLATE_SIZE = 2048;
    static final int MIN_ENROLL_MATCH_SCORE = 20;
    static final long MAX_BODY_BYTES = 32L * 1024 * 1024;

    static final String TOKEN = emptyIfNull(System.getenv("BRIDGE_TOKEN"));
    // Set env BLOCK_DUPLICATE_FINGERS=true to refuse the same finger under a second ID.
    static final boolean BLOCK_DUPLICATES = "true".equalsIgnoreCase(System.getenv("BLOCK_DUPLICATE_FINGERS"));
    static final Pattern SUBJECT_RE = Pattern.compile("^[A-Za-z0-9_.:@\\- ]{1,64}$");

    // ---------- state ----------
    static final ReentrantLock LOCK = new ReentrantLock();
    static final Map<Integer, String> fidToSubject = new ConcurrentHashMap<Integer, String>();
    static final AtomicInteger nextFid = new AtomicInteger(1);
    static final long startedAt = System.currentTimeMillis();

    static volatile boolean sdkReady = false;
    static volatile long device = 0;
    static volatile long db = 0;
    static volatile int imgW = 0, imgH = 0, deviceCount = 0;
    static volatile String enrollPhase = "idle";
    static volatile int enrollStep = 0;

    // ---------- error type ----------
    static class ApiException extends RuntimeException {
        final int status;
        final String code;

        ApiException(int status, String code, String message) {
            super(message);
            this.status = status;
            this.code = code;
        }
    }

    interface Route {
        String handle(HttpExchange ex, String body) throws Exception;
    }

    // ---------- main ----------
    public static void main(String[] args) throws Exception {
        LOCK.lock();
        try {
            openReader();
            System.out.println("[INFO] Reader opened. Image " + imgW + "x" + imgH);
        } catch (ApiException e) {
            System.out.println("[WARN] Reader not ready: " + e.getMessage());
            System.out.println("[WARN] The bridge will keep trying when you use it.");
        } catch (Throwable t) {
            System.out.println("[WARN] Reader error: " + t);
        } finally {
            LOCK.unlock();
        }

        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), PORT), 0);
        } catch (BindException e) {
            System.out.println("[ERROR] Port " + PORT + " is already in use. Close the other bridge window first.");
            return;
        }

        register(server, "/health", "GET", new Route() {
            public String handle(HttpExchange ex, String body) {
                return health();
            }
        });
        register(server, "/v1/enroll", "POST", new Route() {
            public String handle(HttpExchange ex, String body) {
                return enroll(body);
            }
        });
        register(server, "/v1/identify", "POST", new Route() {
            public String handle(HttpExchange ex, String body) {
                return identify();
            }
        });
        register(server, "/v1/sync", "POST", new Route() {
            public String handle(HttpExchange ex, String body) {
                return sync(body);
            }
        });

        server.setExecutor(Executors.newFixedThreadPool(6));
        server.start();

        Runtime.getRuntime().addShutdownHook(new Thread() {
            public void run() {
                closeAll();
            }
        });

        System.out.println("ZK9500 bridge is ready at http://127.0.0.1:" + PORT);
        if (!TOKEN.isEmpty()) System.out.println("[INFO] Token protection is ON.");
        if (BLOCK_DUPLICATES) System.out.println("[INFO] Duplicate finger blocking is ON.");
    }

    // ---------- http plumbing ----------
    static void register(HttpServer server, String path, final String method, final Route route) {
        server.createContext(path, new com.sun.net.httpserver.HttpHandler() {
            public void handle(HttpExchange ex) throws IOException {
                String out;
                int status = 200;
                try {
                    ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                    ex.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token");
                    ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

                    if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
                        ex.sendResponseHeaders(204, -1);
                        ex.close();
                        return;
                    }
                    if (!method.equalsIgnoreCase(ex.getRequestMethod())) {
                        throw new ApiException(405, "METHOD_NOT_ALLOWED", "Use " + method + " for this endpoint.");
                    }
                    if (!TOKEN.isEmpty()) {
                        String sent = emptyIfNull(ex.getRequestHeaders().getFirst("X-Bridge-Token"));
                        boolean ok = MessageDigest.isEqual(
                                sent.getBytes(StandardCharsets.UTF_8),
                                TOKEN.getBytes(StandardCharsets.UTF_8));
                        if (!ok) throw new ApiException(401, "UNAUTHORIZED", "Missing or wrong bridge token.");
                    }
                    String body = "";
                    if ("POST".equalsIgnoreCase(ex.getRequestMethod())) {
                        body = new String(readAll(ex.getRequestBody()), StandardCharsets.UTF_8);
                    }
                    out = route.handle(ex, body);
                } catch (ApiException e) {
                    status = e.status;
                    out = errorJson(e.code, e.getMessage());
                } catch (Throwable t) {
                    status = 500;
                    out = errorJson("INTERNAL_ERROR", String.valueOf(t));
                    t.printStackTrace();
                }
                send(ex, status, out);
            }
        });
    }

    static void send(HttpExchange ex, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length);
        OutputStream os = ex.getResponseBody();
        os.write(bytes);
        os.close();
        ex.close();
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        long total = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            total += n;
            if (total > MAX_BODY_BYTES) throw new ApiException(413, "BODY_TOO_LARGE", "Request body is too large.");
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    // ---------- json helpers ----------
    static String emptyIfNull(String s) {
        return s == null ? "" : s;
    }

    static String esc(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }

    static String unesc(String s) {
        if (s.indexOf('\\') < 0) return s;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c != '\\' || i + 1 >= s.length()) {
                sb.append(c);
                continue;
            }
            char n = s.charAt(++i);
            switch (n) {
                case 'n': sb.append('\n'); break;
                case 'r': sb.append('\r'); break;
                case 't': sb.append('\t'); break;
                case 'u':
                    if (i + 4 < s.length()) {
                        try {
                            sb.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16));
                            i += 4;
                        } catch (NumberFormatException e) {
                            sb.append('u');
                        }
                    } else {
                        sb.append('u');
                    }
                    break;
                default: sb.append(n); // handles \" \\ \/
            }
        }
        return sb.toString();
    }

    static String getStr(String json, String key) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(json);
        return m.find() ? unesc(m.group(1)) : null;
    }

    static String errorJson(String code, String message) {
        return "{\"status\":\"error\",\"code\":\"" + esc(code) + "\",\"message\":\"" + esc(message)
                + "\",\"error\":\"" + esc(message) + "\"}";
    }

    // ---------- reader ----------
    static int toInt(byte[] b) {
        return (b[0] & 0xff) | ((b[1] & 0xff) << 8) | ((b[2] & 0xff) << 16) | ((b[3] & 0xff) << 24);
    }

    // Call only while holding LOCK.
    static void openReader() {
        if (device != 0 && db != 0) return;

        if (!sdkReady) {
            int r = FingerprintSensorEx.Init();
            if (r != 0) throw new ApiException(503, "HARDWARE_ERROR", "Scanner SDK init failed, code " + r);
            sdkReady = true;
        }

        deviceCount = FingerprintSensorEx.GetDeviceCount();
        if (deviceCount <= 0) {
            throw new ApiException(503, "HARDWARE_ERROR",
                    "No scanner found. Plug in the ZK9500 and close any other app that uses it.");
        }

        long h = FingerprintSensorEx.OpenDevice(0);
        if (h == 0) {
            throw new ApiException(503, "HARDWARE_ERROR",
                    "Could not open the scanner. Close the ZKFinger demo and try again.");
        }

        byte[] p = new byte[4];
        int[] sz = new int[]{4};
        FingerprintSensorEx.GetParameters(h, 1, p, sz);
        int w = toInt(p);
        sz[0] = 4;
        FingerprintSensorEx.GetParameters(h, 2, p, sz);
        int hh = toInt(p);

        long d = FingerprintSensorEx.DBInit();
        if (d == 0) {
            FingerprintSensorEx.CloseDevice(h);
            throw new ApiException(503, "HARDWARE_ERROR", "Could not create the fingerprint cache.");
        }

        imgW = w;
        imgH = hh;
        device = h;
        db = d;
        fidToSubject.clear();
    }

    static void closeAll() {
        try {
            if (db != 0) FingerprintSensorEx.DBFree(db);
            if (device != 0) FingerprintSensorEx.CloseDevice(device);
            if (sdkReady) FingerprintSensorEx.Terminate();
        } catch (Throwable ignored) {
        }
    }

    static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // Waits for a finger. Returns the template, or null on timeout.
    static byte[] capture(int timeoutMs) {
        long end = System.currentTimeMillis() + timeoutMs;
        int size = Math.max(imgW * imgH, 1);
        while (System.currentTimeMillis() < end) {
            byte[] img = new byte[size];
            byte[] tpl = new byte[TEMPLATE_SIZE];
            int[] len = new int[]{TEMPLATE_SIZE};
            int r = FingerprintSensorEx.AcquireFingerprint(device, img, tpl, len);
            if (r == 0 && len[0] > 0) return tpl;
            sleep(150);
        }
        return null;
    }

    // Waits until the finger is lifted (no capture 3 times in a row).
    static boolean waitForLift() {
        long end = System.currentTimeMillis() + LIFT_TIMEOUT_MS;
        int size = Math.max(imgW * imgH, 1);
        int empty = 0;
        while (System.currentTimeMillis() < end) {
            byte[] img = new byte[size];
            byte[] tpl = new byte[TEMPLATE_SIZE];
            int[] len = new int[]{TEMPLATE_SIZE};
            int r = FingerprintSensorEx.AcquireFingerprint(device, img, tpl, len);
            if (r != 0) {
                empty++;
                if (empty >= 3) return true;
            } else {
                empty = 0;
            }
            sleep(150);
        }
        return false;
    }

    static byte[] padded(byte[] src) {
        return Arrays.copyOf(src, TEMPLATE_SIZE);
    }

    static void lockOrBusy() {
        if (!LOCK.tryLock()) {
            throw new ApiException(409, "BUSY", "The scanner is busy with another request. Try again in a moment.");
        }
    }

    // ---------- endpoints ----------
    static String health() {
        if (device == 0 && LOCK.tryLock()) {
            try {
                openReader();
            } catch (Throwable ignored) {
            } finally {
                LOCK.unlock();
            }
        }
        boolean connected = device != 0;
        boolean ready = device != 0 && db != 0;
        int loaded = new HashSet<String>(fidToSubject.values()).size();
        return "{\"status\":\"online\",\"ready\":" + ready
                + ",\"readerConnected\":" + connected
                + ",\"hardwareConnected\":" + connected
                + ",\"deviceCount\":" + deviceCount
                + ",\"startedAt\":" + startedAt
                + ",\"loaded\":" + loaded
                + ",\"enrollPhase\":\"" + esc(enrollPhase) + "\""
                + ",\"enrollStep\":" + enrollStep + "}";
    }

    static String enroll(String body) {
        String subjectId = getStr(body, "subjectId");
        if (subjectId == null || !SUBJECT_RE.matcher(subjectId).matches()) {
            throw new ApiException(400, "INVALID_SUBJECT_ID",
                    "subjectId is missing or has invalid characters (max 64: letters, numbers, _ . : @ - space).");
        }

        lockOrBusy();
        try {
            openReader();
            byte[][] tpls = new byte[3][];

            for (int i = 0; i < 3; i++) {
                enrollPhase = "waiting_for_finger";
                enrollStep = i + 1;
                System.out.println("[ENROLL] " + subjectId + " - touch " + (i + 1) + " of 3");

                byte[] t = capture(TOUCH_TIMEOUT_MS);
                if (t == null) {
                    throw new ApiException(408, "SCAN_TIMEOUT", "No finger detected on touch " + (i + 1) + ". Try again.");
                }

                if (i == 0 && BLOCK_DUPLICATES && !fidToSubject.isEmpty()) {
                    int[] fid = new int[1];
                    int[] score = new int[1];
                    if (FingerprintSensorEx.DBIdentify(db, t, fid, score) == 0) {
                        String other = fidToSubject.get(fid[0]);
                        if (other != null && !other.equals(subjectId)) {
                            throw new ApiException(409, "DUPLICATE_FINGER",
                                    "This finger is already enrolled as " + other + ".");
                        }
                    }
                }

                if (i > 0) {
                    int score = FingerprintSensorEx.DBMatch(db, tpls[0], t);
                    if (score < MIN_ENROLL_MATCH_SCORE) {
                        throw new ApiException(422, "FINGER_MISMATCH",
                                "Touch " + (i + 1) + " did not match touch 1. Use the same finger each time.");
                    }
                }

                tpls[i] = t;

                if (i < 2) {
                    enrollPhase = "lift_finger";
                    if (!waitForLift()) {
                        throw new ApiException(408, "LIFT_TIMEOUT", "Please lift your finger between touches.");
                    }
                }
            }

            enrollPhase = "merging";
            byte[] reg = new byte[TEMPLATE_SIZE];
            int[] regLen = new int[]{TEMPLATE_SIZE};
            int r = FingerprintSensorEx.DBMerge(db, tpls[0], tpls[1], tpls[2], reg, regLen);
            if (r != 0 || regLen[0] <= 0) {
                throw new ApiException(422, "MERGE_FAILED", "Could not combine the 3 touches (code " + r + "). Try again.");
            }

            int fid = nextFid.getAndIncrement();
            int add = FingerprintSensorEx.DBAdd(db, fid, reg);
            if (add != 0) {
                throw new ApiException(500, "DB_ADD_FAILED", "Could not store the template in the scanner cache (code " + add + ").");
            }
            fidToSubject.put(fid, subjectId);

            String b64 = Base64.getEncoder().encodeToString(Arrays.copyOf(reg, regLen[0]));
            System.out.println("[ENROLL] " + subjectId + " done. Template bytes: " + regLen[0]);

            return "{\"status\":\"success\",\"enrolled\":true,\"subjectId\":\"" + esc(subjectId)
                    + "\",\"templateBase64\":\"" + b64 + "\"}";
        } finally {
            enrollPhase = "idle";
            enrollStep = 0;
            LOCK.unlock();
        }
    }

    static String identify() {
        lockOrBusy();
        try {
            openReader();
            if (fidToSubject.isEmpty()) {
                throw new ApiException(404, "FINGERPRINT_NOT_FOUND",
                        "No fingerprints are loaded in the bridge. Click Sync first.");
            }

            byte[] t = capture(IDENTIFY_TIMEOUT_MS);
            if (t == null) throw new ApiException(408, "NO_FINGER", "No finger detected. Place your finger on the scanner.");

            int[] fid = new int[1];
            int[] score = new int[1];
            int r = FingerprintSensorEx.DBIdentify(db, t, fid, score);
            if (r == 0) {
                String subject = fidToSubject.get(fid[0]);
                if (subject != null) {
                    System.out.println("[IDENTIFY] " + subject + " score " + score[0]);
                    return "{\"status\":\"success\",\"matched\":true,\"subjectId\":\"" + esc(subject)
                            + "\",\"score\":" + score[0] + "}";
                }
            }
            throw new ApiException(404, "FINGERPRINT_NOT_FOUND", "Fingerprint not recognized.");
        } finally {
            LOCK.unlock();
        }
    }

    static String sync(String body) {
        lockOrBusy();
        try {
            openReader();

            // wipe and rebuild the cache
            FingerprintSensorEx.DBFree(db);
            long d = FingerprintSensorEx.DBInit();
            if (d == 0) {
                db = 0;
                throw new ApiException(500, "DB_INIT_FAILED", "Could not rebuild the fingerprint cache.");
            }
            db = d;
            fidToSubject.clear();

            int synced = 0, failed = 0;
            Matcher m = Pattern.compile("\\{[^{}]*\\}").matcher(body);
            while (m.find()) {
                String obj = m.group();
                String sid = getStr(obj, "subjectId");
                String tpl = getStr(obj, "templateBase64");
                if (sid == null || tpl == null || tpl.isEmpty()) {
                    if (sid != null) failed++;
                    continue;
                }
                try {
                    byte[] raw = Base64.getDecoder().decode(tpl.trim());
                    int fid = nextFid.getAndIncrement();
                    int r = FingerprintSensorEx.DBAdd(db, fid, padded(raw));
                    if (r == 0) {
                        fidToSubject.put(fid, sid);
                        synced++;
                    } else {
                        failed++;
                    }
                } catch (IllegalArgumentException e) {
                    failed++;
                }
            }

            System.out.println("[SYNC] loaded " + synced + ", failed " + failed);
            return "{\"status\":\"success\",\"synced\":" + synced + ",\"failed\":" + failed + "}";
        } finally {
            LOCK.unlock();
        }
    }
}