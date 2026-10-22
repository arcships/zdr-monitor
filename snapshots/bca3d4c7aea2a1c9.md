<!-- https://docs.oracle.com/en-us/iaas/Content/generative-ai/regions.htm -->
### Oracle Cloud Infrastructure Documentation
All Pages
Skip to main content
# Generative AI Regions
Learn where OCI Generative AI provides local model processing and how to access the service from regions with no local model processing.
Oracle hosts its OCI services in regions and availability domains. A region is a localized geographic area, and an availability domain is one or more data centers in that region.
**Important**
See Generative AI Models by Region for model availability in the regions that serve inference requests. For regions with no local model processing, see Commercial Regions (OC1) Without Local Model Processing.
## Commercial Regions (OC1) with Local Model Processing
The following table lists the OC1 regions with local model processing in Generative AI. Available models and serving modes vary by region. To use an on-demand model that isn't available locally, create a routing profile for that model and select regions where it is available. Use the profile from your current region in the Playground or through a supported inference API.
| Region Name | Location | Region Identifier | Region Key |
| **Brazil East (Sao Paulo)** | Sao Paulo | `sa-saopaulo-1` | `GRU` |
| **Germany Central (Frankfurt)** | Frankfurt | `eu-frankfurt-1` | `FRA` |
| **India South (Hyderabad)** | Hyderabad | `ap-hyderabad-1` | `HYD` |
| **Japan Central (Osaka)** | Osaka | `ap-osaka-1` | `KIX` |
| **Saudi Arabia Central (Riyadh)** | Riyadh | `me-riyadh-1` | `RUH` |
| **UAE Central (Abu Dhabi)** | Abu Dhabi | `me-abudhabi-1` | `AUH` |
| **UAE East (Dubai)** | Dubai | `me-dubai-1` | `DXB` |
| **UK South (London)** | London | `uk-london-1` | `LHR` |
| **US East (Ashburn)** | Ashburn | `us-ashburn-1` | `IAD` |
| **US Midwest (Chicago)** | Chicago | `us-chicago-1` | `ORD` |
| **US West (Phoenix)** | Phoenix | `us-phoenix-1` | `PHX` |
Learn About Regions and Availability Domains.
## Commercial Regions (OC1) Without Local Model Processing
For the OC1 regions with no local model processing in Generative AI, see Commercial Regions (OC1) Without Local Model Processing. For on-demand inference, this list includes UAE Central (Abu Dhabi). Abu Dhabi also provides local model processing for dedicated AI clusters. For all OCI commercial regions, see the OCI regions table and see entries with the realm key `OC1`.
In a region with no local model processing, create a routing profile for the on-demand model you want to use and select target regions where it is available. Select the profile in your region's Playground or reference it in an API request to run the model in a selected target region. The Chat API, OCI Chat Completions API, and OCI Responses API are supported when the selected model supports the API. Regional API endpoints support IPv6.
For supported features, limitations, and routing instructions, see Regions with no Local Model Processing.
## Government Region (OC4)
| **UK Gov South (London)** | London | `uk-gov-london-1` | `LTN` |
Learn about Oracle UK Sovereign Cloud.
## Sovereign Region (OC19)
| **EU Sovereign Central (Frankfurt)** | Frankfurt | `eu-frankfurt-2` | `STR` |
Learn about Oracle EU Sovereign Cloud.
## Services that Call into the Generative AI Service
Some OCI services call the Generative AI service. The following table lists the calling and destination regions for those service integrations.
There are OCI services which document (in the “*Oracle PaaS and IaaS Universal Credits Service Descriptions*”) that they make calls into the OCI Generative AI Service. For a given call into the OCI Generative AI Service, if the Calling Region and Destination Region are not the same, then a cross-region call will be made.
Area
| Calling Regions:
OCI regions from which (cross-region) calls can be made to the OCI Generative AI Service
| Destination Region:
OCI region offering OCI Generative AI Service
| Brazil | `GRU`, `VCP` | `GRU` |
| EU | `AMS`, `MRS`, `LIN`, `ARN`, `CDG`, `MAD`, `ZRH`, `FRA` | `FRA` |
| India | `BOM`, `HYD` | `HYD` |
| Japan | `KIX`, `NRT` | `KIX` |
| Saudi Arabia | `RUH` | `RUH` |
| UAE | `DXB` | `DXB` |
| UK | `CWL`, `LHR` | `LHR` |
| USA | `PHX`, `IAD`, `SJC`, `ORD` | `ORD` |
- Generative AI Regions
- Commercial Regions (OC1) with Local Model Processing
- Commercial Regions (OC1) Without Local Model Processing
- Government Region (OC4)
- Sovereign Region (OC19)
- Services that Call into the Generative AI Service
