import { NotificationCenter } from '@santarinto/jig'
export const List = () => (
  <NotificationCenter onDismiss={() => {}} items={[
    { id: 'n1', tone: 'info', title: 'Обновление', text: 'Доступна новая версия конфигурации' },
    { id: 'n2', tone: 'warning', title: 'Срок сдачи отчёта', text: 'НДС за квартал — до 25 июля' },
    { id: 'n3', tone: 'success', title: 'Синхронизация завершена' },
  ]} />
)
