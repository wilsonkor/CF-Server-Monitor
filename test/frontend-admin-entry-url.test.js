import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADMIN_ENTRY_URL,
  isAdminPath,
  normalizeAdminEntryUrl,
  resolveAdminEntryUrl
} from '../src/frontend/router/adminEntryUrl.js'

// 复刻 vue-router createCurrentLocation 的 hash 分支（vue-router.mjs:16-26、283-288），
// 用来断言归一化后的地址确实被 hash history 解析成后台路由 —— 这正是本次修复依赖的机制。
// 返回值是 vue-router 拿到的原始 location 字符串（含 query），随后才由它拆成 path/query。
const resolveHashLocation = (href) => {
  const url = new URL(`https://monitor.example${href}`)
  const base = `${url.pathname}${url.search}#`
  const hashPos = base.indexOf('#')
  assert.ok(hashPos > -1)
  const slicePos = url.hash.includes(base.slice(hashPos)) ? base.slice(hashPos).length : 1
  let pathFromHash = url.hash.slice(slicePos)
  if (pathFromHash[0] !== '/') pathFromHash = `/${pathFromHash}`
  return pathFromHash
}

const currentUrl = ({ pathname, search = '', hash = '' }) => `${pathname}${search}${hash}`

test('后台入口归一化只在 /admin 前缀生效', () => {
  assert.equal(isAdminPath('/admin'), true)
  assert.equal(isAdminPath('/admin/'), true)
  assert.equal(isAdminPath('/admin/api'), true)
  assert.equal(isAdminPath('/'), false)
  assert.equal(isAdminPath('/administrator'), false)
  assert.equal(isAdminPath('/repo/'), false)

  assert.equal(resolveAdminEntryUrl({ pathname: '/' }), null)
  assert.equal(resolveAdminEntryUrl({ pathname: '/', search: '?foo=1' }), null)
  assert.equal(resolveAdminEntryUrl({ pathname: '/', hash: '#/' }), null)
  assert.equal(resolveAdminEntryUrl({ pathname: '/', hash: '#/server/1?apiIndex=1' }), null)
  // Pages/子路径部署：后台走 /#/admin，不经过 /admin 入口
  assert.equal(resolveAdminEntryUrl({ pathname: '/repo/', hash: '#/admin' }), null)
})

test('/admin 与带查询参数的回跳都归一化为标准后台地址', () => {
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin/' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', search: '?foo=1' }), '/admin#/admin?foo=1')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', search: '?state=abc&redirect_url=%2Fadmin' }), '/admin#/admin?state=abc&redirect_url=%2Fadmin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', search: '?apiIndex=1' }), '/admin#/admin?apiIndex=1')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/' }), '/admin#/admin')
})

test('/admin 下的非后台 hash 一律收敛到后台首页', () => {
  // 详情页只有域名根路径入口 /#/server/:id（见 theme-develop.md）；挂在 /admin 下的
  // #/server/:id 不是合法入口，刷新时收回到后台，登录后由列表重新点开
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/server/1' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/server/1?apiIndex=1' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', search: '?apiIndex=1', hash: '#/server/2' }), '/admin#/admin?apiIndex=1')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin/', hash: '#/server/2' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/server' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/serverx/1' }), '/admin#/admin')
})

test('旧式 #admin 入口（第三方主题约定）被兼容并收敛到 #/admin', () => {
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#admin' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#admin?apiIndex=1' }), '/admin#/admin?apiIndex=1')
  // hash 与 search 同时存在时，search 补进 hash，不丢参数；hash 内已有 query 则不重复拼接
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', search: '?apiIndex=1', hash: '#admin' }), '/admin#/admin?apiIndex=1')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', search: '?apiIndex=1', hash: '#/admin?apiIndex=2' }), '/admin#/admin?apiIndex=2')
})

test('前缀相似的非后台 hash 不被误当成后台后缀（否则会拼出不存在的路由而白屏）', () => {
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/administrator' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#adminx' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/admin/' }), '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', search: '?apiIndex=1', hash: '#/administrator' }), '/admin#/admin?apiIndex=1')
})

test('已是标准形式时幂等，不再改写地址栏', () => {
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/admin' }), null)
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/admin?apiIndex=1' }), null)
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/admin?foo=1' }), null)
})

