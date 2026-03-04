# LoadForge VS Code Extension

A VS Code extension for the [LoadForge](https://github.com/BulatovicBalsa/loadforge) load testing framework. Write, run, and monitor load tests directly from your editor using the LoadForge DSL (`.lf` files).

## Features

### Syntax Highlighting

Full syntax highlighting for `.lf` files, covering:

- Keywords (`test`, `scenario`, `environment`, `target`, `auth`, `load`, `metrics`, `variables`, `request`, `expect`, ...)
- HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, ...)
- String interpolation (`${varName}`)
- Variable references (`#refName`)
- JSONPath expressions (`$.field.nested`)
- Duration literals (`30s`, `5m`, `1h`)
- `env()` calls
- `//`, `#`, and `/* */` comments

### Language Support

- File association: `.lf` files are automatically recognized as `LoadForge DSL`
- Custom file icon (beaker) for `.lf` files in the explorer
- Auto-closing pairs for `{}`, `[]`, `()`, and `""`
- Bracket matching

### Code Snippets

Three built-in snippets to speed up authoring:

| Prefix | What it inserts |
|--------|----------------|
| `scenario` | A `scenario` block with a `request` and `expect status` |
| `load` | A `load` block with `users`, `rampUp`, and `duration` |
| `auth` | A full `auth login` block with `endpoint`, `method`, `body`, and `format` |

### Run Load Tests

Run a load test against a `.lf` file without leaving VS Code:

- **`F5`** while a `.lf` file is focused — runs that file
- **Right-click** a `.lf` file in the Explorer → **Run Load Test**
- **Editor title bar** play button (▶) when a `.lf` file is active
- **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`) → `Run Load Test`

Before running, the extension:
1. Saves all open `.lf` files automatically.
2. Scans the workspace for `.env` files.
3. If only one `.env` file is found, it is used automatically.
4. If multiple `.env` files exist, a quick-pick prompt lets you choose which one to pass to the runtime.

### Stop a Running Test

Stop an in-progress test at any time:

- **`F5`** while a test is running
- **Stop button (⏹)** in the editor title bar
- **Command Palette** → `Stop Load Test`

The extension first sends a cooperative `STOP` signal via stdin. If the process does not exit within 7 seconds, it is forcefully killed (`SIGKILL` on POSIX, `taskkill` on Windows).

### Integrated Output Panel

Test output is streamed in real time into a dedicated **LoadForge** panel at the bottom of the VS Code window. The panel:

- Renders full ANSI color sequences (colors, bold, etc.) from the runtime's output
- Auto-scrolls to the latest output
- Is cleared and re-populated on each new test run

## Requirements

The extension bundles the LoadForge runtime binary for both Linux and Windows (`bin/loadforge` and `bin/loadforge.exe`). No separate installation of the LoadForge CLI is required.

A `.env` file in your workspace is needed whenever your `.lf` file references `env("KEY")` values (e.g. `BASE_URL`, `TOKEN`). The extension will warn you if no `.env` file is found.

## Usage

### 1. Open a workspace folder in VS Code

The extension requires an open workspace folder to locate `.env` files.

### 2. Create a `.lf` file

```vscode-loadforge/README.md#L1-1
test "My API smoke test" {
  environment {
    baseUrl = env("BASE_URL")
  }

  target #baseUrl

  scenario "health check" {
    request GET "/health"
    expect status 200
  }
}
```

### 3. Add a `.env` file

Create a `.env` file at the root of your workspace (or anywhere inside it):

```vscode-loadforge/README.md#L1-1
BASE_URL=https://api.example.com
TOKEN=my-secret-token
```

### 4. Run the test

Press **`F5`** or click the ▶ button in the editor title bar. The LoadForge panel will open and stream results as the test executes.

## DSL Quick Reference

For the full DSL documentation see the [LoadForge project README](https://github.com/BulatovicBalsa/loadforge).

### Basic structure

```vscode-loadforge/README.md#L1-1
test "name" {
  environment { ... }   // reads from .env file via env("KEY")
  target #baseUrl       // base URL for all requests

  variables {           // local DSL variables
    q = "phone"
  }

  auth login {          // optional: fetches a Bearer token before load
    endpoint "/auth/login"
    method POST
    body {
      username = "admin"
      password = "secret"
    }
    format "$.access_token"
  }

  scenario "name" {
    request GET "/search?q=${q}"
    expect status 200
    expect json $.results isArray
    expect json $.results notEmpty
  }

  load {
    users 50
    rampUp 30s
    duration 5m
  }

  metrics {
    p95 < 250ms
    errorRate < 1%
  }
}
```

### `expect json` check types

| Check | Description |
|-------|-------------|
| `isArray` | Value is a JSON array |
| `notEmpty` / `isEmpty` | Array or string is not/is empty |
| `isNull` / `notNull` | Value is/is not null |
| `isObject` | Value is a JSON object |
| `isString` | Value is a string |
| `isNumber` | Value is a number |
| `isBool` | Value is a boolean |
| `equals <value\|#ref>` | Value equals the given literal or variable |
| `hasSize <number>` | Array or string has the given length |
| `contains <value\|#ref>` | String or array contains the given value |
| `matches <regex\|#ref>` | String matches the given regular expression |

### `metrics` threshold fields

| Field | Example |
|-------|---------|
| `p50` | `p50 < 100ms` |
| `p95` | `p95 < 250ms` |
| `p99` | `p99 < 500ms` |
| `errorRate` | `errorRate < 1%` |
| `rps` | `rps > 100` |

## Commands

| Command | Default keybinding | When visible |
|---------|--------------------|--------------|
| `Run Load Test` | `F5` | `.lf` file is active and no test is running |
| `Stop Load Test` | `F5` | A test is currently running |

## Extension Architecture

```vscode-loadforge/README.md#L1-1
src/
  extension.ts            // activation: registers commands and webview provider
  loadforgePanel.ts       // WebviewViewProvider — ANSI-aware output panel
  commands/
    run-load-test.ts      // spawns the bundled binary, handles stop logic
    running-context.ts    // tracks isRunning state via VS Code context key

bin/
  loadforge               // bundled Linux binary
  loadforge.exe           // bundled Windows binary

syntaxes/
  lf-dsl.tmLanguage.json  // TextMate grammar for syntax highlighting

snippets/
  snippets.json           // scenario / load / auth snippets

language-configuration.json  // bracket matching and auto-closing pairs
```

## Contributing

1. Clone the repository and open `vscode-loadforge` in VS Code.
2. Run `npm install`.
3. Press `F5` to launch an Extension Development Host with the extension loaded.
4. Make changes in `src/` — reload the development window with `Ctrl+R` / `Cmd+R` to pick up changes.

To produce a `.vsix` package for distribution:

```vscode-loadforge/README.md#L1-1
npm install -g @vscode/vsce
npm run compile
vsce package
```

Install the resulting file with:

```vscode-loadforge/README.md#L1-1
code --install-extension loadforge-0.0.1.vsix
```

## Related

- [LoadForge runtime / DSL](https://github.com/BulatovicBalsa/load-forge) — the Python project that defines the grammar, parser, and execution engine.
