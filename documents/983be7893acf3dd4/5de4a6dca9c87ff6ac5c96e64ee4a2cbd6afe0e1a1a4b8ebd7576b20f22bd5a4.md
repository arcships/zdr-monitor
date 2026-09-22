Title: Regional Endpoints

URL Source: https://docs.x.ai/developers/advanced-api-usage/regions

Published Time: 2026-09-21T00:00:00Z

Markdown Content:
#### [Advanced API Usage](https://docs.x.ai/developers/advanced-api-usage/regions#advanced-api-usage)

[`https://api.x.ai`](https://api.x.ai/) is the global endpoint. SpaceXAI may route requests between regions for capacity or reliability, so the processing location is not guaranteed.

If you need API request handling and model inference to happen in the United States, use the US regional endpoint, [`https://us.api.x.ai/v1`](https://us.api.x.ai/v1). It is available to every team, and your existing API keys work on both endpoints.

The US endpoint currently serves two models, `grok-4.7` and `grok-4.6`, and none of the image generation, video generation, or voice APIs. Token usage costs 10% more than on the global endpoint. The US guarantee covers API request handling, inference, moderation, and retained request data. It does not cover Files, Collections, server-side tools, or the network path from your systems to SpaceXAI. See [What the guarantee covers](https://docs.x.ai/developers/advanced-api-usage/regions#what-the-guarantee-covers).

* * *

## [Using the US endpoint](https://docs.x.ai/developers/advanced-api-usage/regions#using-the-us-endpoint)

Point your client at [`https://us.api.x.ai/v1`](https://us.api.x.ai/v1); the Python SDK (`xai_sdk`) takes the bare host, `us.api.x.ai`.

```
import os

from xai_sdk import Client
from xai_sdk.chat import user

client = Client(
    api_key=os.getenv("XAI_API_KEY"),
    api_host="us.api.x.ai",
)

chat = client.chat.create(model="grok-4.7")
chat.append(user("Explain latency versus throughput in two sentences."))

print(chat.sample().content)
```

### [Model availability](https://docs.x.ai/developers/advanced-api-usage/regions#model-availability)

`grok-4.7` and `grok-4.6` are currently the only models available on the US endpoint; the [models page in the console](https://console.x.ai/team/default/models?cluster=us-central-1&utm_source=docs&utm_medium=referral&utm_campaign=developers-advanced-api-usage-regions&utm_content=models) and `GET https://us.api.x.ai/v1/models` always show the current list. Requesting a model that is not on that list, including `grok-latest`, fails with `404 Not Found`:

JSON

```
{
  "code": "not-found",
  "error": "The model grok-4-1-fast-reasoning does not exist or your team <team_id> does not have access to it. If you believe this is a mistake, please contact support and quote your team ID and the model name."
}
```

If a request for a globally available model returns this error, confirm that your client is calling the intended endpoint before troubleshooting model access. The image generation, video generation, and voice APIs are not served by the US endpoint; use the global endpoint for those.

* * *

## [Pricing](https://docs.x.ai/developers/advanced-api-usage/regions#pricing)

Token usage on the US endpoint costs 10% more than on the global endpoint. The premium applies to input, output, and cached input tokens, including long-context rates, and [prompt caching](https://docs.x.ai/developers/advanced-api-usage/prompt-caching) discounts still apply. The current per-token rates are on each model's detail page, reached from the [models page](https://docs.x.ai/developers/models), and on the [Pricing](https://docs.x.ai/developers/pricing) page.

* * *

## [What the guarantee covers](https://docs.x.ai/developers/advanced-api-usage/regions#what-the-guarantee-covers)

When you call [`https://us.api.x.ai/v1`](https://us.api.x.ai/v1), SpaceXAI guarantees that the following happen in the United States:

*   Handling of the request by SpaceXAI's API servers.
*   Inference for the model you request.
*   Safety moderation of the request and the response.
*   Storage of the request metadata, prompt inputs, and model outputs that SpaceXAI retains. The [Security FAQ](https://docs.x.ai/developers/faq/security#does-xai-train-on-customers-api-requests) describes what is retained and for how long.

The image generation, video generation, and voice APIs are not served by the US endpoint. [Files](https://docs.x.ai/developers/files), [Collections](https://docs.x.ai/developers/files/collections), and server-side tools such as [web search](https://docs.x.ai/developers/tools/web-search), [X search](https://docs.x.ai/developers/tools/x-search), and [code execution](https://docs.x.ai/developers/tools/code-execution) still work on the US endpoint, but they are outside the US guarantee and may process data outside the United States. If your requirements cover these features as well, avoid them when calling the US endpoint, or contact [support@x.ai](mailto:support@x.ai) to discuss your configuration.

The guarantee also does not cover the network path between your own users or infrastructure and the endpoint.

A regional endpoint is not, by itself, a comprehensive data-residency guarantee. If you have contractual requirements about where your data is processed or stored, contact [sales@x.ai](mailto:sales@x.ai) before relying on the US endpoint for compliance.

* * *

## [FAQ](https://docs.x.ai/developers/advanced-api-usage/regions#faq)

### [Does the US endpoint support tools, files, and structured outputs?](https://docs.x.ai/developers/advanced-api-usage/regions#does-the-us-endpoint-support-tools-files-and-structured-outputs)

Yes. Requests to the US endpoint accept the same parameters as the global endpoint, including function calling, server-side tools, file attachments, and structured outputs. However, server-side tools and files are outside the US guarantee; see [What the guarantee covers](https://docs.x.ai/developers/advanced-api-usage/regions#what-the-guarantee-covers).

### [Do prompt caches carry over between endpoints?](https://docs.x.ai/developers/advanced-api-usage/regions#do-prompt-caches-carry-over-between-endpoints)

Prompt cache hits are not guaranteed across endpoints. Keep each conversation on one endpoint and set a [`prompt_cache_key`](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/maximizing-cache-hits) so its requests are routed together.

### [Does Zero Data Retention apply on the US endpoint?](https://docs.x.ai/developers/advanced-api-usage/regions#does-zero-data-retention-apply-on-the-us-endpoint)

Yes. [Zero Data Retention](https://docs.x.ai/developers/faq/security#what-is-zero-data-retention-zdr) is a team-level setting, so it applies to every request your team makes regardless of the endpoint.