test('归一化结果一律解析为 /admin 路由，且不再残留裸 query', () => {
  const cases = [
    { pathname: '/admin' },
    { pathname: '/admin', search: '?foo=1' },
    { pathname: '/admin', search: '?apiIndex=1', hash: '#admin' },
    { pathname: '/admin', hash: '#admin' },
    { pathname: '/admin', hash: '#admin?apiIndex=1' },
    { pathname: '/admin', hash: '#/admin?apiIndex=1' }
  ]

  for (const loc of cases) {
    const target = resolveAdminEntryUrl(loc) ?? currentUrl(loc)
    const hashIndex = target.indexOf('#')
    assert.ok(hashIndex > -1, `后台入口必须带 hash: ${target}`)
    const queryIndex = target.indexOf('?')
    // 归一化后地址栏不再有裸 query：hash history 会把 pathname+search 吞进 base，
    // 留在 search 里的 ?foo=1 之后清不掉
    if (queryIndex > -1) assert.ok(queryIndex > hashIndex, `query 必须在 hash 内: ${target}`)
    assert.match(resolveHashLocation(target), /^\/admin(\?|$)/, target)
  }
})

test('normalizeAdminEntryUrl 只在需要改写时 replaceState，且保留 null state', () => {
  const run = (loc) => {
    const calls = []
    globalThis.window = {
      location: { pathname: loc.pathname, search: loc.search || '', hash: loc.hash || '' },
      history: { replaceState: (state, _title, url) => calls.push({ state, url }) }
    }
    try {
      normalizeAdminEntryUrl()
    } finally {
      delete globalThis.window
    }
    return calls
  }

  assert.deepEqual(run({ pathname: '/admin', search: '?foo=1' }), [{ state: null, url: '/admin#/admin?foo=1' }])
  assert.deepEqual(run({ pathname: '/admin', hash: '#admin' }), [{ state: null, url: '/admin#/admin' }])
  assert.deepEqual(run({ pathname: '/admin', hash: '#/admin' }), [])
  assert.deepEqual(run({ pathname: '/admin', hash: '#/server/1' }), [{ state: null, url: '/admin#/admin' }])
  assert.deepEqual(run({ pathname: '/', hash: '#/' }), [])
})

test('非浏览器环境调用 normalizeAdminEntryUrl 不抛错', () => {
  assert.equal(ADMIN_ENTRY_URL, '/admin#/admin')
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin' }), ADMIN_ENTRY_URL)
  assert.doesNotThrow(() => normalizeAdminEntryUrl())
})

// Exercise the actual history implementation and router entry module, not only URL parsing.
import { createServer } from 'vite'
import { createRouter, createWebHashHistory } from 'vue-router'
import { readFileSync } from 'node:fs'

const withBrowser = async (href, run) => {
  const originals = Object.fromEntries(['window', 'document', 'location', 'history', 'localStorage', 'fetch'].map(key => [key, globalThis[key]]))
  const location = new URL(href, 'https://monitor.example')
  const redirects = []
  location.assign = url => redirects.push(url)
  location.reload = () => redirects.push('reload')
  const history = {
    state: null, length: 1,
    replaceState(state, _title, url) {
      this.state = state
      if (url) location.href = new URL(url, location).href
    },
    pushState(state, title, url) { this.replaceState(state, title, url) },
    go() {}
  }
  globalThis.window = { location, history, addEventListener() {}, removeEventListener() {} }
  globalThis.location = location
  globalThis.history = history
  globalThis.document = { querySelector: () => null, addEventListener() {}, removeEventListener() {} }
  const storage = new Map([['jwt_token', 'expired-token']])
  globalThis.localStorage = { getItem: key => storage.get(key), removeItem: key => storage.delete(key) }
  try { await run({ location, redirects, storage }) } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
}

const testRoutes = [
  { path: '/', name: 'Dashboard', component: {} },
  { path: '/admin', name: 'Admin', component: {} },
  { path: '/server/:id', name: 'Server', component: {} }
]

test('router entry normalizes Access return before taking the initial history snapshot', async () => {
  const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, entries: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try {
    await withBrowser('/admin?state=access&redirect_url=%2Fadmin', async ({ location }) => {
      const { default: router } = await vite.ssrLoadModule('/src/frontend/router/index.js')
      for (const route of testRoutes) router.addRoute(route)
      assert.equal(router.options.history.location, '/admin?state=access&redirect_url=%2Fadmin')
      await router.push(router.options.history.location)
      assert.equal(router.currentRoute.value.name, 'Admin')
      assert.deepEqual(router.currentRoute.value.query, { state: 'access', redirect_url: '/admin' })
      assert.equal(location.search, '')
      await router.replace({ path: '/admin', query: {} })
      assert.equal(location.href, 'https://monitor.example/admin#/admin')
      router.options.history.destroy()
    })
  } finally { await vite.close() }
})

