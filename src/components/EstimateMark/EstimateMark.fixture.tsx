import { defineFixture } from '../../internal/fixture.js'
import { EstimateMark } from './EstimateMark.js'

interface Props {
  hint: string
}

export default defineFixture<Props>({
  name: 'EstimateMark',
  group: 'Данные',
  // Строчный: он всегда стоит хвостом к числу и никогда сам по себе.
  kind: 'inline',

  props: { hint: '' },

  controls: {
    hint: { kind: 'text', prop: true },
  },

  data: {
    precise: { hint: 'ставка оценочная, не из договора' },
    long: { hint: 'сумма посчитана по графику платежей, а не по фактическим проводкам' },
  },

  cases: [
    {
      id: 'base',
      title: 'Обычная',
      note: 'Значок сам по себе — так его никогда не видят. Случай нужен, чтобы'
        + ' посмотреть на сам знак: его размер, вес и то, как он держит базовую линию.',
    },
    {
      id: 'in-column',
      title: 'В колонке чисел',
      note: 'Ради этого случая компонент и существует. Помеченные числа стоят'
        + ' В ОДНОЙ колонке с точными, и значок не должен сдвигать разряды: колонка'
        + ' сумм читается по правому краю, и уехавшая на ширину значка строка'
        + ' ломает сравнение сильнее, чем сама неточность.',
      render: (p) => (
        <table style={{ borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <tbody>
            {[
              ['Оклад', '84 000,00', false],
              ['Премия', '12 400,00', true],
              ['Переработка', '3 180,50', true],
              ['Удержания', '−2 000,00', false],
              ['Итого', '97 580,50', true],
            ].map(([label, sum, est]) => (
              <tr key={label as string}>
                <td style={{ padding: '0.25rem 1rem 0.25rem 0' }}>{label}</td>
                <td style={{ padding: '0.25rem 0', textAlign: 'right' }}>
                  {sum}
                  {est ? <EstimateMark hint={p.hint || undefined} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      id: 'sounds',
      title: 'Помета звучит, а не висит в title',
      note: 'Пометка уходит в дерево доступности ТЕКСТОМ. `title` недостижим ни с'
        + ' клавиатуры, ни со скринридера — то же решение, что у `Money.unknownHint`,'
        + ' и второе решение той же беды в одной системе было бы непоследовательностью.'
        + ' Проверять надо вкладкой axe и слоем таб-стопов, а не наведением мыши.',
      render: () => (
        <p style={{ margin: 0, maxInlineSize: '32rem' }}>
          Ставка водителя — 1 850,00 ₽ за смену
          <EstimateMark hint="ставка оценочная, не из договора" />, начислено за август
          46 250,00 ₽<EstimateMark />.
        </p>
      ),
    },
    {
      id: 'custom-hint',
      title: 'Своя формулировка',
      props: { hint: 'сумма по графику платежей, не из проводок' },
      note: 'Умолчание «оценочная величина» переопределяют, когда оценочность'
        + ' названа точнее. Общая формулировка на весь отчёт — упущенная'
        + ' возможность объяснить, ЧЕМ именно величина неточна.',
    },
  ],

  render: (p) => (
    <span>
      1 850,00 ₽<EstimateMark hint={p.hint || undefined} />
    </span>
  ),
})
