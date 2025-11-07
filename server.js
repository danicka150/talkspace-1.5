const express = require("express")
const app = express()
const fs = require("fs")
const http = require("http").createServer(app)
const io = require("socket.io")(http)

app.use(express.static("public"))
app.use(express.json())

const file = "data.json"
if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({users: [], messages: []}))

function read() {
  return JSON.parse(fs.readFileSync(file))
}
function write(data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

app.post("/register", (req, res) => {
  const {nick, pass, avatar} = req.body
  const data = read()
  if (data.users.find(u => u.nick === nick)) return res.json({ok: false, msg: "Ник занят"})
  data.users.push({nick, pass, avatar})
  write(data)
  res.json({ok: true})
})

app.post("/login", (req, res) => {
  const {nick, pass} = req.body
  const data = read()
  const user = data.users.find(u => u.nick === nick && u.pass === pass)
  if (!user) return res.json({ok: false})
  res.json({ok: true, avatar: user.avatar})
})

io.on("connection", socket => {
  socket.on("join", nick => socket.nick = nick)

  socket.on("chatAll", msg => {
    io.emit("chatAll", {nick: socket.nick, msg})
  })

  socket.on("chatPm", ({to, msg}) => {
    const data = read()
    data.messages.push({from: socket.nick, to, msg})
    write(data)
    io.emit("chatPm", {from: socket.nick, to, msg})
  })
})

const PORT = process.env.PORT || 3000
http.listen(PORT, () => console.log("TalkSpace запущен на порту " + PORT))