# gitgrep frontend

React + Vite search UI for gitgrep. It calls the backend API at `http://localhost:5050`.

```sh
npm ci
npm run dev    # http://localhost:5173
npm run build  # production build in dist/
npm run lint
```

The usual way to run it is with the whole stack (`make up` from the repository root); see the [main README](../README.md).

`src/components/ui/button.jsx` and `input.jsx` are from [shadcn/ui](https://ui.shadcn.com) (MIT).
