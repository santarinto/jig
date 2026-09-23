import { Alert } from '@santarinto/jig'

export const Info = () => (
  <div style={{ width: 360 }}>
    <Alert tone="info" title="Черновик сохранён" onClose={() => {}}>
      Документ автоматически сохранён 3 минуты назад.
    </Alert>
  </div>
)

export const Success = () => (
  <div style={{ width: 360 }}>
    <Alert tone="success" title="Проведено">Реализация №РТ-0001 успешно проведена.</Alert>
  </div>
)

export const Warning = () => (
  <div style={{ width: 360 }}>
    <Alert tone="warning" onClose={() => {}}>Остаток на складе меньше резерва по 2 позициям.</Alert>
  </div>
)

export const Error = () => (
  <div style={{ width: 360 }}>
    <Alert tone="error" title="Ошибка проведения" onClose={() => {}}>
      Не заполнен счёт-фактура. Проверьте реквизиты контрагента.
    </Alert>
  </div>
)
