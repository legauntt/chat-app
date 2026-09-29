# Chat App

A small React chat client built with [Vite](https://vite.dev/), plus an Express server that
proxies streaming completions to the OpenAI API.

## Setup

Use Node **22.22.2+ (22.x)**, **24.15.0+ (24.x)**, or **26.x**, with npm **10+**.
Node 24 LTS is recommended. Install Node.js and npm if needed, then check your versions
and install the project dependencies:

```sh
node --version
npm --version
npm install
```

Start the server:

```sh
npm run server
```

Run `npm start` in a second terminal, then open [http://localhost:3000](http://localhost:3000).

## Available Scripts

### `npm start`

Runs the client app in development mode at [http://localhost:3000](http://localhost:3000).\
The page reloads on edits.

### `npm run server`

Runs the Express server in development mode; it auto-restarts on changes under `server/`.\
Health check: [http://localhost:8080/health](http://localhost:8080/health).

### `npm run build`

Builds the client app for production into the `build/` folder.

### `npm test`

Launches the Vitest test runner in interactive watch mode.

Use `npm test -- --run` for a single test run and `npm run typecheck` to check TypeScript.
