import { useState } from 'react'
import { TextField } from '../../src/components/TextField/index.js'
import { Textarea } from '../../src/components/Textarea/index.js'
import { Select } from '../../src/components/Select/index.js'
import { Checkbox } from '../../src/components/Toggle/index.js'
import { Radio } from '../../src/components/Toggle/index.js'
import { Switch } from '../../src/components/Toggle/index.js'
import { Combobox, type ComboboxOption } from '../../src/components/Combobox/index.js'
import { NumberField } from '../../src/components/NumberField/index.js'
import { Slider } from '../../src/components/Slider/index.js'
import { CodeInput } from '../../src/components/CodeInput/index.js'
import { FormRow } from '../../src/components/Form/index.js'
import { SectionPanel, type Section } from '../../src/components/SectionPanel/index.js'
import { FileDrop } from '../../src/components/FileDrop/index.js'
import { DemoBlock, DemoSpec } from '../demo-spec.js'

const FORMROW_CODE = [
  '<FormRow label="Контрагент" htmlFor="frm-contragent">',
  '  <TextField id="frm-contragent" defaultValue="ООО «Ромашка»" />',
  '</FormRow>',
].join('\n')

const SECTIONS: Section[] = [
  { id: 'main', label: 'Основные' },
  { id: 'goods', label: 'Товары' },
  // Раздел виден, но недоступен: стрелки его перешагивают, клик не выбирает.
  { id: 'ads', label: 'Реклама', disabled: true },
  { id: 'extra', label: 'Дополнительно' },
]

const SECTIONPANEL_CODE = [
  'const SECTIONS: Section[] = [',
  "  { id: 'main', label: 'Основные' },",
  "  { id: 'goods', label: 'Товары' },",
  "  { id: 'ads', label: 'Реклама', disabled: true },",
  "  { id: 'extra', label: 'Дополнительно' },",
  ']',
  "const [section, setSection] = useState('main')",
  '',
  '<SectionPanel sections={SECTIONS} selectedId={section} onSelect={setSection} orientation="horizontal" />',
].join('\n')

const FILEDROP_CODE = [
  'const [files, setFiles] = useState<File[]>([])',
  '',
  '<FileDrop files={files} onFiles={setFiles} multiple accept=".xml,.pdf" hint="Перетащите файлы или выберите" />',
].join('\n')

