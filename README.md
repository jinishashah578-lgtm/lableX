# Label-X

A web app that checks Indian packaged-commodity labels for compliance. You
photograph the front of a pack on your phone, the server reads the printed
declarations, and the app tells you which rules the label meets and which it
breaks.

The rules come from the **Legal Metrology (Packaged Commodities) Rules, 2011**
— the reference guide attached to Problem Statement 26034.

---

## What it checks

Each check maps one rule to a condition that can be tested against a photo.

| Rule | What is checked |
|---|---|
| 3, 25, 26 | Whether the Rules apply at all: pack size, industrial supply, exemptions |
| 5 | Pack size against the Second Schedule list of permitted sizes |
| 6 | The six mandatory declarations: party, commodity name, net quantity, date, price, consumer care |
| 7 | Printed character height in millimetres against the size bands |
| 8 | Declarations grouped on the display panel, with clear space around the quantity |
| 9 | Contrast of the price and quantity; Hindi or English; outer wrapper |
| 10 | Whether the address is complete enough to trace the party |
| 11 | The "when packed" qualifier, allowed only for Third Schedule goods |
| 12 | Unit matches the commodity; no vague words like "approximately" |
| 13 | Correct SI sub-unit; no "dozen" or "gross"; "N" or "U" for counted goods |
| 22 | Measured shortfall against the First Schedule permissible error |
| 24 | The shorter declaration set for wholesale packs |
| 32 | The fine attaching to each contravened rule |

A check returns one of five outcomes. **`indeterminate` is the important one**:
it means the photo could not answer the question, which is different from the
label being wrong. Print size, for example, cannot be judged without knowing how
wide the pack really is.

---

## Running it

