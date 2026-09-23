import { Toast } from '@santarinto/jig'
export const Tones = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Toast tone="success" onClose={() => {}}>Документ проведён</Toast>
    <Toast tone="error" onClose={() => {}}>Не удалось провести: нет остатка</Toast>
    <Toast tone="info" onClose={() => {}}>Доступна новая версия</Toast>
  </div>
)
