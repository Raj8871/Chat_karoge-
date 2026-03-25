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

    // WebRTC Signaling for Audio Calls
    socket.on("call_user", (data: { to: string; from: string; callerName: string; signal: any }) => {
      console.log(`Call from ${data.from} to ${data.to}`);
      socket.to(data.to).emit("incoming_call", { from: data.from, callerName: data.callerName, signal: data.signal });
    });

    socket.on("answer_call", (data: { to: string; signal: any }) => {
      console.log(`Answering call to ${data.to}`);
      socket.to(data.to).emit("call_accepted", { signal: data.signal });
    });

    socket.on("reject_call", (data: { to: string }) => {
      console.log(`Rejecting call to ${data.to}`);
      socket.to(data.to).emit("call_rejected");
    });

    socket.on("end_call", (data: { to: string }) => {
      console.log(`Ending call to ${data.to}`);
      socket.to(data.to).emit("call_ended");
    });

    socket.on("ice_candidate", (data: { to: string; candidate: any }) => {
      socket.to(data.to).emit("ice_candidate", { candidate: data.candidate });
    });

    // Room-based signaling for Call Page
    socket.on("join_call_room", (roomId: string) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined call room: ${roomId}`);
      // Notify others in the room that a new user joined
      socket.to(roomId).emit("user_joined_room", { socketId: socket.id });
    });

    socket.on("leave_call_room", (roomId: string) => {
      socket.leave(roomId);
      console.log(`User ${socket.id} left call room: ${roomId}`);
      socket.to(roomId).emit("user_left_room", { socketId: socket.id });
    });

    socket.on("room_signal", (data: { roomId: string; signal: any; from: string }) => {
      socket.to(data.roomId).emit("room_signal", { signal: data.signal, from: data.from });
    });

    socket.on("room_ice_candidate", (data: { roomId: string; candidate: any }) => {
      socket.to(data.roomId).emit("room_ice_candidate", { candidate: data.candidate });
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
