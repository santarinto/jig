// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { tempRootManual } from './tmp-sandbox.js'

/**
 * Дев-сервер верстака отдаёт файлы вне своего корня по `/@fs/<абсолютный
 * путь>`, и корень здесь — папка `workbench`: весь репозиторий достаётся
 * только этим каналом (DS-217). Закрыть его наглухо нельзя — это
 * единственный способ прочитать превью и фикстуры для агента без чекаута, — но
 * и границы у него не было НАПИСАНО: её выводил `searchForWorkspaceRoot`,
 * обход вверх в поисках маркера монорепозитория.
 *
 * Замер до правки (06.09.2026, живая служба на 5274): вне репозитория уже был
 * отказ — домашний `.bashrc`, `/etc/hostname`, `README.md` соседнего проекта
 * дали 403. То есть чинилась не открытая дыра, а ЭВРИСТИКА на её месте: маркер
 * монорепозитория уровнем выше сдвинул бы корень на родительский каталог, и
 * постоянная служба начала бы отдавать соседние проекты. Молча — 200 на чужой
 * файл неотличим от 200 на свой.
 *
 * ПОЧЕМУ ЖИВОЙ СЕРВЕР, А НЕ РАЗБОР КОНФИГА. Утверждение «в файле написано
 * `fs.allow`» верно и на конфиге, где `allow` указывает не туда, и на версии
 * vite, где ключ переименован. Здесь поднимается НАСТОЯЩИЙ дев-сервер тем же
 * конфигом и спрашивается по HTTP — обе половины сразу: файл внутри
 * репозитория по-прежнему отдаётся, файл снаружи получает отказ. Одна половина
 * без второй ничего не значит: закрыть всё легко и это ломает превью, открыть
 * всё — исходное состояние.
 *
 * Порт 0 и `strictPort: false` перебивают конфиг: 5274 занят постоянной
 * службой, и прогон, севший на её порт, проверял бы чужое дерево.
 */
const ROOT = resolve(__dirname, '../..')

let server: ViteDevServer
let base: string

/**
 * Метка в файле-приманке: по ней видно, что утекло именно содержимое.
 * Каталог — через `tempRootManual`, а не `mkdtemp` руками: он живёт дольше
 * одного теста, и снос за ним обязан быть назван (`tmp-hygiene`, DS-165).
 * Песочница прогона лежит в системном `/tmp`, то есть заведомо вне репозитория
 * — ровно то, что здесь и требуется от приманки.
 */
const SENTINEL = 'DS-217-FS-BOUND-PROBE'
let decoy: string
let removeDecoy: () => void

beforeAll(async () => {
  const t = tempRootManual('ds-fs-bound-')
  removeDecoy = t.remove
  decoy = join(t.dir, 'decoy.txt')
  writeFileSync(decoy, `${SENTINEL}\n`)
  server = await createServer({
    configFile: resolve(ROOT, 'vite.workbench.config.ts'),
    server: { port: 0, strictPort: false, host: '127.0.0.1', open: false, hmr: false },
    logLevel: 'silent',
  })
  await server.listen()
  const addr = server.httpServer!.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
}, 60_000)

afterAll(async () => {
  await server?.close()
  removeDecoy?.()
})

const at = (abs: string) => fetch(`${base}/@fs${abs}?raw`)

