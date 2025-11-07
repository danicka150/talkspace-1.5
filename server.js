const express = require('express')
const app = express()
const fs = require('fs')
const http = require('http').createServer(app)
const io = require('socket.io')(http)

app.use(express.static('public'))
app.use(express.json())

const DATA = 'data.json'
if (!fs.existsSync(DATA)) {
  fs.writeFileSync(DATA, JSON.stringify({
    users: [],      // {nick, pass, avatar}
    messages: [],   // {from, to, msg, time}
    groups: {}      // id -> {name, emoji, public, members: []}
  }, null, 2))
}

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA)) }
  catch (e) { return { users: [], messages: [], groups: {} } }
}
function writeData(d) {
  fs.writeFileSync(DATA, JSON.stringify(d, null, 2))
}

// Auth endpoints (simple)
app.post('/register', (req, res) => {
  const { nick, pass, avatar } = req.body || {}
  if (!nick || !pass) return res.json({ ok: false, msg: 'Ник и пароль обязательны' })
  const d = readData()
  if (d.users.find(u => u.nick === nick)) return res.json({ ok: false, msg: 'Ник занят' })
  d.users.push({ nick, pass, avatar: avatar || '😎' })
  writeData(d)
  return res.json({ ok: true })
})

app.post('/login', (req, res) => {
  const { nick, pass } = req.body || {}
  const d = readData()
  const user = d.users.find(u => u.nick === nick && u.pass === pass)
  if (!user) return res.json({ ok: false })
  return res.json({ ok: true, avatar: user.avatar })
})

// helper to save message
function saveMessage(from, to, msg) {
  const d = readData()
  d.messages.push({ from, to, msg, time: Date.now() })
  writeData(d)
}

// socket logic
io.on('connection', socket => {
  socket.nick = null

  socket.on('join', nick => {
    socket.nick = nick
    // optionally update last-seen etc (not implemented)
  })

  // public chat (everyone)
  socket.on('chatAll', rawMsg => {
    // rawMsg might be a string or JSON string with cmd
    // emit to all clients in same format {nick, msg}
    io.emit('chatAll', { nick: socket.nick, msg: rawMsg })
    // try to parse JSON commands for server-side storage
    try {
      const parsed = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg
      if (parsed && parsed.cmd === 'TS_USER') {
        // announcement: user avatar
        const d = readData()
        const u = d.users.find(x => x.nick === socket.nick)
        if (u) u.avatar = parsed.avatar || u.avatar
        else d.users.push({ nick: socket.nick, pass: '', avatar: parsed.avatar || '😎' })
        writeData(d)
      } else if (parsed && parsed.cmd === 'TS_CREATE_GROUP') {
        const id = parsed.id
        const group = parsed.group || {}
        const d = readData()
        d.groups = d.groups || {}
        d.groups[id] = Object.assign({ members: [] }, group)
        // if creator not in members, add
        if (!d.groups[id].members.includes(socket.nick)) d.groups[id].members.push(socket.nick)
        writeData(d)
      } else {
        // plain public messages are not saved (by design), but we save users existence
        const d = readData()
        d.users = d.users || []
        if (!d.users.find(u => u.nick === socket.nick)) d.users.push({ nick: socket.nick, pass: '', avatar: '😎' })
        writeData(d)
      }
    } catch (e) {
      // not JSON — ignore for server commands
    }
  })

  // personal or group messages
  socket.on('chatPm', payload => {
    // payload expected { to, msg }
    // store message, and broadcast to all (client filters)
    try {
      const to = payload.to
      const msg = payload.msg
      if (!socket.nick) return
      // save
      saveMessage(socket.nick, to, msg)
      // broadcast to all (client will decide to show if relevant)
      io.emit('chatPm', { from: socket.nick, to, msg })
      // additionally, handle invite command server-side:
      try {
        const maybe = typeof msg === 'string' ? JSON.parse(msg) : msg
if (maybe && maybe.cmd === 'TS_INVITE') {
          const gid = maybe.groupId
          const d = readData()
          d.groups = d.groups || {}
          if (d.groups[gid]) {
            d.groups[gid].members = d.groups[gid].members || []
            if (!d.groups[gid].members.includes(payload.to)) d.groups[gid].members.push(payload.to)
            writeData(d)
          }
        }
      } catch (e) {}
    } catch (e) {
      console.error('chatPm error', e)
    }
  })

  // optional: allow client to request initial data (users/groups/messages)
  socket.on('fetchInit', (cb) => {
    const d = readData()
    const safeUsers = (d.users || []).map(u => ({ nick: u.nick, avatar: u.avatar }))
    cb && cb({ users: safeUsers, groups: d.groups  {}, messages: d.messages  [] })
  })
})

const PORT = process.env.PORT || 3000
http.listen(PORT, () => console.log('TalkSpace server started on', PORT))
