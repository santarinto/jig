#!/bin/sh
# Каталог компонента для промта: случаи, наборы данных, крутилки.
# Значения enum-крутилки дорезолвливаются: без этого в промт уедет имя
# константы (`POSITIONS`), а агенту нужно `top|bottom|left|right`.
for c in "$@"; do
  f="src/components/$c/$c.fixture.tsx"
  # Второй шаблон набора фикстур (`FIXTURE_GLOBS`, DS-260): публичные
  # компоненты вне каталога, сейчас `Icon`.
  [ -f "$f" ] || f="src/icons/$c.fixture.tsx"
  [ -f "$f" ] || { echo "$c: фикстуры нет — $f"; continue; }
  echo "== $c"
  # Случай пишется и столбиком (`id` отдельной строкой на отступе 6), и в
  # одну строку (`{ id: 'base', title: … }` на отступе 4). Шаблон только на
  # первую форму молча терял вторую — у 22 компонентов из 69, обычно `base`,
  # и список выглядел законным. Поиск — внутри `cases: [`: выше в файле те же
  # однострочные `{ id: … }` у наборов данных (FunctionPanel).
  printf '  case:  '; awk '/^  cases: \[/{f=1;next} f&&/^  \],?$/{exit} f' "$f" \
    | grep -oE "^(    \{ |      )id: '[^']+'" | sed "s/.*id: '//;s/'//" | tr '\n' ' '; echo
  printf '  data:  '; awk '/^  data: \{/{f=1;next} f&&/^  \},?$/{exit} f' "$f" \
    | grep -oE "^    '?[A-Za-z0-9_-]+'?:" | tr -d " :'" | tr '\n' ' '; echo
  echo '  p.*:'
  awk '/^  controls: \{/{f=1;next} f&&/^  \},?$/{exit} f' "$f" \
    | grep -oE "^ +[A-Za-z]+: \{ kind: '[a-z]+'(, values: (\[[^]]*\]|[A-Za-z_]+))?" \
    | sed "s/^ *//;s/: { kind: '/|/;s/'//;s/, values: /|/" \
    | while IFS='|' read -r name kind vals; do
        case "$vals" in
          '') printf '    %s = %s\n' "$name" "$kind" ;;
          \[*) printf '    %s = %s\n' "$name" "$(echo "$vals" | tr -d "[]' " | tr ',' '|')" ;;
          *)  r=$(grep -oE "const $vals[^=]*= *\[[^]]*\]" "$f" | sed 's/.*\[//;s/\]//' | tr -d "' " | tr ',' '|')
              printf '    %s = %s\n' "$name" "${r:-$vals (НЕ ДОРЕЗОЛВЛЕНО — резолвить руками)}" ;;
        esac
      done
done
