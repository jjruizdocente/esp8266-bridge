const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Almacenar conexiones WebSocket de ESP8266
let esp8266Client = null;

// Crear servidor WebSocket
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  console.log('ESP8266 conectado');
  esp8266Client = ws;

  ws.on('message', (message) => {
    console.log('Mensaje del ESP8266:', message.toString());
  });

  ws.on('close', () => {
    console.log('ESP8266 desconectado');
    esp8266Client = null;
  });

  ws.on('error', (error) => {
    console.error('Error WebSocket:', error);
  });

  // Enviar confirmación de conexión
  ws.send(JSON.stringify({ status: 'connected' }));
});

// Ruta principal
app.get('/', (req, res) => {
  res.send('Servidor Bridge activo. ESP8266: ' + (esp8266Client ? 'Conectado' : 'Desconectado'));
});

// Webhook de Telegram - recibe mensajes del bot
app.post('/webhook', (req, res) => {
  console.log('Webhook recibido:', JSON.stringify(req.body));

  if (req.body.message) {
    const text = req.body.message.text;
    const chatId = req.body.message.chat.id;
    const fromName = req.body.message.from.first_name || 'Usuario';

    console.log(`Mensaje de ${fromName}: ${text}`);

    // Enviar comando al ESP8266 si está conectado
    if (esp8266Client && esp8266Client.readyState === WebSocket.OPEN) {
      const command = {
        command: text,
        chatId: chatId,
        from: fromName
      };
      esp8266Client.send(JSON.stringify(command));
      console.log('Comando enviado al ESP8266:', text);
    } else {
      console.log('ESP8266 no conectado, comando ignorado');
    }
  }

  res.sendStatus(200);
});

// Ruta directa para enviar comandos (desde la app Android sin Telegram)
app.post('/command', (req, res) => {
  const { command } = req.body;
  
  console.log('Comando directo recibido:', command);

  if (esp8266Client && esp8266Client.readyState === WebSocket.OPEN) {
    const cmd = {
      command: command,
      chatId: 'app',
      from: 'Android App'
    };
    esp8266Client.send(JSON.stringify(cmd));
    res.json({ success: true, message: 'Comando enviado al ESP8266' });
  } else {
    res.status(503).json({ success: false, message: 'ESP8266 no conectado' });
  }
});

// Estado del sistema
app.get('/status', (req, res) => {
  res.json({
    esp8266Connected: esp8266Client !== null && esp8266Client.readyState === WebSocket.OPEN,
    uptime: process.uptime()
  });
});

// Iniciar servidor HTTP
const server = app.listen(port, () => {
  console.log(`Servidor escuchando en puerto ${port}`);
});

// Manejar upgrade de WebSocket
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});
