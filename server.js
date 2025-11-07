var express = require("express");
var http = require("http");
var fs = require("fs");
var socketio = require("socket.io");

var app = express();
var server = http.createServer(app);
var io = socketio(server);

app.use(express.json());
app.use(express.static("public"));

var DATA_FILE = "data.json";

// Создать файл данных если нет
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], messages: [], groups: {} }));
}

// Чтение/запись данных
function readData() {
  var data = fs.readFileSync(DATA_FILE);
  return JSON.parse(data);
}
function writeData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d));
}

// Регистрация
app.post("/register", function(req, res){
  var nick = req.body.nick;
  var pass = req.body.pass;
  var avatar = req.body.avatar || "😎";
  if (!nick || !pass) { res.json({ok:false, msg:"Введите ник и пароль"}); return; }
  var d = readData();
  for(var i=0;i<d.users.length;i++){ if(d.users[i].nick==nick){ res.json({ok:false, msg:"Ник занят"}); return; } }
  d.users.push({nick:nick, pass:pass, avatar:avatar});
  writeData(d);
  res.json({ok:true});
});

// Вход
app.post("/login", function(req,res){
  var nick=req.body.nick;
  var pass=req.body.pass;
  var d=readData();
  for(var i=0;i<d.users.length;i++){
    if(d.users[i].nick==nick && d.users[i].pass==pass){ res.json({ok:true, avatar:d.users[i].avatar}); return; }
  }
  res.json({ok:false});
});

// Socket.IO
io.on("connection", function(socket){
  socket.nick = null;

  socket.on("join", function(nick){ socket.nick=nick; });

  // Общий чат
  socket.on("chatAll", function(msg){
    io.emit("chatAll", {nick:socket.nick, msg:msg});
    var d = readData();
    d.messages.push({from:socket.nick, to:"all", msg:msg, time:(new Date()).getTime()});
    writeData(d);
  });

  // Личные сообщения
  socket.on("chatPm", function(data){
    var d = readData();
    d.messages.push({from:socket.nick, to:data.to, msg:data.msg, time:(new Date()).getTime()});
    writeData(d);
    io.emit("chatPm", {from:socket.nick, to:data.to, msg:data.msg});
  });

  // Создать группу
  socket.on("createGroup", function(data){
    var d = readData();
    var id = "g" + (new Date()).getTime();
    d.groups[id] = {id:id, name:data.name, public:data.public, members:[socket.nick], messages:[]};
    writeData(d);
    io.emit("groupCreated", d.groups[id]);
  });

  // Сообщение в группе
  socket.on("groupMessage", function(data){
    var d = readData();
    var g = d.groups[data.groupId];
    if (g) { g.messages.push({from:socket.nick, msg:data.msg, time:(new Date()).getTime()}); writeData(d); io.emit("groupMessage", {groupId:data.groupId, from:socket.nick, msg:data.msg}); }
  });

  // Пригласить в группу
  socket.on("inviteToGroup", function(data){
    var d = readData();
    var g = d.groups[data.groupId];
    if (g) { var found=false; for(var i=0;i<g.members.length;i++){ if(g.members[i]==data.user){ found=true; } } if(!found){ g.members.push(data.user); writeData(d); } }
  });

  // Получить все данные
  socket.on("fetchInit", function(cb){
    var d = readData();
    var safeUsers = [];
    for(var i=0;i<d.users.length;i++){ safeUsers.push({nick:d.users[i].nick, avatar:d.users[i].avatar}); }
    cb({users:safeUsers, groups:d.groups, messages:d.messages});
  });
});

// Всегда отдавать index.html
app.get("*", function(req,res){ res.sendFile(__dirname+"/public/index.html"); });

var PORT = process.env.PORT || 3000;
server.listen(PORT, function(){ console.log("Сервер запущен на порту "+PORT); });
