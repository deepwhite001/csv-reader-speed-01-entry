# csv-reader-speed-01-entry

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/deepwhite001/csv-reader-speed-01-entry/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/deepwhite001/csv-reader-speed-01-entry/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast, dependency-free reader for broken CSV that returns exactly what
csv-reader 1.0.0 returns for the same input: `{columns, rows, errors}`.
One left-to-right pass: unquoted fields are cut out with a single slice
each, quoted fields jump from quote to quote with `indexOf`, and line
breaks inside quotes are counted only where they occur. On the practice
set it answers all 6 cases identically to the reference, several times
faster than the house baseline.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out MAKEFUN_INPUT_DIR=<cases dir> node main.ts
```

`main.ts` reads `/input/cases.json` (or `MAKEFUN_INPUT_DIR`), answers each
case with `run()` from `solve.js`, and writes `/output/answers.json`
(or `MAKEFUN_OUTPUT_DIR`).

---

<sub>Entered on [make.fun](https://make.fun/bounty/csv-reader-speed-01-run-20261121)</sub>
