# mockatoo

**English** · [한국어](README.ko.md)

Lightweight mock API server backed by JSON files, with an admin UI.

> **mock** + **cockatoo** — like a cockatoo, it repeats back whatever responses you teach it.

![mockatoo admin](docs/screenshots/01-overview.png)

## Getting started

```sh
pnpm install
pnpm dev
```

```sh
curl localhost:4000/users/1
# {"id":"1","name":"Kyle Hills","email":"Kyle.Hills@yahoo.com"}

curl localhost:4000/users/0
# 404 {"error":"not found"}
```

Admin UI: [http://localhost:4000/__admin/](http://localhost:4000/__admin/)

## Features

- Easy route editing: edit in the admin UI, save, applied instantly. Editing the file by hand reloads too
- Multiple responses per route: pick a response by rules
- Simulate response delay (ms), custom headers, CORS
- Response templates: `{{urlParam "id"}}`, `{{queryParam "q"}}`, `{{header "x"}}`, `{{body.field}}`, `{{faker "person.fullName"}}`
- Regex paths: `/users/:id`, `/files/*`, `/v[12]/users`
- Auto-generate collections: OpenAPI 3 / Swagger 2 → collection (URL, file or paste)
- Auto-generate routes: call a real API and save its response as a route
- Separate routes per collection: each collection gets a prefix, many collections on one port

## Usage

```sh
mockatoo start                                  # serve data/*.json on :4000
mockatoo start -d ./mocks -p 5000
mockatoo start ./api.mock.json                  # single file
mockatoo start https://host/openapi.json -n api # create data/api.json from OpenAPI if missing

mockatoo import https://host/openapi.json -d data -n api
mockatoo import ./openapi.yaml -o api.mock.json
```

| Option                | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `-d, --data <dir>`    | Collections directory. Default `./data`                            |
| `-n, --name <name>`   | Collection (file) name                                             |
| `-p, --port <port>`   | Default `4000`                                                     |
| `-H, --header <h...>` | Headers for fetching the OpenAPI URL. `"Authorization: Bearer x"` |
| `--no-admin`          | Disable admin UI                                                   |
| `--no-watch`          | Disable file watching                                              |

Before building, `pnpm tsx src/cli/index.ts` stands in for `mockatoo`.

## Admin UI

### Routes

Pick a route in the left tree. Folders and drag ordering are for display only and do not affect routing.

### Responses

A route can have several responses. The **first response whose rules all match** is used; otherwise the **first response with no rules**.

![rules](docs/screenshots/02-rules.png)

### Templates

Use `{{ }}` inside the body. The `＋ Template` menu is searchable. For faker, any `module.fn` from [fakerjs.dev/api](https://fakerjs.dev/api/) works.

![templates](docs/screenshots/03-template.png)

### Import

`＋ New collection` → OpenAPI URL or paste the document.

![import openapi](docs/screenshots/04-new-collection.png)

`＋ Route ▾` → `Create from API`. The server makes the call, so CORS is not an issue.

![import from api](docs/screenshots/06-import-from-api.png)

## Collection file

```json
{
  "name": "demo",
  "prefix": "/demo",
  "routes": [
    {
      "method": "GET",
      "path": "/users/:id",
      "responses": [
        {
          "status": 404,
          "body": { "error": "not found" },
          "rules": [{ "target": "params", "key": "id", "equals": "0" }]
        },
        {
          "status": 200,
          "latencyMs": 100,
          "body": { "id": "{{urlParam \"id\"}}", "name": "{{faker \"person.fullName\"}}" }
        }
      ]
    }
  ]
}
```

- `prefix` — path prepended to every route in the collection. Empty means root. Must be unique across collections; only one collection may be at root
- `rules[].target` — `params` | `query` | `header` | `body`
- `folders`, `folderId`, `description` — admin display only

## Admin API

|                                                 |                                           |
| ----------------------------------------------- | ----------------------------------------- |
| `GET /__admin/api/status`                       | Collections being served                  |
| `GET /__admin/api/collections`                  | List                                      |
| `GET/PUT/DELETE /__admin/api/collections/:name` | Read / save / delete                      |
| `POST /__admin/api/import`                      | `{ url \| text, name, headers?, prefix? }` |
| `POST /__admin/api/probe`                       | `{ method?, url, headers?, body? }`       |

## Docker

```sh
docker build -t mockatoo .
docker run -p 4000:4000 -v $PWD/data:/app/data mockatoo
```

## Development

```sh
pnpm dev        # server
pnpm dev:web    # admin, http://localhost:5173/__admin/
pnpm test
pnpm build
```

## License

MIT
