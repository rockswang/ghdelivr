const fs = require('fs')
const path = require('path')

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request-promise')
const Agent = require('socks5-https-client/lib/Agent')
const LRU = require('lru-cache')

const rp = request.defaults({
  // proxy: 'http://localhost:1080',
  // rejectUnauthorized: false,
  headers: { 'User-Agent': 'curl' }, // 使用curl UA，否则github api出错
  timeout: 20000,
  gzip: true, // 启用压缩
  strictSSL: true,
  agentClass: Agent,
  agentOptions: {
    socksHost: 'localhost', // Defaults to 'localhost'.
    socksPort: 1080 // Defaults to 1080.
    // Optional credentials
    // socksUsername: 'proxyuser',
    // socksPassword: 'p@ssw0rd',
  }
})
LRU.prototype.wrap = async function (key, func) {
  let val = this.get(key)
  if (val === undefined) {
    val = await func()
    if (val !== undefined) this.set(key, val)
  }
  return val
}
// repo -> release缓存，maxAge单位ms
const cache = new LRU({ maxAge: 600000 })
// 服务端口
const PORT = 50004

const app = express()

let tokens
function getToken (user) {
  if (!tokens) {
    try {
      tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json'), 'utf8'))
    } catch (e) {
      tokens = {}
    }
  }
  return tokens[user]
}

/**
 * 获取最新的release的标签名
 * 优先从缓存中获取，如果缓存未命中，则调用github API:
 * 1. 查询master分支的head_commit的sha_id，并使用其最末10位作为release标签
 * 2. 查询release列表，如果不存在上述release，则创建；并删除已失效的release
 * 3. 返回标签名
 */
async function getTagName (user, repo, token) {
  return cache.wrap(`${user}/${repo}`, async () => {
    log(`${user}/${repo}: 获取标签 - 缓存未命中`)
    const opt = { json: true, headers: { Authorization: 'token ' + token } }
    const [r1, r2] = await Promise.all([
      rp.get(`https://api.github.com/repos/${user}/${repo}/branches/master`, opt),
      rp.get(`https://api.github.com/repos/${user}/${repo}/releases`, opt)
    ])
    const tagName = r1.commit.sha.slice(-10)
    log(`${user}/${repo}: 最新commit - ${r1.commit.sha}；release列表 - ${r2.map(r => r.tag_name).join(', ')}`)
    let found = false
    for (const r of r2) {
      if (!/^[\da-f]{10}$/.test(r.tag_name)) continue
      if (tagName === r.tag_name) {
        found = true
      } else {
        rp.delete(`https://api.github.com/repos/${user}/${repo}/releases/${r.id}`, opt)
      }
    }
    if (!found) {
      const res = await rp.post(`https://api.github.com/repos/${user}/${repo}/releases`, Object.assign({ body: { tag_name: tagName } }, opt)).catch(e => e)
      if (res instanceof Error) log(`${user}/${repo}: 创建release错误 - ${res.stack.replace(/[\r\n]+/g, '\\n')}`)
    }
    log(`${user}/${repo}: 获取标签 - ${tagName}`)
    return tagName
  })
}

function log (msg) {
  const dt = new Date()
  console.log(`[${dt.toLocaleString()}.${dt.getMilliseconds()}] ${msg}`)
}

function resp (res, msg, code = 200) {
  if (typeof msg === 'object') {
    res.status(code).json(msg)
    msg = JSON.stringify(msg)
  } else {
    res.status(code).send(msg)
  }
  log(`[${code}] - ${msg}`)
}

app.use(bodyParser.json())

/**
 * 添加一个github OAuth Token
 * 用于根据仓库的最近commitId创建新的release
 */
app.get('/addToken', (req, res) => {
  const { user, token } = req.query
  if (!user || !token) return resp(res, 'addToken: 必须提供user参数和token参数', 400)
  const old = getToken(user)
  if (token !== old) {
    tokens[user] = token
    fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(tokens, null, 2))
    tokens = null
  }
  return resp(res, 'ok')
})

/**
 * Github仓库中需要配置一个监听push事件的WebHook，指向此地址。
 */
app.post('/webhook', (req, res) => {
  const { repository, head_commit: headCommit } = req.body
  if (!headCommit) return resp(res, 'webhook: no commit')
  if (!repository || !repository.full_name) return resp(res, 'webhook: bad commit data')
  // 清除缓存，下次请求将自动创建新的release
  cache.del(repository.full_name)
  return resp(res, 'webhook: ok')
})

/**
 * 对http://host/user/repo/path/to/resource的请求，返回指向最新release的jsdelivr cdn地址的302跳转
 * 对形如http://host/user/repo/的根请求，返回最新release的标签，客户端可缓存此标签，并直接使用它组装资源URL，免去302跳转步骤
 */
app.get('/*', async (req, res) => {
  const [, user, repo, ...file] = req.path.split('/')
  if (!user || !repo) return resp(res, 'GET: 必须提供github仓库地址', 400)
  const token = getToken(user)
  if (!token) return resp(res, 'GET: 请先使用addToken添加github用户名和OAuth Token', 400)
  // 获取最新release的标签名
  const tagName = await getTagName(user, repo, token)
  const path = file.join('/')
  if (!path) return res.send(tagName)
  res.redirect(`https://cdn.jsdelivr.net/gh/${user}/${repo}@${tagName}/${path}`)
})

app.listen(PORT, function () {
  console.log(`GHDELIVR服务开始监听${PORT}端口`)
})
