<!-- https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-from-partners -->
Skip to main content Skip to Ask Learn chat experience
This browser is no longer supported.
Upgrade to Microsoft Edge to take advantage of the latest features, security updates, and technical support.
Download Microsoft Edge More info about Internet Explorer and Microsoft Edge
Table of contents Exit editor mode
Ask Learn Ask Learn
Reading mode Table of contents Read in English Add Add to Plans Edit
Copy Markdown Print
Note
Access to this page requires authorization. You can try signing in or changing directories.
Access to this page requires authorization. You can try changing directories.
# Foundry Models from partners and community
Feedback
Summarize this article for me
Microsoft Foundry Models in the model catalog comprise two main categories, namely *Foundry Models sold by Azure* and *Foundry Models from partners and community*. This article lists a selection of Foundry Models from partners and community, along with their capabilities, deployment types, and regions of availability, **excluding deprecated and retired models**. Most Foundry Model providers are trusted third-party organizations, partners, research labs, and community contributors.
Important
Models from partners and community that are not sold by Azure are Non-Microsoft Products under the Product Terms.
For a list of Foundry Models sold by Azure, see Foundry Models sold by Azure, and for a list of Foundry Models that are supported by the Foundry Agent Service, see Models supported by Agent Service.
Foundry Models support several deployment types to a Foundry resource. Some models in the model catalog require a hub-based project hosted by a Foundry hub for deployment. Selecting those models in the catalog opens them up in the Foundry (classic) portal experience.
## Prerequisites
- An Azure subscription. If you don't have one, create a free account.
Important
The following Azure subscriptions can't be used to purchase software as a service (SaaS) offers in Marketplace: Student, Visual Studio Enterprise, or Free credit. For more information on purchasing SaaS offers, see The SaaS purchase experience.
- A Microsoft Foundry project.
## Permissions required to subscribe to Models from partners and community
Foundry Models from partners and community available for deployment (for example, Cohere models) require Azure Marketplace. Model providers define the license terms and set the price for use of their models using Azure Marketplace.
When deploying third-party models, ensure you have the following permissions in your account:
- On the Azure subscription:
- `Microsoft.MarketplaceOrdering/agreements/offers/plans/read`
- `Microsoft.MarketplaceOrdering/agreements/offers/plans/sign/action`
- `Microsoft.MarketplaceOrdering/offerTypes/publishers/offers/plans/agreements/read`
- `Microsoft.Marketplace/offerTypes/publishers/offers/plans/agreements/read`
- `Microsoft.SaaS/register/action`
- On the resource group—to create and use the SaaS resource:
- `Microsoft.SaaS/resources/read`
- `Microsoft.SaaS/resources/write`
The **Owner** and **Contributor** built-in roles on the Azure subscription include these permissions. If you don't have the required permissions, ask your subscription administrator to assign you the **Contributor** role, or create a custom role that includes the listed actions.
To verify your permissions, go to the Azure portal, open your subscription, select **Access control (IAM)** > **Check access**, and review your assigned roles.
Tip
`Microsoft.SaaS/register/action` is a one-time registration of the SaaS resource provider on the subscription. After registration, it doesn't need to be repeated for each deployment.
## Country/region availability
You can access Models from partners and community with pay-as-you-go billing only if your Azure subscription belongs to a billing account in a country or region where the model provider made the offer available (see the "Offer availability region" column of the tables in each model provider's section). Availability varies per model provider and model SKU. If the offer is available in the relevant country or region, you must have a project or hub in the Azure region where the model is available for deployment or fine-tuning, as applicable. You can access Models from partners and community with pay-as-you-go billing only if your Azure subscription belongs to a billing account in a country or region where the model provider made the offer available (see the "Offer availability region" column of the tables in each model provider's section). Availability varies per model provider and model SKU. If the offer is available in the relevant country or region, you must have a project or hub in the Azure region where the model is available for deployment or fine-tuning, as applicable.
## Anthropic
Anthropic's flagship product is Claude, a frontier AI model trusted by leading enterprises and millions of users worldwide for complex tasks including coding, agents, financial analysis, research, and office tasks. Claude delivers exceptional performance while maintaining high safety standards.
Note
Microsoft Foundry offers Claude models in two versions: **Hosted on Azure** and **Hosted on Anthropic infrastructure** deployments. Both versions aren't available for every model. The lifecycle stage, such as Preview or Generally available, can differ between the two versions. For an overview of Claude models in Foundry, including per-model availability and lifecycle status, see Claude models in Microsoft Foundry. To learn how to use Claude models in Foundry, see Deploy and use Claude models in Microsoft Foundry.
#### Subscription type and region support
To use Claude models in Microsoft Foundry, you must have a paid Azure subscription with a billing account in a country or region where Anthropic offers the models for purchase. For a list of common subscription-related errors, see Common error messages and solutions. The following subscription types are currently not supported:
- Enterprise Accounts located in South Korea
- Cloud Solution Provider subscriptions
- Azure subscriptions that don't have an active pay-as-you-go billing method (for example, student, free trial, or startup credit–based accounts)
- Sponsored subscriptions that only use Azure credits. ***Note**: If you have an account with a credit card on file, the credit card will be charged instead of Azure Credits.*
For a list of supported regions, see supported geographic locations. Note that, Anthropic's "Supported Regions Policy" may apply for the availability in your region, check supported regions for details.
| Model | Type | Capabilities | Offer availability region |
| `claude-fable-5-1` | Messages | - **Input:** text, image, and code
- **Output:** text, image, and code (128,000 max tokens)
- **Context window:** 1,000,000
- **Languages:** `en`, `fr`, `ar`, `zh`, `ja`, `ko`, `es`, `hi`
- **Tool calling:** Yes (file search, code execution, and more)
- **Response formats:** Text in various formats (for example, prose, lists, Markdown tables, JSON, HTML, code in various programming languages)
- **Key parameters:**
`top_p` must be at least 0.99. Requests with `top_p` below this threshold are rejected with a 400 error. When `top_p` is omitted, the default (0.99) is used.
`top_k`, `temperature`, `thinking={"type":"enabled"}`, `thinking={"type":"disabled"}`, and `output_format` are **not supported**. | Microsoft Managed Countries/Regions (except Belarus and Russia) |
| `claude-fable-5` | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Response formats:** Text in various formats (e.g., prose, lists, Markdown tables, JSON, HTML, code in various programming languages)
- **Key parameters:**
| `claude-mythos-5-1`1 | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Key parameters:**
`top_k`, `temperature`, `thinking={"type":"enabled"}`, `thinking={"type":"disabled"}`, and `output_format` are **not supported**.
Minimum cacheable prompt: 512 tokens. | Microsoft Managed Countries/Regions (except Belarus and Russia) |
| `claude-mythos-5`1 | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Key parameters:**
| `claude-mythos-preview`1 | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Tool calling:** Yes (file search and code execution)
- **Key parameters:**
`top_k`and `temperature` are **not supported**.
Minimum cacheable prompt: 2048 tokens. | Microsoft Managed Countries/Regions (except Belarus and Russia) |
| `claude-opus-5-5` | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Key parameters:**
`top_k`, `temperature`, and `thinking={"type":"enabled"}` are **not supported**.
When `thinking={"type":"disabled"}`, `effort` is capped at `high`.
`top_p` must be 0.99; when omitted, the default (0.99) is used. | Microsoft Managed Countries/Regions (except Belarus and Russia)
US (Hosted on Azure for Data Zone Standard) |
| `claude-opus-5` | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Key parameters:**
| `claude-opus-4-8` | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Key parameters:**
| `claude-opus-4-7` | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Key parameters:**
`top_p` must be 0.99. When omitted, the default (0.99) is used. | Microsoft Managed Countries/Regions (except Belarus and Russia) |
| `claude-opus-4-6` | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Response formats:** Text in various formats (e.g., prose, lists, Markdown tables, JSON, HTML, code in various programming languages) | Microsoft Managed Countries/Regions (except Belarus and Russia) |
| `claude-opus-4-5` | Messages | - **Input:** text, image, and code
- **Output:** text (64,000 max tokens)
- **Context window:** 200,000
| `claude-sonnet-5` | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
- **Key parameters:**
`output_format` supported only for `thinking={"type":"adaptive"}`.
`top_p` must be 0.99. When omitted, the default (0.99) is used. | Microsoft Managed Countries/Regions (except Belarus and Russia)
| `claude-sonnet-4-6` | Messages | - **Input:** text, image, and code
- **Context window:** 1,000,000
| `claude-sonnet-4-5` | Messages | - **Input:** text, image, and code
- **Output:** text (64,000 max tokens)
- **Context window:** 200,000
| `claude-haiku-4-5` | Messages | - **Input:** text and image
- **Output:** text (64,000 max tokens)
- **Context window:** 200,000
1 **Claude Mythos 5-1**, **Claude Mythos 5**, and **Claude Mythos Preview** are only available as *gated research preview*. Access to the models is granted solely at Anthropic's discretion and prioritized for defensive cybersecurity use cases. See the Claude Fable 5.1 & Claude Mythos 5.1 system card, Claude Mythos 5 system card, and Claude Mythos Preview system card for responsible use guidance.
## Cohere
The Cohere family of models includes various models optimized for different use cases, including chat completions and embeddings. Cohere models are optimized for various use cases that include reasoning, summarization, and question answering.
To deploy Cohere models in Foundry, see Deploy Microsoft Foundry Models in the Foundry portal.
| `Cohere-embed-v3-english` | embeddings | - **Input:** text and images (512 tokens)
- **Output:** Vector (1024 dim.)
- **Languages:** `en` | Microsoft Managed Countries/Regions
Japan
Qatar |
| `Cohere-embed-v3-multilingual` | embeddings | - **Input:** text (512 tokens)
- **Output:** Vector (1024 dim.)
- **Languages:** `en`, `fr`, `es`, `it`, `de`, `pt-br`, `ja`, `ko`, `zh-cn`, and `ar` | Microsoft Managed Countries/Regions
Japan
Qatar |
## Meta
Meta Llama models and tools are a collection of pretrained and fine-tuned generative AI text and image reasoning models. Meta models range in scale to include:
- Small language models (SLMs) like 1B and 3B Base and Instruct models for on-device and edge inferencing
- Mid-size large language models (LLMs) like 7B, 8B, and 70B Base and Instruct models
- High-performance models like Meta Llama 3.1-405B Instruct for synthetic data generation and distillation use cases.
To deploy Meta Llama models in Foundry, see Deploy Microsoft Foundry Models in the Foundry portal.
| `Llama-4-Scout-17B-16E-Instruct` | chat-completion | - **Input:** text and image (128,000 tokens)
- **Output:** text (8,192 tokens)
- **Languages:** `en`
- **Tool calling:** No
- **Response formats:** Text | Microsoft Managed Countries/Regions |
## Microsoft
Microsoft models include various model groups such as MAI models, Phi models, healthcare AI models, and more.
To deploy Microsoft models in Foundry, see Deploy Microsoft Foundry Models in the Foundry portal.
| `Phi-4-mini-instruct` | chat-completion | - **Input:** text (131,072 tokens)
- **Output:** text (4,096 tokens)
- **Languages:** `ar`, `zh`, `cs`, `da`, `nl`, `en`, `fi`, `fr`, `de`, `he`, `hu`, `it`, `ja`, `ko`, `no`, `pl`, `pt`, `ru`, `es`, `sv`, `th`, `tr`, and `uk`
- **Tool calling:** No
- **Response formats:** Text | Not applicable |
| `Phi-4-multimodal-instruct` | chat-completion | - **Input:** text, images, and audio (131,072 tokens)
- **Output:** text (4,096 tokens)
- **Tool calling:** No
| `Phi-4` | chat-completion | - **Input:** text (16,384 tokens)
- **Output:** text (16,384 tokens)
- **Languages:** `en`, `ar`, `bn`, `cs`, `da`, `de`, `el`, `es`, `fa`, `fi`, `fr`, `gu`, `ha`, `he`, `hi`, `hu`, `id`, `it`, `ja`, `jv`, `kn`, `ko`, `ml`, `mr`, `nl`, `no`, `or`, `pa`, `pl`, `ps`, `pt`, `ro`, `ru`, `sv`, `sw`, `ta`, `te`, `th`, `tl`, `tr`, `uk`, `ur`, `vi`, `yo`, and `zh`
- **Tool calling:** No
| `Phi-4-reasoning` | chat-completion with reasoning content | - **Input:** text (32,768 tokens)
- **Output:** text (32,768 tokens)
- **Languages:** `en`
- **Tool calling:** No
| `Phi-4-mini-reasoning` | chat-completion with reasoning content | - **Input:** text (128,000 tokens)
- **Output:** text (128,000 tokens)
- **Languages:** `en`
- **Tool calling:** No
## Mistral AI
Mistral AI offers models for code generation, general-purpose chat, and multimodal tasks, including Codestral, Ministral, Mistral Small, and Mistral Medium.
To deploy Mistral AI models in Foundry, see Deploy Microsoft Foundry Models in the Foundry portal.
| `Codestral-2501` | chat-completion | - **Input:** text (262,144 tokens)
- **Output:** text (4,096 tokens)
- **Languages:** en
- **Tool calling:** No
- **Response formats:** Text | Microsoft Managed Countries/Regions
Brazil
Hong Kong SAR
Israel |
| `Ministral-3B` | chat-completion | - **Input:** text (131,072 tokens)
- **Output:** text (4,096 tokens)
- **Languages:** fr, de, es, it, and en
- **Tool calling:** Yes
- **Response formats:** Text, JSON | Microsoft Managed Countries/Regions
Brazil
Hong Kong SAR
Israel |
| `Mistral-small-2503` | chat-completion | - **Input:** text (32,768 tokens)
- **Output:** text (4,096 tokens)
- **Languages:** fr, de, es, it, and en
- **Tool calling:** Yes
Brazil
Hong Kong SAR
Israel |
| `Mistral-medium-2505` | chat-completion | - **Input:** text (128,000 tokens), image
- **Output:** text (128,000 tokens)
- **Tool calling:** No
Brazil
Hong Kong SAR
Israel |
| `mistralai-Mistral-7B-Instruct-v01`1 | chat-completion | - **Input:** text
- **Output:** text
- **Languages:** en
- **Response formats:** Text | - |
| `mistralai-Mistral-7B-Instruct-v0-2`1 | chat-completion | - **Input:** text
- **Output:** text
- **Languages:** en
- **Response formats:** Text | - |
| `mistralai-Mixtral-8x7B-Instruct-v01`1 | chat-completion | - **Input:** text
- **Output:** text
- **Languages:** en
- **Response formats:** Text | - |
| `mistralai-Mixtral-8x22B-Instruct-v0-1`1 | chat-completion | - **Input:** text (64,000 tokens)
- **Output:** text (4,096 tokens)
- **Languages:** fr, it, de, es, en
- **Response formats:** Text | - |
1 These models require a hub-based project for deployment. Selecting them in the model catalog opens them up in the Foundry (classic) portal experience.
## NTT Data
**tsuzumi** is an autoregressive language-optimized transformer. The tuned versions use supervised fine-tuning (SFT). tsuzumi handles both Japanese and English language with high efficiency.
To deploy tsuzumi-7b in Foundry, see Deploy Microsoft Foundry Models in the Foundry portal.
| `tsuzumi-7b`1 | chat-completion | - **Input:** text (8,192 tokens)
- **Output:** text (8,192 tokens)
- **Languages:** `en` and `jp`
- **Tool calling:** No
1 This model requires a hub-based project for deployment. Selecting the model in the model catalog opens it in the Foundry (classic) portal experience.
See NTT Data models in the Foundry portal.
## Region availability by deployment type
Microsoft Foundry provides customers with choices on the hosting structure that fits their business and usage patterns. This section lists the regional availability for Foundry Models from partners and community, across all regions, for the Global Standard and Data Zone standard deployment types. To deploy your model in any of the Azure regions listed in the following tables, you must have a project or hub in that region.
For billing-account country/region eligibility, see Country/region availability. To learn about all available model deployment types, see Deployment types for Microsoft Foundry Models.
### Global standard
For **global deployments**, Microsoft processes prompts and responses in any Azure region where you deploy the model.
- Americas
- Europe
- Asia Pacific
- Middle East & Africa
| **Model** | **Version** | **brazilsouth** | **canadacentral** | **canadaeast** | **centralus** | **eastus** | **eastus2** | **northcentralus** | **southcentralus** | **westcentralus** | **westus** | **westus2** | **westus3** |
| claude-fable-5 | 1 | - | - | - | - | - | ✅ | - | - | - | - | - | - |
| claude-fable-5-1 | 1 | - | - | - | - | - | ✅ | - | - | - | - | - | - |
| claude-haiku-4-5 | 2 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-haiku-4-5 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-opus-4-5 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-opus-4-6 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-opus-4-7 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-opus-4-8 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-opus-4-8 | 2 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-opus-5 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-opus-5 | 2 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-opus-5-5 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-opus-5-5 | 2 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-sonnet-4-5 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-sonnet-4-6 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-sonnet-5 | 1 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| claude-sonnet-5 | 2 | - | - | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| Codestral-2501 | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Llama-4-Scout-17B-16E-Instruct | 1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ministral-3B | 1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mistral-large | 1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| mistral-medium-2505 | 1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| mistral-small-2503 | 1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Model** | **Version** | **francecentral** | **germanywestcentral** | **italynorth** | **norwayeast** | **polandcentral** | **spaincentral** | **swedencentral** | **switzerlandnorth** | **switzerlandwest** | **uksouth** | **ukwest** | **westeurope** |
| claude-fable-5 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-fable-5-1 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-haiku-4-5 | 2 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-haiku-4-5 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-opus-4-5 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-opus-4-6 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-opus-4-7 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-opus-4-8 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-opus-4-8 | 2 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-opus-5 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-opus-5 | 2 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-opus-5-5 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-opus-5-5 | 2 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-sonnet-4-5 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-sonnet-4-6 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-sonnet-5 | 1 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| claude-sonnet-5 | 2 | - | - | - | - | - | - | ✅ | - | - | - | - | - |
| **Model** | **Version** | **australiaeast** | **japaneast** | **japanwest** | **koreacentral** | **southindia** |
| Codestral-2501 | 2 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Llama-4-Scout-17B-16E-Instruct | 1 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ministral-3B | 1 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mistral-large | 1 | ✅ | ✅ | ✅ | ✅ | ✅ |
| mistral-medium-2505 | 1 | ✅ | ✅ | ✅ | ✅ | ✅ |
| mistral-small-2503 | 1 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Model** | **Version** | **southafricanorth** | **uaenorth** |
| Codestral-2501 | 2 | ✅ | ✅ |
| Llama-4-Scout-17B-16E-Instruct | 1 | ✅ | ✅ |
| Ministral-3B | 1 | ✅ | ✅ |
| Mistral-large | 1 | ✅ | ✅ |
| mistral-medium-2505 | 1 | ✅ | ✅ |
| mistral-small-2503 | 1 | ✅ | ✅ |
### Data Zone Standard
For **Data Zone** deployments, Microsoft processes prompts and responses anywhere within the specified data zone: United States (data processed anywhere within the US), European Union (data processed within any EU member nation), or Asia Pacific (data processed within any Asia Pacific nation).
- Americas
- Europe
- Asia Pacific
- Middle East & Africa
| **Model** | **Version** | **centralus** | **eastus** | **eastus2** | **northcentralus** | **southcentralus** | **westcentralus** | **westus** | **westus3** |
| claude-opus-4-8 | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| claude-opus-5 | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| claude-opus-5-5 | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| claude-sonnet-5 | 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
Not available
## Alternatives to region availability
If most of your infrastructure is in a particular region and you want to take advantage of models available only as serverless APIs, you can create a hub or project in a supported region and then consume the endpoint from another region.
To learn how to configure an existing serverless API deployment in a different hub or project than the one where it was deployed, see Consume serverless APIs from a different hub or project.
## Troubleshooting
Use the following troubleshooting guide to find and solve errors when deploying third-party models in Foundry Models:
| Error | Description |
| Offer not available in your country/region | The model provider didn't make the specific model SKU available in the country/region where you registered your subscription. Each model provider decides which countries/regions are available, and availability can vary by model SKU. Deploy the model to a subscription with billing in a supported country/region. See Region availability for models. |
| Marketplace purchase eligibility check failed | The model provider didn't make the specific model SKU available in your country/region, or the model isn't available in the region where you deployed the Foundry resource. See Region availability for models. |
| Unable to create a model deployment | Azure Marketplace rejected the request to create a model subscription. This rejection can happen for multiple reasons, including subscribing to the model offering too often or from multiple subscriptions at the same time. Contact support and include your subscription ID. |
| CSP subscription not supported | Cloud Solution Provider (CSP) subscriptions can't purchase third-party model offerings. Consider using models offered as a first-party consumption service. |
## Related content
- Deployment overview for Foundry Models
- Deploy Microsoft Foundry Models in the Foundry portal
- Deployment types for Microsoft Foundry Models
- Region availability for Foundry Models
- Explore Foundry Models
## Feedback
Was this page helpful?
Yes No No
Need help with this topic?
Want to try using Ask Learn to clarify or guide you through this topic?
Ask Learn Ask Learn
Suggest a fix?
## Additional resources
- Last updated on 2026-09-21
Was this page helpful?
Need help with this topic?
Ask Learn Ask Learn
Suggest a fix?
