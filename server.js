const express = require('express');
const cors = require('cors');
const path = require('path');
const mqtt = require('mqtt');

const app = express();
const PORT = process.env.PORT || 3000;

// EMQX MQTT Broker Configuration
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://54.38.215.217:1883';
const MQTT_USER   = process.env.MQTT_USER   || 'Tester';
const MQTT_PASS   = process.env.MQTT_PASS   || 'Tester#26';

const TOPIC_TELEMETRY = 'telemetry/device';
const TOPIC_CONTROL   = 'control/device';

// In-Memory Telemetry Cache (Synced with STM32 & ESP32 sensors)
let cachedTelemetry = {
  lux: 0,
  led: 0,
  pwm: 0,
  mode: "AUTO",
  threshold: 400,
  pir: 0,
  trigger: "ldr",
  oled: "ldr",
  lastUpdated: new Date().toISOString()
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to College EMQX MQTT Broker
const clientId = 'CloudServer_' + Math.random().toString(16).slice(2, 8);
console.log(`[MQTT] Connecting to EMQX Broker at ${MQTT_BROKER} as ${clientId}...`);

const mqttClient = mqtt.connect(MQTT_BROKER, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: clientId,
  reconnectPeriod: 3000,
  connectTimeout: 10000
});

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected to EMQX Broker successfully!');
  mqttClient.subscribe(TOPIC_TELEMETRY, (err) => {
    if (err) {
      console.error('[MQTT] Failed to subscribe to telemetry topic:', err);
    } else {
      console.log(`[MQTT] Subscribed to topic: ${TOPIC_TELEMETRY}`);
    }
  });
});

mqttClient.on('message', (topic, message) => {
  try {
    const raw = message.toString();
    console.log(`[MQTT MSG] Arrived on [${topic}]: ${raw}`);
    
    // Parse incoming JSON telemetry from ESP32
    const data = JSON.parse(raw);
    
    // Merge into cachedTelemetry
    if (data.lux !== undefined) cachedTelemetry.lux = data.lux;
    if (data.led !== undefined) cachedTelemetry.led = (data.led === 1 || data.led === "1" || data.led === true) ? 1 : 0;
    if (data.pwm !== undefined) cachedTelemetry.pwm = Number(data.pwm);
    if (data.mode !== undefined) cachedTelemetry.mode = String(data.mode);
    if (data.threshold !== undefined) cachedTelemetry.threshold = Number(data.threshold);
    if (data.pir !== undefined) cachedTelemetry.pir = (data.pir === 1 || data.pir === "1" || data.pir === true) ? 1 : 0;
    if (data.trigger !== undefined) cachedTelemetry.trigger = String(data.trigger);
    if (data.oled !== undefined) cachedTelemetry.oled = String(data.oled);

    // Also support simulation fields if used
    if (data.STATE !== undefined) cachedTelemetry.mode = data.STATE;
    if (data.VS !== undefined) cachedTelemetry.pir = (data.VS === true || data.VS === "true") ? 1 : 0;
    if (data.RLY !== undefined) cachedTelemetry.led = (data.RLY === "ON") ? 1 : 0;

    cachedTelemetry.lastUpdated = new Date().toISOString();
  } catch (err) {
    console.warn('[MQTT] Error parsing incoming payload:', err.message);
  }
});

mqttClient.on('error', (err) => {
  console.error('[MQTT Error]:', err.message);
});

mqttClient.on('close', () => {
  console.warn('[MQTT] Connection closed. Auto-reconnecting...');
});

// Helper function to publish commands to ESP32 via MQTT
function sendMqttCommand(cmdString) {
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(TOPIC_CONTROL, cmdString);
    console.log(`[OUTBOUND CMD] Published to [${TOPIC_CONTROL}]: ${cmdString}`);
    return true;
  } else {
    console.warn('[OUTBOUND CMD] Cannot send command, MQTT not connected.');
    return false;
  }
}

// =========================================================================
// REST API ENDPOINTS (Matches index.html expectations 100%)
// =========================================================================

// 1. Telemetry endpoint
app.get('/api/telemetry', (req, res) => {
  res.json(cachedTelemetry);
});

// 2. Mode toggle endpoint (/api/mode?state=manual|auto)
app.get('/api/mode', (req, res) => {
  const state = req.query.state || 'auto';
  const cmd = (state.toLowerCase() === 'manual') ? 'CMD,MODE:MANUAL' : 'CMD,MODE:AUTO';
  cachedTelemetry.mode = (state.toLowerCase() === 'manual') ? 'MANUAL' : 'AUTO';
  sendMqttCommand(cmd);
  res.json({ status: 'success', command: cmd });
});

// 3. LED toggle endpoint (/api/toggle?state=on|off)
app.get('/api/toggle', (req, res) => {
  const state = req.query.state || 'off';
  const cmd = (state.toLowerCase() === 'on') ? 'CMD,LED:ON' : 'CMD,LED:OFF';
  cachedTelemetry.led = (state.toLowerCase() === 'on') ? 1 : 0;
  sendMqttCommand(cmd);
  // Also send relay command format if using dummy relay sketch
  sendMqttCommand(`{"RLY":${state.toLowerCase() === 'on' ? '1' : '0'}}`);
  res.json({ status: 'success', command: cmd });
});

// 4. Dimmer PWM endpoint (/api/dimmer?pwm=0..255)
app.get('/api/dimmer', (req, res) => {
  const pwm = req.query.pwm || 0;
  const cmd = `CMD,PWM:${pwm}`;
  cachedTelemetry.pwm = Number(pwm);
  sendMqttCommand(cmd);
  res.json({ status: 'success', command: cmd });
});

// 5. Threshold endpoint (/api/threshold?lux=...)
app.get('/api/threshold', (req, res) => {
  const lux = req.query.lux || 400;
  const cmd = `CMD,THR:${lux}`;
  cachedTelemetry.threshold = Number(lux);
  sendMqttCommand(cmd);
  res.json({ status: 'success', command: cmd });
});

// 6. Trigger source endpoint (/api/trigger?source=pir|ldr)
app.get('/api/trigger', (req, res) => {
  const source = req.query.source || 'ldr';
  const cmd = (source.toLowerCase() === 'pir') ? 'CMD,TRIGGER:PIR' : 'CMD,TRIGGER:LDR';
  cachedTelemetry.trigger = source.toLowerCase();
  sendMqttCommand(cmd);
  res.json({ status: 'success', command: cmd });
});

// 7. Motion sensor endpoint (/api/motion?state=0|1)
app.get('/api/motion', (req, res) => {
  const state = req.query.state || 0;
  cachedTelemetry.pir = Number(state);
  res.json({ status: 'success' });
});

// 8. OLED screen endpoint (/api/oled?screen=...)
app.get('/api/oled', (req, res) => {
  const screen = req.query.screen || 'ldr';
  cachedTelemetry.oled = screen;
  sendMqttCommand(`CMD,OLED:${screen}`);
  res.json({ status: 'success' });
});

// Health check endpoint for Cloud hosting (Render, Railway, etc.)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    mqttConnected: mqttClient ? mqttClient.connected : false,
    timestamp: new Date().toISOString()
  });
});

// Default fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`[HTTP Server] Cloud Web Dashboard running on http://localhost:${PORT}`);
});
