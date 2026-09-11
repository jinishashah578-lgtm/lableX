# Running Label-X on Windows

Everything here works on Windows 10 and 11. The project itself is
platform-neutral; what differs is how you install the tools, how you set
environment variables, and which launch script you run.

Commands below are **PowerShell**. Open it from the Start menu, or use the
terminal built into VS Code. Where Command Prompt differs, that is called out.

---

## 1. Install the tools

### uv

uv manages the Python side, and installs the right Python itself, so you do not
need Python beforehand.

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**Close the terminal and open a new one** afterwards, so `PATH` picks up `uv`.
Check it:

```powershell
uv --version
```

### Node.js

Download the LTS installer from [nodejs.org](https://nodejs.org) and run it.
Leave "Add to PATH" ticked. Then, in a new terminal:

```powershell
node --version
npm --version
```

---

## 2. Get the project running

From the folder containing `backend` and `frontend`:

```powershell
.\start.ps1
```

That installs both dependency sets and starts the API on port 8000 and the app
on port 5173. Open **http://localhost:5173**. Press Ctrl-C to stop both.

### If PowerShell refuses to run the script

Windows blocks local scripts by default. The message mentions "running scripts
is disabled on this system". Allow scripts for your own account:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Answer `Y`. This applies to you only, not the whole machine. Then run
`.\start.ps1` again.

### Or start the two halves yourself

Use two terminals. First:

```powershell
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

Second:

```powershell
cd frontend
npm install
npm run dev
```

---

## 3. Set the API key

The label reader needs an [OpenRouter](https://openrouter.ai/keys) key. How you
set it depends on the shell, and this is the most common thing to get wrong.

**PowerShell**, for this terminal only:

```powershell
$env:OPENROUTER_API_KEY = "sk-or-v1-..."
```

**Command Prompt**, for this terminal only:

```cmd
set OPENROUTER_API_KEY=sk-or-v1-...
```

To keep it across restarts, set it permanently and then **open a new terminal**:

```powershell
setx OPENROUTER_API_KEY "sk-or-v1-..."
```

`setx` does not affect the terminal you type it in — only ones opened
afterwards. That catches people out.

Three traps to avoid:

- **Do not include the variable name in the value.** `setx OPENROUTER_API_KEY
  "OPENROUTER_API_KEY=sk-or-..."` sends a malformed token and OpenRouter answers
  401. The app detects this and says so.
- **Do not wrap the value in extra quotes** inside the quotes.
- `setx` truncates values over 1024 characters. An API key is far shorter, so
  this will not bite here.

Confirm the app can see it:

```powershell
curl http://localhost:8000/api/health
```

`active_extractor` should read `openrouter`.

### Choosing a model

```powershell
$env:LABELX_MODEL = "google/gemini-3.8-flash"     # faster and cheaper
```

The default is `anthropic/claude-sonnet-5`. See the main README for the full
list and prices.

---

## 4. Optional: local OCR with Tesseract

Tesseract is the fallback reader for when no API key is set. It is optional.

1. Download the installer from
   [UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki) — it is the
   maintained Windows build.
2. During setup, open **Additional language data** and tick **Hindi** if you
   need Devanagari labels.
3. It installs to `C:\Program Files\Tesseract-OCR` and **does not add itself to
   PATH**.

The app looks in that folder automatically, so usually nothing more is needed.
If you installed it somewhere else, point at it:

```powershell
$env:TESSERACT_CMD = "D:\Tools\Tesseract-OCR\tesseract.exe"
```

Check what the server found:

```powershell
curl http://localhost:8000/api/health
```

`tesseract` should show `"available": true`.

---

## 5. Using the camera

The live viewfinder works on `http://localhost:5173` in Chrome or Edge, using
your laptop webcam. Where there is more than one camera, a **Switch** button
appears.

Browsers only expose a camera on a secure origin. `localhost` counts; a LAN
address like `http://192.168.1.20:5173` does not. To use a phone camera against
this machine, serve the app over HTTPS:

```powershell
cd frontend
npm run dev:https
```

Then open the `https://` address Vite prints. The certificate is self-signed, so
the browser warns once — accept it.

Either way, **Take photo** always works. It opens the device's own camera app
and needs no permission or secure connection.

### Letting a phone reach your PC

Windows Firewall blocks incoming connections to Node by default. The first time
you run the dev server, Windows asks — tick **Private networks** and allow it.
If you dismissed that prompt, allow it manually from an **administrator**
PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Label-X dev server" -Direction Inbound `
  -LocalPort 5173 -Protocol TCP -Action Allow -Profile Private
```

Find the address to open on the phone with `ipconfig`, under "IPv4 Address".

---

## 6. Development commands

Run these from the `backend` folder:

| Command | What it does |
|---|---|
| `uv run pytest -q` | Run the tests |
| `uv sync` | Match the environment to the lockfile |
| `uv add <package>` | Add a dependency and update the lockfile |

And from `frontend`:

| Command | What it does |
|---|---|
| `npm run dev` | Start the web app |
| `npm run dev:https` | Start it over HTTPS, for phone camera access |
| `npm run build` | Type-check and build for production |

---

## 7. When something goes wrong

| Symptom | Cause and fix |
|---|---|
| `uv` or `npm` "is not recognized" | The installer updated `PATH` but this terminal predates it. Open a new terminal. |
| "running scripts is disabled on this system" | Run the `Set-ExecutionPolicy` command in section 2. |
| `OPENROUTER_API_KEY` set but the app says it is not | You used `setx` and did not open a new terminal, or you set it in a different terminal from the one running the server. |
| OpenRouter answers 401 | The value carries the variable name or stray quotes. Re-set it as the key alone. |
| Port 8000 or 5173 already in use | Find it with `netstat -ano \| findstr :8000`, then `taskkill /PID <pid> /F`. |
| Camera button does nothing | You are on a LAN address over HTTP. Use `localhost`, run `npm run dev:https`, or use "Take photo". |
| Scans return obviously fake data | No reader is configured, so the demo sample is being returned. Set the API key, or install Tesseract. |
| A scan takes 30 seconds or more | That is the model reading the image. The console logs each stage. Switch to a faster model with `LABELX_MODEL`. |

### Line endings

If you use Git on Windows, it may convert line endings on checkout. That is
harmless for the Python and TypeScript here. Should `start.sh` ever be needed
under Git Bash or WSL and fail with `bad interpreter`, normalise it:

```powershell
git config core.autocrlf input
```

---

## Windows Subsystem for Linux

WSL works too, and the main [README](README.md) applies unchanged inside it —
use `./start.sh` there. Two things to know:

- The app is reached at `http://localhost:5173` from Windows as usual.
- The **live camera does not work through WSL**, because the browser is on
  Windows and treats the forwarded address as insecure. Use "Take photo", or run
  natively on Windows as described above.
