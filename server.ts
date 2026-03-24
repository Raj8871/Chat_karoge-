import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });
  const PORT = 3000;

  // In-memory storage for users and presence
  const onlineUsers = new Map<string, string>(); // socketId -> userId

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("join", (userId: string) => {
      onlineUsers.set(socket.id, userId);
      socket.join(userId);
      console.log(`User ${userId} joined`);
      io.emit("user_status", { userId, status: "online" });
    });

    socket.on("typing", (data) => {
      socket.to(data.to).emit("user_typing", { from: data.from, isTyping: data.isTyping });
    });

    socket.on("message_sent", (data) => {
      // Notify recipient via socket for instant feedback if online
      socket.to(data.to).emit("new_message", data);
    });

    socket.on("disconnect", () => {
      const userId = onlineUsers.get(socket.id);
      if (userId) {
        console.log(`User ${userId} disconnected`);
        io.emit("user_status", { userId, status: "offline", lastSeen: new Date().toISOString() });
        onlineUsers.delete(socket.id);
      }
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
