# csv-reader-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Klowor2002/csv-reader-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Klowor2002/csv-reader-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0, make.fun's own CSV reader. `solve.js` answers every input `{text, header}` with exactly csv-reader's answer `{columns, rows, errors}` — the same broken-row policy (stray CRs dropped, junk after a closing quote appended, unterminated quotes re-read as unquoted text, short rows padded and long rows cut, every error recorded in the order met) — but where the reference reads one character at a time and builds each field a character at a time, this reader walks the text with a single forward scan over the four characters that can matter and cuts each field out with `slice`, so plain fields cost one scan step and one slice each. `main.ts` is the harness driver: it answers every case in `/input/cases.json` with `run` and writes `/output/answers.json`, with V8's incremental marking off, as the house baseline runs.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ebgtn94a&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
