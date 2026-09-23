import { Pagination } from '@santarinto/jig'

export const Default = () => <Pagination page={2} pageCount={5} onChange={() => {}} />

/** Много страниц: полоса сворачивается, а не растёт до пятисот кнопок. */
export const ManyPages = () => <Pagination page={50} pageCount={500} onChange={() => {}} />

/**
 * Подвал таблицы: размер страницы слева, диапазон по центру, навигация справа.
 * Три колонки, поэтому диапазон остаётся по центру и без селектора.
 */
export const TableFooter = () => (
  <div style={{ width: 720 }}>
    <Pagination
      page={2} pageCount={18} variant="arrows"
      total={347} pageSize={20}
      pageSizeOptions={[8, 25, 50]}
      onChange={() => {}} onPageSizeChange={() => {}}
    />
  </div>
)