You need [uv](https://docs.astral.sh/uv/) and Node 18 or newer. uv installs the
right Python itself, so you do not need one already set up.

**On Windows, follow [WINDOWS.md](WINDOWS.md) instead** — the installers, the way
environment variables are set, and the launch script all differ.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # if you do not have uv
```

### Everything at once

```bash
./start.sh          # macOS and Linux
```
```powershell
.\start.ps1         # Windows — see WINDOWS.md
```

That syncs both dependency sets and starts the API on port 8000 and the app on
port 5173. Open http://localhost:5173.

### Or one at a time

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

`uv run` creates the virtual environment and installs from `uv.lock` on first
use, so there is no separate install step.

### Working on the backend

| Command | What it does |
|---|---|
| `uv run pytest -q` | Run the tests |
| `uv sync` | Match the environment to the lockfile |
| `uv add <package>` | Add a dependency and update the lockfile |
| `uv add --dev <package>` | Add a development-only dependency |
| `uv lock --upgrade` | Re-resolve everything to the newest allowed versions |

`uv.lock` pins every transitive dependency and is committed, so the environment
is identical on every machine. Edit `pyproject.toml` for version ranges; let uv
write the lockfile.

---

## Reading the label

The server picks the best reader available and names it in the report, so a
result is never mistaken for something it is not.

| Reader | How to enable it | What it gives you |
|---|---|---|
| **OpenRouter** | `export OPENROUTER_API_KEY=...` | Best accuracy. Finds the display panel, estimates print size, reads Hindi and English. |
| **Tesseract OCR** | `brew install tesseract tesseract-lang` (macOS), `apt-get install tesseract-ocr tesseract-ocr-hin` (Linux), or the [UB Mannheim installer](https://github.com/UB-Mannheim/tesseract/wiki) (Windows) | Runs locally with no key. Real character boxes, but no panel detection. |
| **Demo** | Always available | Fixed sample data. Lets you click through the app before setting anything up. |

Check which one is active, and which model it will use:

```bash
curl localhost:8000/api/health
```

### Choosing a model

[OpenRouter](https://openrouter.ai) is a gateway that speaks the OpenAI
chat-completions protocol in front of many providers, so one key reaches all of
them. Any model that accepts images and supports structured outputs works here.

The default is `anthropic/claude-sonnet-5`. Reading small, low-contrast print off
a curved pack is the part this job turns on, so accuracy is worth more here than
the difference in token price. Change it with `LABELX_MODEL`:

```bash
export OPENROUTER_API_KEY=sk-or-...
export LABELX_MODEL=google/gemini-3.8-flash   # cheaper
```

| Model | Input / output per million tokens | When to use it |
|---|---|---|
| `google/gemini-3.1-flash-lite` | $0.25 / $1.50 | High scan volume, clear labels |
| `google/gemini-3.8-flash` | $0.75 / $3.75 | A cheaper general-purpose reader |
| `anthropic/claude-sonnet-5` *(default)* | $2.00 / $10.00 | Faint print, angled photos, dense panels |
| `google/gemini-3.1-pro-preview` | $2.00 / $12.00 | Hardest labels |

One scan sends a single image, scaled so its long edge is 1568 pixels — vision
models resize anything larger themselves, so more pixels would cost upload time
and buy nothing. Local OCR gets the full 2000 pixels, because it reads small
print better with them.

Most of a scan's time goes on the model *writing* its reply rather than reading
the picture, so the request asks for a narrow `blocks` list: the declaration
lines, plus any text close to the net-quantity line, which is all the rules
actually inspect. Ingredient lists, nutrition tables and marketing copy still
appear in `raw_text` but are left out of `blocks`.

### If a scan is slow

The console prints a timing for every stage, so you can see where it went. A
model read is normally 5 to 40 seconds. To cut it, use a faster model:

```bash
export LABELX_MODEL=google/gemini-3.8-flash        # roughly half the latency
export LABELX_MODEL=google/gemini-3.1-flash-lite   # faster still
```

### Making the schema stick

OpenRouter routes each request to whichever provider is available, and **silently
drops any parameter that provider does not support**. A request asking for a JSON
schema can therefore be answered by a provider that ignores it, and the model
then replies in whatever shape it likes.

The reader sends `provider: {require_parameters: true}` to constrain routing to
providers that honour the schema. Three things back that up:

1. The system prompt names the required fields, so the contract survives even
   where the schema does not.
2. If no provider supports schemas for the chosen model, the reader falls back to
   plain JSON mode rather than failing.
3. Replies that deviate harmlessly are corrected in place. Requiring every field
   leaves a model nothing to put in an empty one, so it sends `null` where a list
   or a boolean is expected, and often sends a single note as a bare string.
   Each has one obvious reading, so it is converted rather than re-requested.
4. If a reply still does not match, the reader shows the model its own output and
   the validation error, and asks once more. That costs one extra call instead of
   a failed scan.

A reading that finds nothing at all is refused rather than scored. An unreadable
photo would otherwise produce a report saying every declaration is missing, which
reads as a damning verdict on the label when it is really a failure to read the
picture.

### When a scan fails

OpenRouter does not always signal a failure with an HTTP error. A refused image,
a rate limit, or a model with no available provider can arrive as a normal 200
response carrying an `error` object and no result. The reader reads that error
out and reports it, so a failed scan names the provider and the reason rather
than saying the reply was empty.

Every scan is logged to the console with a line per stage, including one before
the model call starts and the time it took:

```
14:22:31  INFO    [a1b2c3d4e5f6] scan started      1.3 MB upload, reader openrouter (anthropic/claude-sonnet-5)
14:22:31  INFO    [a1b2c3d4e5f6] normalise image    0.14s
14:22:31  INFO    [a1b2c3d4e5f6] reading label     openrouter via anthropic/claude-sonnet-5, 91 KB image — a model read usually takes 5-40s
14:22:49  INFO      openrouter replied in 17.82s
14:22:49  INFO    [a1b2c3d4e5f6] read label        17.90s
14:22:49  INFO    [a1b2c3d4e5f6] done              18.10s total — non_compliant, score 84, 3 violation(s)
```

Other settings:

| Variable | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Required to use the OpenRouter reader |
| `LABELX_MODEL` | `anthropic/claude-sonnet-5` | Which model reads the label |
| `LABELX_TIMEOUT` | `90` | Seconds to wait for the model before giving up |
| `LABELX_LOG_LEVEL` | `INFO` | Console detail for the scan pipeline |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Point at a proxy or a mock |
| `LABELX_MAX_IMAGE_MB` | `12` | Upload size limit |
| `LABELX_DATA_DIR` | `backend/data` | Where scans and photos are stored |
| `TESSERACT_CMD` | found automatically | Path to `tesseract` when it is not on `PATH` |

---

## Using the camera

There are two ways to get a photo, and the app offers both on every device.

**Open camera** shows a live viewfinder with a framing guide, and works on a
laptop webcam as well as a phone. Where a device has more than one camera, a
**Switch** button and a camera list appear, so you can move between a laptop's
built-in and external webcams, or a phone's front and back.

**Take photo** hands off to the device's own camera app. It needs no permission
and no secure connection, so it always works.

### Why the live camera sometimes will not open

Browsers only expose the camera on a secure origin. `http://localhost` counts as
one. A LAN address like `http://192.168.29.89:5173` does not, so the camera API
is not merely blocked there — it is absent.

| Where you opened the app | Live camera |
|---|---|
| `http://localhost:5173` on this computer | Works |
| `http://192.168.29.89:5173` from a phone | Not available — use "Take photo", or serve over HTTPS |
| `https://192.168.29.89:5173` from a phone | Works |

To use the live camera from a phone, start the web app with HTTPS:

```bash
cd frontend
npm run dev:https
```

Then open the `https://` Network address Vite prints. The certificate is
self-signed, so the browser warns once — accept it and the camera works.

The app tells you which of these situations you are in rather than failing
silently. Other cases it names: permission denied, no camera attached, and a
camera already in use by another app such as a video call.

---

## Two answers that change the result

**Pack width in millimetres.** Rule 7 is written in millimetres, but a photo
only has pixels. Entering the real width of the face you photographed lets the
server convert one to the other. Leave it blank and the print-size checks report
`indeterminate` rather than guessing.

**The exemption flags.** A pack marked as institutional supply, fast food, or a
price-controlled drug falls outside the Rules. The report then reads
`exempt` — not `compliant`, because nothing was judged.

Both can be changed after a scan. "Re-check with these answers" re-runs the
rules on the stored reading without another photo.

---

## Layout

```
README.md                Setup, rules and API
WINDOWS.md               Running it on Windows
start.sh / start.ps1     Start both halves at once
backend/
  pyproject.toml         Dependencies and project metadata
  uv.lock                Pinned versions, committed
  app/
    main.py              HTTP routes
    models.py            Shared schemas
    storage.py           SQLite scan repository
    extraction/
      registry.py        Picks the reader
      openrouter.py      OpenRouter vision reader
      ocr.py             Tesseract reader
      demo.py            Fixed sample
      text_parser.py     Turns raw text into declarations
    rules/
      reference.py       The schedules and rule tables
      checks.py          One function per rule
      engine.py          Scope, scoring, penalties
  tests/
    test_rules.py      40 tests over the rule logic
    test_openrouter.py 19 tests over the reader, with no network call
frontend/
  src/
    App.tsx              Shell and scan flow
    api.ts               API client
    components/          Camera, context form, report, repository
```

---

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Which readers are available |
| `GET` | `/api/reference` | Commodity list and rule tables for the forms |
| `POST` | `/api/scan` | Upload a photo, get a report |
| `POST` | `/api/scans/{id}/reevaluate` | Re-run the rules with corrected context |
| `GET` | `/api/scans` | Past scans |
| `GET` | `/api/scans/{id}` | One stored report |
| `GET` | `/api/scans/{id}/image` | The stored photo |
| `GET` | `/api/stats` | Totals and the most common violations |

```bash
curl -X POST localhost:8000/api/scan \
  -F "image=@pack.jpg" \
  -F 'options={"context":{"commodity_category":"edible_oil","geometry":{"label_width_mm":80}}}'
```

Interactive docs are at http://localhost:8000/docs.

---

## Tests

```bash
cd backend && uv run pytest -q
```

The tests build labels in memory, so they exercise the rule logic without
depending on OCR quality or a network call.

---

## Scope

This is a decision-support tool, not a legal determination. It paraphrases the
Rules and its schedule figures are transcribed by hand. The Rules have been
amended several times since 2011. Verify the exact wording and current
amendments against the Gazette notification before issuing any notice.

Two known limits:

- Panel detection needs the OpenRouter reader. In OCR mode the whole image is
  treated as the display panel, so the Rule 8 placement check is weaker.
- One photo shows one face. A pack whose declarations are split across faces
  needs a scan of each.
