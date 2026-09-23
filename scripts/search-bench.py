#!/usr/bin/env python3
"""Замер качества поиска CocoSearch на вопросах с ИЗВЕСТНЫМ ответом.

Заведён на DS-354, когда выяснилось, что о качестве поиска здесь судили
по впечатлению. Метрика — РАНГ ожидаемого файла в выдаче, а не «похоже на
правду»: скоры в этом корпусе лежат в узкой полосе 0.52-0.60, и на глаз сдвиг
выдачи не читается вовсе.

Это НЕ гейт. В `make check` не входит, красным ничего не делает, запускается
руками, когда меняют индекс, модель, чанк или параметры ANN.

    python3 scripts/search-bench.py              # рабочий индекс, топ-10
    python3 scripts/search-bench.py --limit 50   # recall@50
    python3 scripts/search-bench.py --index jig_c3000 --hybrid

ЧТО ЧИТАТЬ В ВЫВОДЕ. Две метрики, и путать их дорого:
- precision@10 — сколько ответов доходит до глаз. Её чинит ранжирование.
- recall@50 — сколько ответов вообще нашлось. Её чинит корпус, чанк и ANN.
Разрыв между ними — ровно то, что покупается реранком (DS-355). Если обе
низкие, реранк не купит ничего: упорядочивать нечего.

РЕРАНК ЗАМЕРЕН И ОТКЛОНЁН (DS-355, 21.09.2026). `bge-reranker-v2-m3` на
CPU поверх топ-50, вход «путь + чанк»: precision@10 6/10 -> 6/10, файлов@10
7/10 -> 9/10, причём все три вытащенных кейса встали на 9-е и 10-е место по
файлам, то есть на самую границу. Цена — ~17 c на запрос против ~150 мс и 80 c
загрузки модели. Верх выдачи он правит честно (8 -> 1, 4 -> 1), но верх и так
доходил до глаз. Повторять замер стоит, только если изменится одно из двух:
появится GPU под кросс-энкодер или набор вырастет настолько, что ±1 кейс
перестанет быть третью всего эффекта.

ПЕРЕД ТЕМ КАК ВЕРИТЬ ПАДЕНИЮ: проверь, что ожидаемый файл вообще в индексе.
20.09.2026 половина промахов объяснялась тем, что `*.mjs` не индексировался
вовсе — поиск отвечал следующим по близости и выглядел просто неточным.

    select filename, count(*) from codeindex_<index>__<index>_chunks
     where filename = '<ожидаемый>' group by 1;

ВОПРОСЫ ЗАДАНЫ ПО-РУССКИ НАРОЧНО: так их задаёт агент, и на русском запросе
гибридный режим не включается сам (идентификатор не опознан), то есть работает
голый вектор. Это и есть рабочий случай, а не лабораторный.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time

# вопрос -> файл(ы), в которых лежит ответ. Путь проверяется на диске при
# запуске: вопрос с уехавшим файлом молча мерил бы отсутствие, а не качество.
#
# ФАЙЛОВ У ОТВЕТА БЫВАЕТ НЕСКОЛЬКО, и это не поблажка (DS-355). Выход
# поиска — «какие файлы читать», и попаданием считается файл, с которого
# читатель дойдёт до ответа. У вопроса про цвета категорий таких два:
# `tokens/tokens.css` объявляет сами значения, а `tokens/chartPalette.ts`
# объявляет контракт той же палитры и ПЕРВОЙ ЖЕ СТРОКОЙ называет tokens.css.
# Второй ответ назначен ПО СОДЕРЖАНИЮ ФАЙЛА, а не по выдаче, и метрику он не
# сдвинул: 21.09.2026 на русском вопросе нет в топ-50 НИ ОДНОГО из двух, ни
# голым вектором, ни с `--hybrid`. Оба находятся только запросом с
# идентификатором (`--ds-chart-1`) — этот кейс остаётся потолком набора, и
# реранк до него не дотянется. Третьего ответа «как у выдачи» сюда не
# дописывать: ожидание, подогнанное под топ-10, мерит само себя.
CASES: list[tuple[str, tuple[str, ...]]] = [
    ("где считается минимальный размер цели указателя", ("workbench/gate-predicates.ts",)),
    ("как отличить цель для клика от жеста перетаскивания", ("workbench/gate-predicates.ts",)),
    ("как замер решает, что по цели нельзя попасть", ("workbench/gate-predicates.ts",)),
    ("где объявлены цвета категорий для серий графиков",
     ("tokens/tokens.css", "tokens/chartPalette.ts")),
    ("где записано, какой цвет текста допустим на какой подложке", ("tokens/colourPairs.ts",)),
    ("как выпуск определяет, поднимать ли минорную версию", ("scripts/release.mjs",)),
    ("в каких файлах продублирована версия пакета", ("src/__guards__/doc-version.test.ts",)),
    ("как перетаскивание разделителя понимает, что дошло до края", ("src/components/Split/Split.tsx",)),
    ("почему у проверки верстака собственный headless-браузер", ("scripts/smoke-workbench.mjs",)),
    ("как стрелки переводят фокус между вкладками", ("src/internal/roving.ts",)),
]


def parse_results(raw: str) -> list[dict] | None:
    """Вырезать JSON из вывода CLI.

    CLI мешает в stdout логи LiteLLM, поэтому брать весь поток нельзя. Ответ
    приходит СПИСКОМ, а MCP-инструмент отдаёт объект с ключом results — обе
    формы живые, и код, знающий одну, тихо вернёт ноль попаданий на другой.
    """
    starts = [i for i in (raw.find("{"), raw.find("[")) if i >= 0]
    if not starts:
        return None
    try:
        d = json.loads(raw[min(starts):])
    except json.JSONDecodeError:
        return None
    rows = d if isinstance(d, list) else d.get("results", [])
    return rows if isinstance(rows, list) else []


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--index", default="jig")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--hybrid", action="store_true", help="включить RRF принудительно")
    ap.add_argument("--lang", default=None, help="фильтр языка, например tsx,ts")
    args = ap.parse_args()

    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    missing = sorted({f for _, fs in CASES for f in fs if not (root / f).is_file()})
    if missing:
        print("ОТКАЗ: ожидаемых файлов нет на диске — набор мерил бы отсутствие:")
        for f in missing:
            print(f"    {f}")
        return 2

    print(f"индекс {args.index}, limit {args.limit}"
          f"{', hybrid' if args.hybrid else ''}"
          f"{', lang ' + args.lang if args.lang else ''}")
    print("ранг\tфайл№\tскор\tожидалось\tвопрос")

    found = 0
    found_files = 0
    t0 = time.time()
    for question, expect in CASES:
        want = set(expect)
        cmd = ["uvx", "cocosearch", "search", question,
               "-n", args.index, "-l", str(args.limit), "--no-cache"]
        if args.hybrid:
            cmd.append("--hybrid")
        if args.lang:
            cmd += ["--lang", args.lang]
        out = subprocess.run(cmd, capture_output=True, text=True).stdout
        rows = parse_results(out)
        if rows is None:
            print(f"НЕТJSON\t-\t-\t{expect}\t{question}")
            continue
        rank, score, hit = "-", "-", ""
        seen: set[str] = set()
        for i, r in enumerate(rows, 1):
            got = r.get("file_path", r.get("filename", ""))
            seen.add(got)
            if got in want:
                rank, score, hit = str(i), f"{r.get('score', 0):.3f}", got
                found += 1
                # ранг ПО ФАЙЛАМ: выдача идёт чанками, и три чанка одного
                # guards.md над ответом — это один файл для читателя, а не три
                if len(seen) <= 10:
                    found_files += 1
                file_rank = len(seen)
                break
        else:
            file_rank = None
        # Печатается ТОТ файл, который нашёлся, а не первый из набора: иначе
        # вопрос с двумя ответами врал бы о том, какой из них дошёл до глаз.
        print(f"{rank}\t{file_rank or '-'}\t{score}\t{hit or '|'.join(expect)}\t{question}")

    metric = "precision@10" if args.limit <= 10 else f"recall@{args.limit}"
    print(f"\n{metric} = {found}/{len(CASES)}, {time.time() - t0:.0f} c")
    if args.limit > 10:
        # Только при широком входе: на limit 10 первые десять ФАЙЛОВ из десяти
        # чанков не набираются, и число совпало бы с precision@10 по построению.
        print(f"файлов@10 = {found_files}/{len(CASES)} — то же, но повторы файла "
              "в выдаче схлопнуты; разрыв с precision@10 закрывает dedup, а не реранк")
    print("время строки — это весь вызов вместе со стартом uvx (~3 c), "
          "а не цена поиска: БД отвечает за ~1 мс, эмбеддинг за ~150 мс")
    return 0


if __name__ == "__main__":
    sys.exit(main())