test('OAuth success, binding and failure callback parameters reach route.query and can be cleared', async () => {
  for (const href of [
    '/admin', '/admin/', '/admin?github_bound=1',
    '/admin?github_error=cancelled', '/admin?github_error=binding_auth_required',
    '/admin?github_bound=1&foo=a%2Bb#admin?apiIndex=2',
    '/admin/?github_error=invalid_state#admin?foo=1', '/admin#admin?github_bound=1'
  ]) {
    await withBrowser(href, async ({ location }) => {
      const expected = new URL(href, location)
      const expectedQuery = Object.fromEntries(new URLSearchParams(expected.search))
      Object.assign(expectedQuery, Object.fromEntries(new URLSearchParams(expected.hash.split('?')[1])))
      normalizeAdminEntryUrl()
      const history = createWebHashHistory()
      const router = createRouter({ history, routes: testRoutes })
      await router.push(history.location)
      assert.equal(router.currentRoute.value.name, 'Admin', href)
      assert.deepEqual(router.currentRoute.value.query, expectedQuery, href)
      const query = { ...router.currentRoute.value.query }
      delete query.github_bound
      delete query.github_error
      await router.replace({ path: '/admin', query })
      assert.equal(location.search, '')
      assert.equal(new URLSearchParams(location.hash.split('?')[1]).has('github_bound'), false)
      assert.equal(new URLSearchParams(location.hash.split('?')[1]).has('github_error'), false)
      assert.equal(resolveAdminEntryUrl(location), null)
      history.destroy()
    })
  }
})

test('root detail links survive refresh, new tabs and navigation home; old admin detail entries converge', async () => {
  await withBrowser('/#/server/node-1?apiIndex=2', async ({ location }) => {
    normalizeAdminEntryUrl()
    const history = createWebHashHistory()
    const router = createRouter({ history, routes: testRoutes })
    await router.push(history.location)
    assert.equal(router.currentRoute.value.name, 'Server')
    assert.equal(router.currentRoute.value.params.id, 'node-1')
    assert.equal(router.currentRoute.value.query.apiIndex, '2')
    const refreshedHistory = createWebHashHistory()
    assert.equal(refreshedHistory.location, '/server/node-1?apiIndex=2')
    refreshedHistory.destroy()
    await router.push('/')
    assert.equal(location.pathname, '/')
    assert.equal(router.currentRoute.value.name, 'Dashboard')
    history.destroy()
  })
  assert.equal(resolveAdminEntryUrl({ pathname: '/admin', hash: '#/server/node-1' }), ADMIN_ENTRY_URL)
  const table = readFileSync(new URL('../src/frontend/views/admin/components/ServerTable.vue', import.meta.url), 'utf8')
  assert.match(table, /:href="getPublicServerHref\(server\)"/)
  assert.match(table, /`\/#\/server\/\$\{encodeURIComponent\(server.id\)\}\$\{getServerQuery\(\)\}`/)
  assert.doesNotMatch(table, /getDefaultServerRoute/)
})

test('401 clears stale JWT and sends detail pages to canonical admin; Cookie requests and opt-out survive', async () => {
  const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, entries: [] }, server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { http } = await vite.ssrLoadModule('/src/frontend/utils/http.js')
    for (const href of ['/#/server/node-1', '/admin#/admin']) {
      await withBrowser(href, async ({ redirects, storage }) => {
        const requests = []
        globalThis.fetch = async (_url, options) => { requests.push(options); return new Response(null, { status: 401 }) }
        assert.equal((await http.get('/api/servers')).status, 401)
        assert.equal(storage.has('jwt_token'), false)
        assert.deepEqual(redirects, [href.startsWith('/admin') ? 'reload' : ADMIN_ENTRY_URL])
        assert.equal(requests[0].credentials, 'include')
        redirects.length = 0
        await http.post('/auth/github', {}, { autoRedirect: false })
        assert.deepEqual(redirects, [])
        globalThis.fetch = async () => Response.json({ authorization: false, is_public: false })
        await http.get('/api/config')
        assert.deepEqual(redirects, []) // fresh login-page config must not initiate another reload
      })
    }
  } finally { await vite.close() }
})

test('Worker trailing-slash redirect preserves Access/OAuth query in canonical hash', async () => {
  const { default: worker } = await import('../src/index.js')
  for (const query of ['', '?foo=1', '?github_bound=1', '?github_error=cancelled&foo=a%2Bb']) {
    const response = await worker.fetch(new Request(`https://monitor.example/admin/${query}`), { API_SECRET: 'test-secret' }, {})
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('Location'), `https://monitor.example/admin#/admin${query}`)
  }
})
