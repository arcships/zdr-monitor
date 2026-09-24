<!-- https://docs.oracle.com/en-us/iaas/Content/generative-ai/regions.htm -->
### Oracle Cloud Infrastructure Documentation
All Pages
Skip to main content
# Generative AI Regions
Oracle hosts its OCI services in regions and availability domains. A region is a localized geographic area, and an availability domain is one or more data centers in that region. This page provides a list of regions where OCI Generative AI models are available.
**Important**
See Generative AI Models by Region to find out which models are available in a region near you.
## Commercial Regions (OC1)
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
## Government Region (OC4)
| **UK Gov South (London)** | London | `uk-gov-london-1` | `LTN` |
Learn about Oracle UK Sovereign Cloud.
## Sovereign Region (OC19)
| **EU Sovereign Central (Frankfurt)** | Frankfurt | `eu-frankfurt-2` | `STR` |
Learn about Oracle EU Sovereign Cloud.
## Services that Call into the Generative AI Service
Currently, the Oracle Cloud Infrastructure (OCI) Generative AI Service is not offered in every OCI commercial region. See the column below titled “Destination Region:” for a list of OCI commercial regions offering the OCI Generative AI Service.
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
- Commercial Regions (OC1)
- Government Region (OC4)
- Sovereign Region (OC19)
- Services that Call into the Generative AI Service
