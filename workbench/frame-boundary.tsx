/**
 * Граница ошибки кадра.
 *
 * Без неё упавшая фикстура даёт молчаливый белый прямоугольник, и полчаса
 * уходит на «почему не рисуется». Текст исключения и стек — прямо в кадре.
 *
 * Чего она НЕ ловит (важно не обмануться): ошибки в обработчиках событий,
 * в асинхронном коде и синхронное зависание. Последнее вообще неизлечимо
 * изнутри страницы — кадр same-origin делит с оболочкой главный поток.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { pack, type Up } from './protocol.js'

interface Props {
  sid: number
  children: ReactNode
}

interface State {
  err: Error | null
  stack: string
}

export class FrameBoundary extends Component<Props, State> {
  state: State = { err: null, stack: '' }

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    const stack = info.componentStack ?? err.stack ?? ''
    this.setState({ stack })
    const msg: Up = { type: 'error', message: err.message, stack }
    window.parent.postMessage(pack(this.props.sid, msg), window.location.origin)
  }

  private retry = (): void => {
    this.setState({ err: null, stack: '' })
  }

  private copy = (): void => {
    const { err, stack } = this.state
    void navigator.clipboard.writeText(`${err?.message ?? ''}\n${stack}`)
  }

  render(): ReactNode {
    const { err, stack } = this.state
    if (!err) return this.props.children

    return (
      <div className="wbf-error">
        <div className="wbf-error__title">Фикстура упала</div>
        <pre className="wbf-error__text">{err.message}</pre>
        <div className="wbf-error__row">
          <button type="button" className="wbf-btn" onClick={this.retry}>
            повторить
          </button>
          <button type="button" className="wbf-btn" onClick={this.copy}>
            копировать стек
          </button>
        </div>
        {stack ? <pre className="wbf-error__stack">{stack.trim()}</pre> : null}
      </div>
    )
  }
}
