import { useState } from 'react'
import { CodeInput } from '@santarinto/jig'

export const Default = () => {
  const [code, setCode] = useState('4128')
  return <CodeInput label="Код из SMS" value={code} onChange={setCode} />
}

export const WithError = () => (
  <CodeInput label="Неверный код" value="9310" onChange={() => {}} error="Код неверный, попробуйте снова" />
)
