# A green check is not yet a check

Pointer to this file is in CLAUDE.md, section Checks. Open it before writing a
test or a gate, and before believing a green one.

Eight ways to get a check that passes and does not check what it was written for.

1. Outside the gate's reach, such as a preview outside `tsconfig`. Cure by widening
   the reach, `tsconfig.previews.json`.
2. Aimed at an invented cause. Verify the claim itself before building a test on it.
3. An irrefutable claim. It cannot fail under any circumstances.
4. True but about the wrong thing, such as a test on a `ds-*` class name. Names
   change with fixes, role and name do not. Ask whose contract you are checking.
5. The sanity check is not on the thing that lies. Put it on what changes together
   with the defect, and print a neighbour whose value is known in advance. A lying
   tool gives itself away on that neighbour.
6. It goes red correctly and guards the defect. Red is not always "you broke it",
   sometimes it is "you fixed what the test took for normal". Assert that states
   are DISTINGUISHABLE, not each state on its own. Collapsed states pass separately.
7. Measured honestly, over the area it was HANDED. The number is right; the claim
   names a larger set than was inspected. "No lower than 5.2 on any of 228 hexes"
   was 228 hexes on ONE surface — 228 × 1, and the badge lives on three. Same class
   as 3.0.5, where target size was measured over previews rather than the system.
   Cure: name the area in the claim, and count the area in the check with a LITERAL.
   A count read off the same list that built the fixture agrees with itself and
   stays green when the area shrinks to one.
8. The property under test never applied at all. `var(--ds-no-such-name)` is not a
   parse error: the declaration is dropped when the value is computed, the element
   still renders, the console stays empty. With a fallback
   (`var(--ds-no-such, var(--ds-border))`) not even that shows — the spare paints,
   and the property the NAME promised is simply absent. Green measure, plausible
   picture, nothing there. Worse, the observable result can agree with the intent by
   coincidence: `gap={0}` looked correct only because nothing else set a gap.
   Cure: check the NAME exists, not the rendered outcome — `token-exists`.

An accessibility fix can CREATE a defect out of harmless code, by giving the
keyboard reach where it had none (`:hover` and `:focus-visible` with the same
background). After such a fix, check what you reached, not what you repaired: is
the focus ring distinguishable from hover.

Against all eight: break the thing the check was written for and confirm it goes red.
Mutate immediately, restoring the defect a week later is work. A surviving mutation
is sometimes dead code, not a hole in the check.

Mutate the bytes the check actually READS. `measure` loads `dist/src/styles.css`, so
a mutation of `src/styles/*.css` run through a bare `make measure` is compared against
the previous build and survives — indistinguishable from dead code, and it will be
written down as such. `make check` builds before it measures, so the edit loop is
safe; a mutation checked on its own is not. Build first, or read the mutated line back
out of `dist/` before believing the green. Cost a wrong conclusion on DS-114.

Второй случай того же — гейт, который читает `dist/` в шаге, идущем ДО сборки. Здесь
порядок не спасает, а именно он и есть дефект: `make release` бампит пять версионных
файлов и сразу зовёт `check-full`, где guards идут первыми, и утверждение «версия
доехала до сборки» краснеет на артефакте ПРОШЛОЙ версии — то есть отвечает «не
доехала» там, где она не доехала ЕЩЁ. Ответ выглядит дефектом кода, а является
порядком шагов, и `skipIf(!existsSync(dist))` его не закрывает: артефакт есть, он
протух. Утверждение о собранном пакете живёт в шаге ПОСЛЕ `build` — `make
dist-version`, гейт порядка `dist-freshness` (DS-238).
