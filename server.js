const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    socket.on('join-institution', (institutionId) => {
      socket.join(`institution-${institutionId}`);
    });

    socket.on('appointment-arrived', (data) => {
      const { institutionId, funcionarioId, ticket } = data;
      if (funcionarioId) {
        io.to(`funcionario-${funcionarioId}`).emit('new-appointment', ticket);
      }
      io.to(`institution-${institutionId}`).emit('new-appointment', ticket);
    });

    socket.on('join-funcionario', (funcionarioId) => {
      if (funcionarioId) {
        socket.join(`funcionario-${funcionarioId}`);
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
