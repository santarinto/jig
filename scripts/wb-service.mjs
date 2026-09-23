/**
 * Верстак как служба: постоянный экземпляр под systemd --user (DS-123).
 *
 * Верстак поднят ВСЕГДА, на том же 5274, из ЭТОГО рабочего дерева — включая
 * незакоммиченное. Так решено владельцем 29.08: пользователь один, и «постоянный
 * показывает чужую ветку» для него не тихий отказ, а ровно то, что нужно видеть.
 * Отдельного worktree и отдельного каталога нет; сборки и раскатки нет тоже —
 * голый http-сервер не отдал бы `.tsx`, а сборка убила бы работу с
 * незакоммиченным. Минимальный сервер здесь — сам vite.
 *
 * Unit НЕ хранится в репозитории готовым: в нём абсолютные пути этой машины.
 * Хранится генератор — `install` подставляет корень репозитория и каталог ноды.
 *
 * ЛОВУШКА, РАДИ КОТОРОЙ НАПИСАН `status`. Нода стоит под nvm
 * (`~/.nvm/versions/node/vXX/bin`), а PATH у `systemd --user` её не содержит —
 * поэтому unit несёт свой `Environment=PATH=`, то есть ПИН НА ВЕРСИЮ. После
 * `nvm install` каталог сменится, служба при следующем рестарте умрёт с
 * `status=203/EXEC`, и это читается как «сломалась», а не как «нода переехала».
 * `status` сверяет каталог из unit-а с текущим и говорит это вслух.
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

const ROOT = resolve(import.meta.dirname, '..')
const UNIT = 'ds-workbench.service'
const UNIT_DIR = join(homedir(), '.config', 'systemd', 'user')
const UNIT_PATH = join(UNIT_DIR, UNIT)

/**
 * Порт берётся из конфига, а не пишется здесь второй раз: разошедшиеся числа —
 * это ровно тот дефект, против которого гейт `dev-server-ports`.
 */
const PORT = Number(
  readFileSync(join(ROOT, 'vite.workbench.config.ts'), 'utf8').match(/port:\s*(\d{4})/)?.[1],
)
if (!PORT) throw new Error('порт не найден в vite.workbench.config.ts')

/**
 * `[::1]`, а не `localhost`. Vite по умолчанию слушает `localhost`, и на этой
 * машине это ТОЛЬКО `[::1]`, тогда как `fetch` из Node уходит на 127.0.0.1 и
 * падает при живом сервере. Тот же разбор — в шапке `scripts/smoke-workbench.mjs`.
 */
const PROBE = `http://[::1]:${PORT}/`

const NODE_BIN = dirname(process.execPath)

const unitText = () => `[Unit]
Description=jig: верстак компонентов (постоянный, ${ROOT})
Documentation=file://${join(ROOT, 'README.md')}
After=default.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
# Каталог ноды подставлен установкой. Сменишь ноду через nvm — поправь здесь
# и сделай daemon-reload; "make wb-status" скажет, когда это случилось.
Environment=PATH=${NODE_BIN}:/usr/local/bin:/usr/bin:/bin
ExecStart=${join(NODE_BIN, 'npm')} run wb
Restart=on-failure
RestartSec=2
# Служба, про которую не знаешь, что она умерла, хуже её отсутствия: закладка
# отдаёт ошибку соединения, и это читается как «сеть моргнула».
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ds-workbench

[Install]
WantedBy=default.target
`

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' })
const systemctl = (...args) => {
  try {
    return execFileSync('systemctl', ['--user', ...args], { encoding: 'utf8' }).trim()
  } catch (e) {
    return (e.stdout ?? '').trim() || `(${e.status})`
  }
}

/** Отвечает ли сервер. Не «жив ли процесс»: процесс может быть жив и не отдавать. */
async function answers() {
  try {
    const r = await fetch(PROBE, { signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch {
    return false
  }
}

async function install() {
  mkdirSync(UNIT_DIR, { recursive: true })
  writeFileSync(UNIT_PATH, unitText())
  console.log(`unit → ${UNIT_PATH}`)
  systemctl('daemon-reload')
  systemctl('enable', '--now', UNIT)

  // Ждём ответа, а не «активен»: `enable --now` возвращается раньше, чем vite
  // прогреет зависимости, и мгновенная проверка сказала бы «не поднялся» о живой
  // службе. Тот же класс вранья, что разобран в smoke-workbench.
  for (let i = 0; i < 60; i++) {
    if (await answers()) {
      console.log(`ГОТОВО — верстак отвечает на ${PROBE} (в браузере: http://localhost:${PORT}/)`)
      return
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.error(`НЕ ПОДНЯЛСЯ за 30 с. Смотреть: make wb-logs`)
  console.error(systemctl('status', UNIT, '--no-pager', '-l'))
  process.exitCode = 1
}

async function status() {
  if (!existsSync(UNIT_PATH)) {
    console.log(`unit не установлен (${UNIT_PATH}). Поставить: make wb-install`)
    process.exitCode = 1
    return
  }
  const text = readFileSync(UNIT_PATH, 'utf8')
  const active = systemctl('is-active', UNIT)
  const enabled = systemctl('is-enabled', UNIT)
  const ok = await answers()

  console.log(`unit      ${UNIT_PATH}`)
  console.log(`active    ${active}   enabled: ${enabled}`)
  console.log(`отвечает  ${ok ? 'да' : 'НЕТ'}   ${PROBE}`)

  const unitRoot = text.match(/^WorkingDirectory=(.+)$/m)?.[1]
  if (unitRoot !== ROOT) {
    console.log(`\nРАСХОЖДЕНИЕ: unit смотрит в ${unitRoot}, а это дерево ${ROOT}.`)
    console.log('Служба показывает ДРУГОЙ каталог. Починить: make wb-install')
    process.exitCode = 1
  }

  const unitNode = text.match(/^Environment=PATH=([^:]+)/m)?.[1]
  if (unitNode !== NODE_BIN) {
    console.log(`\nНОДА ПЕРЕЕХАЛА: в unit-е ${unitNode}, сейчас ${NODE_BIN}.`)
    console.log('При следующем рестарте служба умрёт с status=203/EXEC — это выглядит')
    console.log('как поломка, а не как смена версии. Починить: make wb-install')
    process.exitCode = 1
  }

  if (active !== 'active' || !ok) {
    console.log(`\n${systemctl('status', UNIT, '--no-pager', '-l')}`)
    process.exitCode = 1
  }
}

function uninstall() {
  systemctl('disable', '--now', UNIT)
  if (existsSync(UNIT_PATH)) sh(`rm -f ${JSON.stringify(UNIT_PATH)}`)
  systemctl('daemon-reload')
  console.log('снято')
}

const cmd = process.argv[2]
if (cmd === 'install') await install()
else if (cmd === 'status') await status()
else if (cmd === 'uninstall') uninstall()
else {
  console.error('usage: node scripts/wb-service.mjs install|status|uninstall')
  process.exitCode = 2
}