export function FormsSection() {
  const [section, setSection] = useState('main')
  const [files, setFiles] = useState<File[]>([])
  const [comboOpts, setComboOpts] = useState<ComboboxOption[]>([
    { value: 'rub', label: 'Рубль' },
    { value: 'usd', label: 'Доллар' },
  ])
  const [comboVal, setComboVal] = useState('rub')
  const [checked, setChecked] = useState(true)
  const [radio, setRadio] = useState('a')
  const [sw, setSw] = useState(false)
  const [num, setNum] = useState(10)
  const [slider, setSlider] = useState(40)
  const [code, setCode] = useState('')

  return (
    <section className="demo-section" id="forms">
      <h2 className="demo-section__title">Forms</h2>
      <div className="demo-grid demo-grid--1">
        <DemoBlock
          name="TextField"
          block
          code={'<TextField label="Контрагент" defaultValue="ООО «Ромашка»" hint="Как в учёте" />'}
        >
          <div className="demo-field-width">
            <TextField label="Контрагент" defaultValue="ООО «Ромашка»" hint="Как в учёте" />
          </div>
        </DemoBlock>
        <DemoBlock
          name="Textarea"
          block
          code={'<Textarea label="Комментарий" rows={3} maxLength={200} defaultValue="Срочная поставка" />'}
        >
          <div className="demo-field-width">
            <Textarea label="Комментарий" rows={3} maxLength={200} defaultValue="Срочная поставка" />
          </div>
        </DemoBlock>
        <DemoBlock
          name="Select"
          block
          code={'<Select label="Склад" options={[…]} value="main" onChange={…} />'}
        >
          <div className="demo-field-width">
            <Select
              label="Склад"
              options={[
                { value: 'main', label: 'Основной' },
                { value: 'retail', label: 'Розница' },
              ]}
              value="main"
              onChange={() => {}}
            />
          </div>
        </DemoBlock>
        <DemoBlock
          name="Combobox"
          block
          code={'<Combobox label="Валюта" options={options} value={value} onChange={setValue} onCreate={…} />'}
        >
          <div className="demo-field-width">
            <Combobox
              label="Валюта"
              options={comboOpts}
              value={comboVal}
              onChange={setComboVal}
              onCreate={(label) => {
                const value = label.toLowerCase()
                setComboOpts((o) => [...o, { value, label }])
                setComboVal(value)
              }}
            />
          </div>
        </DemoBlock>
        <DemoBlock
          name="NumberField"
          block
          code={'<NumberField label="Количество" value={num} onChange={setNum} min={0} max={999} suffix="шт" />'}
        >
          <div className="demo-field-width">
            <NumberField label="Количество" value={num} onChange={setNum} min={0} max={999} suffix="шт" />
          </div>
        </DemoBlock>
        <DemoBlock
          name="Slider"
          block
          code={'<Slider label="Скидка" value={slider} onChange={setSlider} min={0} max={100} suffix="%" />'}
        >
          <div className="demo-field-width">
            <Slider label="Скидка" value={slider} onChange={setSlider} min={0} max={100} suffix="%" />
          </div>
        </DemoBlock>
        <div>
          <p className="demo-card__label">Checkbox / Radio / Switch</p>
          <div className="demo-stack">
            <DemoSpec inline name="Checkbox" code={'<Checkbox label="Провести сразу" checked={checked} onChange={…} />'}>
              <Checkbox label="Провести сразу" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            </DemoSpec>
            <DemoSpec inline name="Radio · A" code={'<Radio name="demo-radio" label="Вариант A" value="a" … />'}>
              <Radio name="demo-radio" label="Вариант A" value="a" checked={radio === 'a'} onChange={() => setRadio('a')} />
            </DemoSpec>
            <DemoSpec inline name="Radio · B" code={'<Radio name="demo-radio" label="Вариант B" value="b" … />'}>
              <Radio name="demo-radio" label="Вариант B" value="b" checked={radio === 'b'} onChange={() => setRadio('b')} />
            </DemoSpec>
            <DemoSpec inline name="Switch" code={'<Switch label="Уведомления" checked={sw} onChange={…} />'}>
              <Switch label="Уведомления" checked={sw} onChange={(e) => setSw(e.target.checked)} />
            </DemoSpec>
          </div>
        </div>
        <DemoBlock
          name="CodeInput"
          block
          code={'<CodeInput length={4} label="Код подтверждения" value={code} onChange={setCode} />'}
        >
          <div className="demo-field-width">
            <CodeInput length={4} label="Код подтверждения" value={code} onChange={setCode} />
          </div>
        </DemoBlock>
        <DemoBlock name="FormRow" block code={FORMROW_CODE}>
          <FormRow label="Контрагент" htmlFor="frm-contragent">
            <TextField id="frm-contragent" defaultValue="ООО «Ромашка»" />
          </FormRow>
        </DemoBlock>
        <DemoBlock name="SectionPanel" block code={SECTIONPANEL_CODE}>
          <SectionPanel sections={SECTIONS} selectedId={section} onSelect={setSection} orientation="horizontal" />
        </DemoBlock>
        <DemoBlock name="FileDrop" block code={FILEDROP_CODE}>
          <div className="demo-field-width">
            <FileDrop files={files} onFiles={setFiles} multiple accept=".xml,.pdf" hint="Перетащите файлы или выберите" />
          </div>
        </DemoBlock>
      </div>
    </section>
  )
}
