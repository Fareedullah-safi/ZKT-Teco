import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.zkteco.biometric.FingerprintSensorEx;

public class FingerprintBridge {
    private static final int TEMPLATE_SIZE = 2048;
    private static final ReentrantLock SCAN_LOCK = new ReentrantLock();

    // Accept IDs like TEST-001. No customer details here.
    private static final Pattern SUBJECT_ID_PATTERN =
        Pattern.compile("\"subjectId\"\\s*:\\s*\"([A-Za-z0-9_-]{1,64})\"");

    // In-memory only until the bridge stops.
    private static final Map<String, Integer> FID_BY_SUBJECT = new HashMap<>();
    private static final Map<Integer, String> SUBJECT_BY_FID = new HashMap<>();

    private static volatile String currentStatus = "Ready.";

    private static boolean initialized;
    private static long deviceHandle;
    private static long dbHandle;
    private static int deviceCount;
    private static int nextFid = 1;
    private static byte[] imageBuffer;
    private static final byte[] templateBuffer = new byte[TEMPLATE_SIZE];

    public static void main(String[] args) throws Exception {
        initializeReader();

        // Listen only on this PC.
        HttpServer server = HttpServer.create(
            new InetSocketAddress("127.0.0.1", 8765), 0
        );

        server.createContext("/health", FingerprintBridge::handleHealth);
        server.createContext("/status", FingerprintBridge::handleStatus);
        server.createContext("/v1/enroll", FingerprintBridge::handleEnroll);
        server.createContext("/v1/identify", FingerprintBridge::handleIdentify);

        ExecutorService executor = Executors.newFixedThreadPool(4);
        server.setExecutor(executor);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            server.stop(0);
            executor.shutdownNow();

            SCAN_LOCK.lock();
            try {
                closeReader();
            } finally {
                SCAN_LOCK.unlock();
            }
        }));

        server.start();
        System.out.println("ZK9500 bridge is ready at http://127.0.0.1:8765");
        System.out.println("CORS enabled for browser calls from your web app.");
        System.out.println("Keep this window open while testing.");
    }

    private static void initializeReader() {
        int result = FingerprintSensorEx.Init();
        if (result != 0) {
            throw new IllegalStateException("SDK Init failed: " + result);
        }
        initialized = true;

        deviceCount = FingerprintSensorEx.GetDeviceCount();
        if (deviceCount <= 0) {
            closeReader();
            throw new IllegalStateException("No fingerprint reader found.");
        }

        deviceHandle = FingerprintSensorEx.OpenDevice(0);
        if (deviceHandle == 0) {
            closeReader();
            throw new IllegalStateException("Could not open the reader.");
        }

        dbHandle = FingerprintSensorEx.DBInit();
        if (dbHandle == 0) {
            closeReader();
            throw new IllegalStateException("Could not initialize the SDK database.");
        }

        int width = readDeviceInt(1);
        int height = readDeviceInt(2);

        if (width <= 0 || height <= 0 || width > 10000 || height > 10000) {
            closeReader();
            throw new IllegalStateException("Invalid reader image dimensions.");
        }

        imageBuffer = new byte[width * height];
        System.out.println("Reader opened. Device count: " + deviceCount);
    }

    private static int readDeviceInt(int code) {
        byte[] value = new byte[4];
        int[] size = new int[] { 4 };

        int result =
            FingerprintSensorEx.GetParameters(deviceHandle, code, value, size);

        if (result != 0) {
            throw new IllegalStateException(
                "Could not read reader parameter " + code + ": " + result
            );
        }

        return (value[0] & 0xFF)
            | ((value[1] & 0xFF) << 8)
            | ((value[2] & 0xFF) << 16)
            | ((value[3] & 0xFF) << 24);
    }

    private static void closeReader() {
        if (dbHandle != 0) {
            FingerprintSensorEx.DBFree(dbHandle);
            dbHandle = 0;
        }
        if (deviceHandle != 0) {
            FingerprintSensorEx.CloseDevice(deviceHandle);
            deviceHandle = 0;
        }
        if (initialized) {
            FingerprintSensorEx.Terminate();
            initialized = false;
        }
    }

    private static void handleHealth(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) {
            return;
        }

        if (!"GET".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        sendJson(
            exchange,
            200,
            "{\"ready\":true,\"readerConnected\":"
                + (deviceHandle != 0)
                + ",\"deviceCount\":"
                + deviceCount
                + "}"
        );
    }

    private static void handleStatus(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) {
            return;
        }

        if (!"GET".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        sendJson(
            exchange,
            200,
            "{\"status\":\"" + jsonEscape(currentStatus) + "\"}"
        );
    }

    private static void handleEnroll(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) {
            return;
        }

        if (!"POST".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        String body;
        try {
            body = readRequestBody(exchange);
        } catch (IOException error) {
            sendJson(exchange, 400, "{\"error\":\"Invalid request body\"}");
            return;
        }

        Matcher matcher = SUBJECT_ID_PATTERN.matcher(body);
        if (!matcher.find()) {
            sendJson(
                exchange,
                400,
                "{\"error\":\"Enter a test ID using letters, numbers, _ or -\"}"
            );
            return;
        }

        String subjectId = matcher.group(1);

        if (!SCAN_LOCK.tryLock()) {
            sendJson(exchange, 409, "{\"error\":\"Reader is busy\"}");
            return;
        }

        try {
            if (FID_BY_SUBJECT.containsKey(subjectId)) {
                currentStatus = "This test ID is already enrolled.";
                sendJson(exchange, 409, "{\"error\":\"Test ID already enrolled\"}");
                return;
            }

            byte[][] samples = new byte[3][];
            for (int i = 0; i < 3; i++) {
                int attempts = 0;

                while (true) {
                    currentStatus =
                        "Enrollment: place the same finger for scan "
                            + (i + 1) + " of 3.";
                    System.out.println(currentStatus);

                    byte[] captured = captureTemplate(45000);

                    if (i == 0
                        || FingerprintSensorEx.DBMatch(
                            dbHandle, samples[i - 1], captured
                        ) > 0) {
                        samples[i] = captured;
                        break;
                    }

                    attempts++;
                    if (attempts >= 3) {
                        throw new BridgeException(
                            422,
                            "Scans did not match. Start enrollment again."
                        );
                    }

                    currentStatus =
                        "Scans did not match. Lift your finger, then retry scan "
                            + (i + 1) + " of 3.";
                    waitForFingerLift(15000);
                }

                if (i < 2) {
                    currentStatus = "Scan captured. Lift your finger.";
                    waitForFingerLift(15000);
                }
            }

            byte[] registeredTemplate = new byte[TEMPLATE_SIZE];
            int[] registeredLength = new int[] { TEMPLATE_SIZE };

            int result = FingerprintSensorEx.DBMerge(
                dbHandle,
                samples[0],
                samples[1],
                samples[2],
                registeredTemplate,
                registeredLength
            );

            if (result != 0) {
                throw new BridgeException(
                    500, "Could not combine the fingerprint scans."
                );
            }

            // Reject a fingerprint already enrolled under another test ID.
            int[] existingFid = new int[1];
            int[] existingScore = new int[1];
            result = FingerprintSensorEx.DBIdentify(
                dbHandle, registeredTemplate, existingFid, existingScore
            );

            if (result == 0) {
                currentStatus = "This fingerprint is already enrolled.";
                sendJson(
                    exchange,
                    409,
                    "{\"error\":\"Fingerprint already enrolled\"}"
                );
                return;
            }

            int fid = nextFid;
            result = FingerprintSensorEx.DBAdd(
                dbHandle, fid, registeredTemplate
            );

            if (result != 0) {
                throw new BridgeException(
                    500, "The SDK could not save this test enrollment."
                );
            }

            nextFid++;
            FID_BY_SUBJECT.put(subjectId, fid);
            SUBJECT_BY_FID.put(fid, subjectId);

            currentStatus = "Enrollment complete.";
            sendJson(
                exchange,
                200,
                "{\"enrolled\":true,\"subjectId\":\"" + subjectId + "\"}"
            );
        } catch (BridgeException error) {
            currentStatus = error.getMessage();
            sendJson(
                exchange,
                error.httpStatus,
                "{\"error\":\"" + jsonEscape(error.getMessage()) + "\"}"
            );
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            currentStatus = "Operation cancelled.";
            sendJson(exchange, 500, "{\"error\":\"Operation cancelled\"}");
        } catch (Exception error) {
            System.err.println("Enrollment error: " + error);
            currentStatus = "Enrollment failed. Check the bridge terminal.";
            sendJson(exchange, 500, "{\"error\":\"Fingerprint enrollment failed\"}");
        } finally {
            SCAN_LOCK.unlock();
        }
    }

    private static void handleIdentify(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) {
            return;
        }

        if (!"POST".equals(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        try {
            readRequestBody(exchange);
        } catch (IOException error) {
            sendJson(exchange, 400, "{\"error\":\"Invalid request body\"}");
            return;
        }

        if (!SCAN_LOCK.tryLock()) {
            sendJson(exchange, 409, "{\"error\":\"Reader is busy\"}");
            return;
        }

        try {
            currentStatus = "Identification: place your finger on the reader.";
            System.out.println(currentStatus);

            byte[] captured = captureTemplate(45000);
            int[] fid = new int[1];
            int[] score = new int[1];

            int result =
                FingerprintSensorEx.DBIdentify(dbHandle, captured, fid, score);

            if (result != 0) {
                currentStatus = "No matching enrollment found.";
                sendJson(exchange, 200, "{\"matched\":false}");
                return;
            }

            String subjectId = SUBJECT_BY_FID.get(fid[0]);
            if (subjectId == null) {
                currentStatus = "Match found, but no test ID is available.";
                sendJson(exchange, 500, "{\"error\":\"Test ID was not found\"}");
                return;
            }

            currentStatus = "Fingerprint matched.";
            sendJson(
                exchange,
                200,
                "{\"matched\":true,\"subjectId\":\""
                    + subjectId
                    + "\",\"score\":"
                    + score[0]
                    + "}"
            );
        } catch (BridgeException error) {
            currentStatus = error.getMessage();
            sendJson(
                exchange,
                error.httpStatus,
                "{\"error\":\"" + jsonEscape(error.getMessage()) + "\"}"
            );
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            currentStatus = "Operation cancelled.";
            sendJson(exchange, 500, "{\"error\":\"Operation cancelled\"}");
        } catch (Exception error) {
            System.err.println("Identification error: " + error);
            currentStatus = "Identification failed. Check the bridge terminal.";
            sendJson(exchange, 500, "{\"error\":\"Fingerprint identification failed\"}");
        } finally {
            SCAN_LOCK.unlock();
        }
    }

    private static byte[] captureTemplate(long timeoutMs)
        throws BridgeException, InterruptedException {

        long deadline = System.currentTimeMillis() + timeoutMs;

        while (System.currentTimeMillis() < deadline) {
            Arrays.fill(templateBuffer, (byte) 0);
            int[] size = new int[] { TEMPLATE_SIZE };

            int result = FingerprintSensorEx.AcquireFingerprint(
                deviceHandle, imageBuffer, templateBuffer, size
            );

            if (result == 0) {
                if (size[0] <= 0 || size[0] > TEMPLATE_SIZE) {
                    throw new BridgeException(500, "Invalid template size.");
                }
                return Arrays.copyOf(templateBuffer, TEMPLATE_SIZE);
            }

            Thread.sleep(150);
        }

        throw new BridgeException(
            408, "Timed out waiting for a fingerprint. Try again."
        );
    }

    private static void waitForFingerLift(long timeoutMs)
        throws BridgeException, InterruptedException {

        long deadline = System.currentTimeMillis() + timeoutMs;
        int notCapturedCount = 0;

        while (System.currentTimeMillis() < deadline) {
            int[] size = new int[] { TEMPLATE_SIZE };

            int result = FingerprintSensorEx.AcquireFingerprint(
                deviceHandle, imageBuffer, templateBuffer, size
            );

            if (result != 0) {
                notCapturedCount++;
                if (notCapturedCount >= 5) {
                    return;
                }
            } else {
                notCapturedCount = 0;
            }

            Thread.sleep(150);
        }

        throw new BridgeException(
            408, "Lift your finger and try the scan again."
        );
    }

    private static String readRequestBody(HttpExchange exchange)
        throws IOException {

        try (
            InputStream input = exchange.getRequestBody();
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[1024];
            int total = 0;
            int count;

            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > 4096) {
                    throw new IOException("Request body is too large");
                }
                output.write(buffer, 0, count);
            }

            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /**
     * Browser preflight for cross-origin calls from Vercel/HTTPS pages.
     * Returns true if the request was handled and the caller should return.
     */
    private static boolean handlePreflight(HttpExchange exchange)
        throws IOException {

        if (!"OPTIONS".equals(exchange.getRequestMethod())) {
            return false;
        }

        addCorsHeaders(exchange);
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
        return true;
    }

    private static void addCorsHeaders(HttpExchange exchange) {
        // Demo only: allow browser pages (including Vercel HTTPS) to call local bridge.
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set(
            "Access-Control-Allow-Methods", "GET, POST, OPTIONS"
        );
        exchange.getResponseHeaders().set(
            "Access-Control-Allow-Headers", "Content-Type"
        );
        exchange.getResponseHeaders().set("Access-Control-Max-Age", "86400");
    }

    private static void sendJson(
        HttpExchange exchange, int statusCode, String json
    ) throws IOException {

        addCorsHeaders(exchange);

        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set(
            "Content-Type", "application/json; charset=utf-8"
        );
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(statusCode, bytes.length);

        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static final class BridgeException extends Exception {
        private final int httpStatus;

        private BridgeException(int httpStatus, String message) {
            super(message);
            this.httpStatus = httpStatus;
        }
    }
}