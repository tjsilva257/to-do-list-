<?php
/**
 * SyncTask Local Sync API (XAMPP / PHP / SQLite / JSON)
 * Enables seamless cross-device synchronization over local Wi-Fi or hosted server.
 */

// Enable CORS for cross-device requests
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

$dbFile = $dataDir . '/todos.sqlite';
$jsonFile = $dataDir . '/todos.json';

// Function to handle database connection (SQLite preferred, JSON fallback)
function getDB($dbFile) {
    if (extension_loaded('pdo_sqlite')) {
        try {
            $pdo = new PDO("sqlite:" . $dbFile);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->exec("CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT,
                data TEXT,
                updatedAt INTEGER,
                deletedAt INTEGER
            )");
            return $pdo;
        } catch (Exception $e) {
            return null;
        }
    }
    return null;
}

$pdo = getDB($dbFile);

// Helper to fetch all tasks
function loadTasks($pdo, $jsonFile) {
    if ($pdo) {
        $stmt = $pdo->query("SELECT data FROM tasks");
        $results = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $task = json_decode($row['data'], true);
            if ($task) {
                $results[] = $task;
            }
        }
        return $results;
    } else {
        if (file_exists($jsonFile)) {
            $content = file_get_contents($jsonFile);
            return json_decode($content, true) ?: [];
        }
        return [];
    }
}

// Helper to save merged tasks
function saveTasks($pdo, $jsonFile, $tasks) {
    if ($pdo) {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("INSERT INTO tasks (id, title, data, updatedAt, deletedAt) 
            VALUES (:id, :title, :data, :updatedAt, :deletedAt)
            ON CONFLICT(id) DO UPDATE SET 
                title=excluded.title,
                data=excluded.data,
                updatedAt=excluded.updatedAt,
                deletedAt=excluded.deletedAt
            WHERE excluded.updatedAt > tasks.updatedAt");

        foreach ($tasks as $task) {
            $stmt->execute([
                ':id' => $task['id'],
                ':title' => $task['title'] ?? '',
                ':data' => json_encode($task),
                ':updatedAt' => $task['updatedAt'] ?? time() * 1000,
                ':deletedAt' => $task['deletedAt'] ?? null
            ]);
        }
        $pdo->commit();
    } else {
        file_put_contents($jsonFile, json_encode($tasks, JSON_PRETTY_PRINT));
    }
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $tasks = loadTasks($pdo, $jsonFile);
    echo json_encode([
        'status' => 'success',
        'serverTime' => round(microtime(true) * 1000),
        'tasks' => $tasks
    ]);
    exit();
}

if ($method === 'POST') {
    $input = file_get_contents('php://input');
    $payload = json_decode($input, true);

    if (!$payload) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON input']);
        exit();
    }

    if (isset($payload['action']) && $payload['action'] === 'ping') {
        echo json_encode([
            'status' => 'ok',
            'server' => 'SyncTask PHP Backend',
            'serverTime' => round(microtime(true) * 1000)
        ]);
        exit();
    }

    // Process synchronization
    $incomingTasks = $payload['tasks'] ?? [];
    $existingTasks = loadTasks($pdo, $jsonFile);

    // Merge in-memory using Last-Write-Wins
    $taskMap = [];
    foreach ($existingTasks as $t) {
        $taskMap[$t['id']] = $t;
    }

    $updatedCount = 0;
    foreach ($incomingTasks as $incoming) {
        if (!isset($incoming['id'])) continue;
        $id = $incoming['id'];
        if (!isset($taskMap[$id]) || ($incoming['updatedAt'] ?? 0) > ($taskMap[$id]['updatedAt'] ?? 0)) {
            $taskMap[$id] = $incoming;
            $updatedCount++;
        }
    }

    $merged = array_values($taskMap);
    saveTasks($pdo, $jsonFile, $merged);

    echo json_encode([
        'status' => 'success',
        'updatedCount' => $updatedCount,
        'serverTime' => round(microtime(true) * 1000),
        'tasks' => $merged
    ]);
    exit();
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);

