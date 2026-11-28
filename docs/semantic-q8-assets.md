# Browser Q8 assets: packaging and delivery

This covers how the browser Q8 producer's files are pinned, staged, built and
served. The producer's lifecycle and the search feature are in
[`plans/browser-q8-saved-passages.md`](plans/browser-q8-saved-passages.md).

Everything is same-origin under `/semantic/q8/v1/` (the paths are
`src/lib/semantic-q8/assets.ts`):

| Path                                            | What                                                     | Delivered by                |
| ----------------------------------------------- | -------------------------------------------------------- | --------------------------- |
| `producer/semantic.js`                          | Theorem's browser producer, byte-identical, 29,563 B     | public asset                |
| `transformers/transformers.js`                  | `@huggingface/transformers` 4.3.2 `dist/transformers.js` | public asset                |
| `runtime/ort-wasm-simd-threaded.{mjs,wasm}`     | ONNX Runtime Web plain CPU build, 14.3 MB                | public asset                |
| `models/onnx-community/embeddinggemma-2-ONNX/…` | the pinned Q8 export, 10 files, 542 MB                   | `src/server/semantic-q8.ts` |

The asyncify (WebGPU) runtime is not staged. It lacks the CPU
`GatherBlockQuantized` kernel this Q8 export needs, and at 26.9 MB it is past a
Worker's 25 MiB asset limit. The browser XERJ shaper is not staged either;
nothing calls it.

## Pins

`vendor/semantic-q8/` holds the pins and nothing downloaded:

- `semantic.js`: Theorem `080b88ff64f8` `rustyred-membrane-wasm/browser/semantic.js`,
  sha256 `5b61a5d2…e305`. Never reformatted (`.prettierignore`).
- `lock.json`: that file's digest; the two npm tarballs (npm's own sha512
  integrity, taken from Theorem's `tests/browser-semantic/package-lock.json`);
  the sha256 and size of every file taken from them; and the model repository,
  revision `daa72c51…0c0` and the sha256 and size of its 10 files.

`scripts/semantic-q8/lock.test.ts` fails if the lock and the vendored producer
stop agreeing: same model files and digests, same runtime versions and runtime
digests, same export revision, `q8` for both encoders, no audio file, and the
public paths in `assets.ts`. To move to a newer producer, replace `semantic.js`
from a Theorem commit, regenerate `lock.json` from its `PRODUCER` table and
that commit's browser-semantic lock, and rerun the tests; the Q8 vectors and
their space identity change with the producer, so that is a feature decision,
not a refresh.

## Stage, verify, run

```sh
bun run semantic-q8:stage     # download, verify, stage (needs the network)
bun run semantic-q8:verify    # offline: re-hash everything against the pins
```

The stage writes two directories, both ignored by git:

- `.semantic-q8/v1/`: the whole served tree including the weights. This is the
  directory the Bun server reads and the one `E2E_Q8_ASSETS` takes
  (`scripts/e2e/semantic-q8.mjs`).
- `.semantic-q8/public/`: only the four code files and a manifest. The build
  ships this directory. `stage.mjs --code-only` refuses to write into a
  directory that holds `models/`, so a build can only copy code. Nothing
  depends on an ignore glob keeping a 313 MB file out of a Worker.

Every file is hashed as it is written and again by `--verify`; a file that is
present with another digest is refused, never replaced, and an npm tarball is
checked against its integrity before it is unpacked. `--model-source DIR`
(or `THEOREM_SEMANTIC_Q8_MODEL_SOURCE`) copies from a local model directory
with Theorem's `onnx/…` layout instead of downloading. The download comes from
the pinned revision on huggingface.co, the same fetch Theorem's
`install-model.mjs` makes; no credential is read or written.

The builds (`scripts/build.sh`, `scripts/build-cloudflare.sh`) run
`stage.mjs --code-only`, then `scripts/semantic-q8/check-output.mjs`, which
fails the build if `.output/public/semantic/q8` contains a model or a file at
the 25 MiB limit.

## Serving the weights

`/semantic/q8/v1/models/**` is a Nitro route on the Bun server and the Worker.
It accepts only the 10 pinned names, with `GET` and `HEAD`, and checks every
file's size. `GET` streams the body without buffering it in the server;
`HEAD` reads metadata only. There is no range handling. The producer verifies
the exact bytes with Subresource Integrity before using them.

