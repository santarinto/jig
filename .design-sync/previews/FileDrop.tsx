import { useState } from 'react'
import { FileDrop } from '@santarinto/jig'

const seed = [
  new File([new Uint8Array(240 * 1024)], 'zamer-front.jpg', { type: 'image/jpeg' }),
  new File([new Uint8Array(Math.round(1.7 * 1024 * 1024))], 'zamer-side.png', { type: 'image/png' }),
]

export const WithFiles = () => {
  const [files, setFiles] = useState<File[]>(seed)
  return <div style={{ width: 320 }}><FileDrop files={files} onFiles={setFiles} accept="image/*" multiple hint="PNG, JPG до 10 МБ" /></div>
}

export const Empty = () => {
  const [files, setFiles] = useState<File[]>([])
  return <div style={{ width: 320 }}><FileDrop files={files} onFiles={setFiles} accept="image/*" multiple hint="Перетащите фото замеров" /></div>
}