describe('границы /@fs у дев-сервера верстака', () => {
  it('сервер поднялся не на 5274 — иначе проверялась бы чужая служба', () => {
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(base.endsWith(':5274'), 'прогон сел на порт постоянной службы').toBe(false)
  })

  it('файл ВНУТРИ репозитория по-прежнему отдаётся — канал агента жив', async () => {
    for (const rel of ['workbench/frame-url.ts', 'previews/modal.html', 'src/components/Tabs/Tabs.tsx']) {
      const r = await at(resolve(ROOT, rel))
      expect(r.status, `${rel} отказан — закрыт канал, которым работает агент`).toBe(200)
      const body = await r.text()
      // По содержимому, а не по коду: 200 приходит и на SPA-фолбэк с
      // оболочкой верстака — ровно тот дефект, что чинила DS-223.
      expect(body.length, `${rel}: ответ подозрительно короткий (${body.length} байт)`).toBeGreaterThan(500)
      expect(body, `${rel}: вместо файла приехала оболочка верстака`).not.toContain('<div id="root">')
    }
  })

  it('файл ВНЕ репозитория — отказ, и содержимое не утекает', async () => {
    // Файлы РЕАЛЬНЫЕ, и это не педантизм: на несуществующем пути `/@fs` отдаёт
    // 200 с SPA-оболочкой (родня DS-223), и «отказано» на выдуманном
    // файле выглядело бы зелёным, ничего не проверив. Поэтому свой файл с
    // меткой в системном временном каталоге — он заведомо вне репозитория и
    // заведомо существует, — плюс всё, что реально лежит РЯДОМ с репозиторием:
    // именно туда уехал бы корень, выведи его эвристика на уровень выше.
    const probes: string[] = [decoy]
    const up = resolve(ROOT, '..')
    for (const e of readdirSync(up, { withFileTypes: true })) {
      if (e.name === basename(ROOT)) continue
      const inside = e.isDirectory()
        ? ['README.md', 'package.json', '.gitignore'].map((f) => join(up, e.name, f)).find(existsSync)
        : join(up, e.name)
      if (inside && existsSync(inside) && statSync(inside).isFile()) probes.push(inside)
      if (probes.length >= 4) break
    }
    const bashrc = resolve(homedir(), '.bashrc')
    if (existsSync(bashrc)) probes.push(bashrc)

    // Счётчик до утверждений: пустой список отказал бы всем нулю файлов.
    expect(probes.length, 'не нашлось ни одного файла вне репозитория для пробы')
      .toBeGreaterThanOrEqual(2)

    for (const abs of probes) {
      const r = await at(abs)
      const body = await r.text()
      expect(r.status, `${abs} отдан со статусом 200`).not.toBe(200)
      expect(body, `${abs}: содержимое утекло`).not.toContain(SENTINEL)
    }
  })

  it('граница НАПИСАНА в конфиге, а не оставлена эвристике', () => {
    // Единственное утверждение здесь про текст, а не про поведение, — и
    // отдельно про то, почему иначе нельзя. Сегодня `searchForWorkspaceRoot`
    // и так приводит корень к репозиторию: сняв `fs` целиком, живой сервер
    // отвечает ровно то же, и все проверки выше остаются зелёными (проверено
    // мутацией, она выжила). Разница появится в тот день, когда уровнем выше
    // заведут `pnpm-workspace.yaml` или `workspaces` — и появится молча.
    // Поэтому утверждается ровно то, что поведением неразличимо: решение
    // записано, а не выведено.
    const cfg = readFileSync(resolve(ROOT, 'vite.workbench.config.ts'), 'utf8')
    expect(cfg, 'в конфиге верстака нет fs.strict — граница снова эвристика')
      .toMatch(/strict:\s*true/)
    expect(cfg, 'в конфиге верстака нет fs.allow — граница снова эвристика')
      .toMatch(/allow:\s*\[\s*import\.meta\.dirname\s*\]/)
    expect(cfg, 'интерфейс постоянной службы не написан').toMatch(/host:\s*'localhost'/)
  })

  it('проба снаружи действительно читаема с диска — иначе отказ ничего не значит', () => {
    // Обратная мутация: отказ на НЕСУЩЕСТВУЮЩЕМ файле выглядит ровно так же,
    // как отказ на закрытом. Метка читается с диска напрямую — значит, разница
    // между двумя ответами создана границей, а не отсутствием файла.
    expect(readFileSync(decoy, 'utf8')).toContain(SENTINEL)
  })
})
