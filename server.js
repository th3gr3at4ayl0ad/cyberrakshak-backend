const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// जोडलेले Mobile Devices आणि Dashboards ट्रॅक करण्यासाठी
const clients = new Map();

wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const clientType = urlParams.get('type'); // 'device' किवा 'dashboard'
  const deviceId = urlParams.get('deviceId') || 'UNKNOWN_DEVICE';

  ws.clientType = clientType;
  ws.deviceId = deviceId;

  if (clientType === 'device') {
    clients.set(deviceId, ws);
    console.log(`[+] Mobile Device Connected: ${deviceId}`);
    broadcastToDashboards({ type: 'DEVICE_STATUS', deviceId, status: 'ONLINE' });
  } else if (clientType === 'dashboard') {
    console.log(`[+] SOC Dashboard Connected`);
    // कनेक्ट झाल्यावर लगेच ॲक्टिव्ह डिव्हाइसेसची लिस्ट पाठवा
    const activeDevices = Array.from(clients.keys());
    ws.send(JSON.stringify({ type: 'DEVICE_LIST', devices: activeDevices }));
  }

  // मेसेज/कमांड हाताळणी
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Dashboard कडून आलेली कमांड मोबाईलकडे पाठवा
      if (ws.clientType === 'dashboard' && data.targetDeviceId) {
        const targetSocket = clients.get(data.targetDeviceId);
        if (targetSocket && targetSocket.readyState === ws.OPEN) {
          targetSocket.send(JSON.stringify({ action: data.action }));
          console.log(`[>] Command '${data.action}' sent to ${data.targetDeviceId}`);
        }
      }

      // मोबाईलकडून आलेले Logcat logs Dashboard कडे स्ट्रीम करा
      if (ws.clientType === 'device' && data.type === 'LOGCAT_STREAM') {
        broadcastToDashboards({
          type: 'LOGCAT_STREAM',
          deviceId: ws.deviceId,
          log: data.log
        });
      }
    } catch (err) {
      console.error('[-] Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    if (ws.clientType === 'device') {
      clients.delete(ws.deviceId);
      console.log(`[-] Mobile Device Disconnected: ${ws.deviceId}`);
      broadcastToDashboards({ type: 'DEVICE_STATUS', deviceId: ws.deviceId, status: 'OFFLINE' });
    }
  });
});

function broadcastToDashboards(data) {
  wss.clients.forEach((client) => {
    if (client.clientType === 'dashboard' && client.readyState === client.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`CyberRakshak Relay Server running on port ${PORT}`);
});
