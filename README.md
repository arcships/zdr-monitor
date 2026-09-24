# zdr

[zdr](https://arcships.github.io/zdr-monitor/) is an open-source database of how LLM providers handle customer data. It tracks model training, zero data retention, retention periods, processing regions, and contractual roles at the product-plan level.

There is no single place to compare these policies across providers and plans. We built zdr so every explicit verdict can be checked against the vendor's own words, and those source documents can be monitored for change.

```
83 companies · 313 plans · 1565 verdicts · 3373 anchored quotes
558 source documents, re-fetched daily; changes arrive as snapshot pull requests
```

A `✗` means the vendor makes no explicit public commitment on that dimension.
It is not a claim about what the vendor actually does — only about what its
published terms say, which is the only thing a buyer can hold them to.

## API

You can access the complete dataset as static JSON. No API key is required.

```bash
curl https://arcships.github.io/zdr-monitor/api.json
```

The top-level keys are **Company IDs**. Each company contains a `plans` object keyed by **Plan ID**:

```js
const api = await fetch("https://arcships.github.io/zdr-monitor/api.json").then((r) => r.json())

const plan = api["cursor"].plans["cursor/teams"]
console.log(plan.training.mark)   // "yes" means not used for training
console.log(plan.training.quote)  // verbatim vendor text
console.log(plan.training.source) // official source URL and channel
```

Plan IDs are the stable lookup key. Do not merge plans by company name: individual, team, and enterprise plans from the same vendor often have different terms.

### Other endpoints

| Endpoint | Contents |
| --- | --- |
| [`/api.json`](https://arcships.github.io/zdr-monitor/api.json) | Complete public dataset, indexed by company and plan ID |
| [`/_catalog.json`](https://arcships.github.io/zdr-monitor/_catalog.json) | Compact catalog with one row per plan; start here for one-off queries |
| [`/p/<company>.json`](https://arcships.github.io/zdr-monitor/p/cursor.json) | One company's plans, evidence, sources, and confirmed changes |
| [`/_changes.json`](https://arcships.github.io/zdr-monitor/_changes.json) | Agent-confirmed policy changes |
| [`/_meta.json`](https://arcships.github.io/zdr-monitor/_meta.json) | Generation time, dimensions, snapshot coverage, and confirmed changes |
| [`/llms.txt`](https://arcships.github.io/zdr-monitor/llms.txt) | Field schema, interpretation rules, and scope for agents |

### Reading verdicts

The five dimensions are:

| Dimension | Question or value |
| --- | --- |
| `training` | Does the provider commit not to use the data for training? |
| `zdr` | Is zero data retention available? |
| `retention` | How long are inference inputs and outputs retained? |
| `processing_region` | Where is the data processed? |
| `role` | Processor, controller, subprocessor, or unspecified? |

Three rules are easy to get wrong:

1. `mark` answers the question in the column name. For `training`, `yes` means **not used for training** and `no` means it may be used for training.
2. `unknown` means the official sources were searched but no applicable statement was found. The checked pages are exported in `searched`.
3. `mode` describes how a result is achieved. A contractual prohibition, an opt-out switch, and isolation created by self-hosted deployment are not equivalent guarantees.

Quotes stay in their original language so consumers can compare them directly with the official source. See [`llms.txt`](https://arcships.github.io/zdr-monitor/llms.txt) for the complete machine-readable contract.

## Contributing

The data is stored as TOML in [`providers/`](providers/). Each file contains a product line, its monitored official sources, product plans, five-dimensional verdicts, and evidence anchors. The same data generates both the website and public API.

We need help keeping policies current. Corrections must cite an official page and the exact sentence supporting the change.

### Data hierarchy

```text
company → product line / site → plan → verdict → evidence point → anchor → source snapshot
```

- A company may have several provider files when products or legal sites use different policy documents.
- A plan is a first-class record. Free, individual, team, and enterprise plans must not be collapsed into one verdict.
- BYOK and fully local tools are excluded when the tool vendor never receives the data. Self-hosted commercial plans are included when a distinct contract applies.

See [`docs/scope.md`](docs/scope.md) for the full inclusion rules.

### Adding or updating a provider

Edit `providers/<provider-id>.toml` directly. Add the official sources as
`[[source]]` entries, one `[[product]]` per distinct plan, and all five
dimensions. Quotes only count once they resolve against the bot-fetched snapshot
in `snapshots/<source_id>.md`, so fetch before you cite:

```bash
bun run snapshot <provider-id>          # fetch every source the provider declares
bun run check:quotes <provider-id>      # every exact must resolve to exactly one place
```

Bind explicit conclusions to verbatim `[[anchor]]` excerpts from the snapshot.
For an `unknown` verdict, record the official pages checked in `searched`. Then:

```bash
bun run validate
bun test
bun run typecheck
bun run build
```

Do not edit `snapshots/` by hand. It is written only by the fetch bot, and CI
rejects snapshot changes on other branches; version history is the git history.

### Provider schema

Provider-level fields identify the product line and legal scope:

- `name`, `name_en`: display names
- `company`, `company_name`: aggregate related product lines into one company page
- `line`: product-line slug
- `site`: legal site such as `cn`, `global`, `us`, or `eu`
- `entity`: contracting legal entity, taken from the contract rather than inferred from the brand
- `kind`: `model_vendor`, `cloud`, `aggregator`, `reseller`, or `self_host`
- `homepage`, `doc`: product homepage and primary policy page

Each `[[product]]` has:

- `id`: stable plan ID within the provider file
- `category`: `api`, `coding_plan`, `web`, or `self_host`
- `plan_level`: `free`, `individual`, `team`, `enterprise`, or `any`
- `training`, `zdr`, `retention`, `processing_region`, and `role` verdict tables

Verdict interpretation and evidence standards are defined in [`docs/judgment.md`](docs/judgment.md). Existing provider files are the canonical examples.

### Validation

GitHub Actions validates every pull request. Run the same checks locally:

```bash
bun install
bun run validate
bun test
bun run typecheck
bun run build
```

Validation checks TOML structure, controlled values, plan coverage, source references, and evidence anchors. Tests and type checking cover the generated API and website.

### Working on the frontend

Install [Bun](https://bun.sh/), then run:

```bash
bun install
bun run dev
```

The local site opens through Vite. `bun run build` regenerates the public JSON endpoints and produces `packages/web/dist/`.

### Questions and corrections

Open an issue with the official URL, affected plan, dimension, and exact source sentence. A page diff is a review lead, not automatically a confirmed policy change.

Maintenance and monitoring details are documented in:

- [`docs/maintenance.md`](docs/maintenance.md) — daily fetching, snapshot PRs, DimCode agent review, and full audits
- [`AGENTS.md`](AGENTS.md) — mandatory evidence rules for contributors and agents

## License

Code and structured data are available under the [MIT License](LICENSE).

Quoted policy text remains the property of its respective vendor and is included with attribution for verification.
