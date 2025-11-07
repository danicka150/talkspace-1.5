const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

let users = {};
let messages = [];
let groups = {};

io.on("connection", function(socket) {
  console.log("Новое подключение:", socket.id);

  socket.on("register", function(nick, cb) {
    if (!nick || users[nick]) {
      cb(false);
      return;
    }

    users[nick] = { id: socket.id, name: nick };
    console.log("Пользователь подключился:", nick);
    io.emit("userList", Object.keys(users));
    cb(true);
  });

  socket.on("sendMessage", function(data) {
    messages.push(data);
    io.emit("message", data);
  });

  socket.on("createGroup", function(name, isPublic, creator, cb) {
    if (!name || groups[name]) {
      cb(false);
      return;
    }

    groups[name] = {
      name: name,
      public: isPublic,
      members: [creator],
      messages: []
    };

    io.emit("groupList", Object.keys(groups));
    cb(true);
  });

  socket.on("joinGroup", function(name, nick, cb) {
    if (!groups[name]) {
      cb(false);
      return;
    }

    if (!groups[name].members.includes(nick)) {
      groups[name].members.push(nick);
    }

    cb(true);
  });

  socket.on("groupMessage", function(data) {
    const grp = groups[data.group];
    if (grp) {
      grp.messages.push({
        from: data.from,
        text: data.text,
        time: Date.now()
      });
      io.emit("groupMessage", data);
    }
  });

  socket.on("disconnect", function() {
    let nick = null;
    for (let name in users) {
      if (users[name].id === socket.id) {
        nick = name;
        delete users[name];
        break;
      }
    }

    if (nick) {
      console.log("Пользователь отключился:", nick);
      io.emit("userList", Object.keys(users));
    }
  });
});

server.listen(3000, function() {
  console.log("Сервер запущен на порту 3000");
});