# Chat App

A small React chat client built with [Vite](https://vite.dev/), plus an Express server that
proxies streaming completions to the OpenAI API.

## Setup

Use Node **22.22.2+ (22.x)**, **24.15.0+ (24.x)**, or **26.x**, with npm **10+**.
Node 24 LTS is recommended; `.nvmrc` selects it. Older Node releases and odd-numbered
releases are not supported by this project's dependency set.

```sh
nvm install
nvm use
npm install
```

Start the server with your own OpenAI API key in the environment:

```sh
export OPENAI_API_KEY="your-openai-api-key"
npm run server
```

The server defaults to [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
which supports text and image inputs. Set
`OPENAI_MODEL` before starting the server to use another Chat Completions model available
to your API project. The client uses this server setting. Requests use the model's default
temperature and output limit; OpenAI validates the model's context limit.

Run `npm start` in a second terminal, then open [http://localhost:3000](http://localhost:3000).

## Interview exercise

`useChat()` exposes `reset()` for a Reset button. It cancels the active response, clears
conversation history and draft images, and restores the greeting. The interviewee can wire
the button in `Chat.tsx` and clear its local composer state as part of the exercise.

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