- **Cloudflare:** a private `THEOREM_Q8_MODELS` R2 binding. Only an active,
  signed-in Theorem session can download a model file. A deployment bearer
  or public visitor session isn't enough. Download responses are
  `private, no-store`, and don't expose a bucket hostname or a credential.
  A Worker without the binding or object returns `404 model_not_installed`;
  there is no public mirror fallback.
- **Bun:** read the staged directory (`THEOREM_SEMANTIC_Q8_DIR`, default
  `<cwd>/.semantic-q8/v1`). This supports local development without an R2
  account. It does not use the Workers sign-in gate.

The bucket contains only model files, not journal data, passage text, queries,
or embeddings. A cold load transfers about 542 MB of model files (including
the tokenizer); inference still runs entirely in the browser.

### Provision and seed R2

1. Enable R2 in the same Cloudflare account as `theorem-ui`. Create a
   dedicated bucket (for example `theorem-ui-q8-models`) and leave **both**
   public access options, `r2.dev` and custom domains, disabled. Confirm
   redistribution terms when changing the model pin. The current
   [EmbeddingGemma 2 ONNX export](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX/tree/daa72c51243991dfcaf9f9137d2c573d8f7790c0)
   and its [base model](https://huggingface.co/google/embeddinggemma-2/tree/914f7f89142e33e77833254d9c9b90c3cef7303b)
   list Apache 2.0. If `wrangler r2 bucket list` returns `10042`, the account
   still needs R2 activation in the Cloudflare dashboard.
2. For a new revision, stage and verify the ten files, then upload under
   `q8/<release>/<export-revision>/<repository>/<file>`. Publish a new
   revision under new keys; don't replace files in an active release.
   For the current pins:

   ```sh
   bun run semantic-q8:verify
   bucket=theorem-ui-q8-models
   lock=vendor/semantic-q8/lock.json
   release=$(jq -r .version "$lock")
   revision=$(jq -r .model.revision "$lock")
   repository=$(jq -r .model.repository "$lock")
   jq -r '.model.files[].name' "$lock" | while IFS= read -r file; do
     bunx wrangler r2 object put \
       "$bucket/q8/$release/$revision/$repository/$file" \
       --file ".semantic-q8/$release/models/$repository/$file" --remote || exit 1
   done
   ```

3. Set `THEOREM_SEMANTIC_Q8_R2_BUCKET` to the bucket name in the Workers
   **build** environment. It is not a secret or runtime URL. A manual local
   build for deploy can instead run
   `THEOREM_SEMANTIC_Q8_R2_BUCKET=theorem-ui-q8-models bun run build:cloudflare`.
   Check that generated `wrangler.json` binds the expected bucket before
   deploying. Accounts without R2 may omit the variable and still build.
4. Before opening the tester flow, verify that a signed-out weight request
   is refused, a signed-in request streams the pinned file, and the
   deployed native saved-passage endpoints answer. Model delivery alone
   isn't proof of RedCore search or persistence.

## Checked here

- `bun test scripts/semantic-q8 src/server/semantic-q8.test.ts src/server/theorem-auth.test.ts`:
  lock and producer agree, staging refusals, build-output check, local file
  and R2 route behavior, and sealed session admission.
- `bun run semantic-q8:stage` then `semantic-q8:verify` on a clean checkout of
  this directory: all 14 files match their pins.
- A Bun build (`vite build`) and its server, over HTTP: the 4 code assets and
  both large weights returned the pinned sha256, `HEAD` returned the pinned
  length, an unpinned name and the asyncify runtime returned 404.
- A Cloudflare build with `THEOREM_SEMANTIC_Q8_R2_BUCKET=theorem-ui-q8-models`
  and `wrangler dev --local`: signed-out `HEAD` returned `401`. With a sealed
  test session, `HEAD` reported 313,724,928 bytes, and `GET` streamed the entire
  text weight object from local R2 with the pinned SHA-256.
- Cloudflare R2 readback: `theorem-ui-q8-models` contains all ten `v1` model
  objects. Each was downloaded with `wrangler r2 object get --remote` and
  matched the pinned SHA-256. `r2.dev` is disabled and no custom domains are
  attached. This checks the bucket, not the deployed Worker.

See [the saved-passage plan](plans/browser-q8-saved-passages.md#evidence-gates)
for the browser and native authority checks. A deployed signed-in test through
Theorem-UI and RedCore is still required.
