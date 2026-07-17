# Chat App

A small React chat client (bootstrapped with [Create React App](https://github.com/facebook/create-react-app))
plus an Express server that proxies streaming completions to the OpenAI API.

## Setup

`npm install` — installs all NPM packages.

## Available Scripts

### `npm start`

Runs the client app in development mode at [http://localhost:3000](http://localhost:3000).\
The page reloads on edits, and lint errors show in the console.

### `npm run server`

Runs the Express server in development mode; it auto-restarts on changes under `server/`.\
Health check: [http://localhost:8080/health](http://localhost:8080/health).

### `npm run build`

Builds the client app for production into the `build/` folder.

### `npm test`

Launches the test runner in interactive watch mode.\
See [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.
