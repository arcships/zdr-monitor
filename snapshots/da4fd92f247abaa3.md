<!-- https://docs.wandb.ai/platform/hosting/hosting-options/self-managed -->
> ## Documentation Index
> Fetch the complete documentation index at: /llms.txt
> Use this file to discover all available pages before exploring further.
Skip to main content
Notice: The Weights & Biases domain will change on September 30. This includes all websites and services that use a W&B domain. No action is needed today.
Weights & Biases Documentation home page
English
Search...
⌘K
Search...
Navigation
Self-Managed
W&B Self-Managed deployment overview
Products
Get Started
Reference
Release Notes
Support
# W&B Self-Managed deployment overview
Install W&B MCP
Deploy W&B Self-Managed on cloud or on-premises infrastructure
Install W&B MCP
W&B recommends fully managed deployment options such as W&B Multi-tenant Cloud or W&B Dedicated Cloud. W&B fully managed services are secure to use, with minimal configuration required.
W&B Self-Managed lets you run W&B Server in infrastructure you control, so you can meet internal policies for data residency, network isolation, and compliance. This overview is for IT, DevOps, and MLOps teams who plan, deploy, and operate W&B Server on their own cloud account or on-premises infrastructure. Deploy W&B Server on your AWS, Google Cloud, or Azure cloud account or within your on-premises infrastructure. Your IT, DevOps, or MLOps team has the following responsibilities:
- Provision your deployment.
- Secure your infrastructure in accordance with your organization’s policies, Security Technical Implementation Guidelines (STIG), if applicable.
- Maintain compliance with your organization’s regulatory requirements, such as Service and Organization Controls (SOC) 2 Type 2 and Health Insurance Portability and Accountability Act of 1996 (HIPAA).
- Manage upgrades and apply patches.
- Maintain your W&B Self-Managed deployment on an ongoing basis.
If your organization is subject to regulatory requirements, consider deploying on W&B Dedicated Cloud, which is maintained by W&B.
- W&B Dedicated Cloud’s hosting platform meets the requirements of SOC 2 Type 2.
- When configured appropriately, a W&B Dedicated Cloud deployment complies with HIPAA.
Refer to the W&B Security Portal to request more information.
About the W&B Kubernetes Operator
W&B Self-Managed installations are delivered and managed through a Kubernetes operator, which handles the day-to-day complexity of running W&B Server. Use the W&B Kubernetes Operator to deploy W&B Self-Managed. The operator simplifies deploying, administering, troubleshooting, and scaling W&B. The operator connects to a central deploy.wandb.ai server to request the latest specification changes for a given release channel and apply them. The operator receives updates as long as the license is valid. The operator uses Helm both to install itself and to manage the W&B Kubernetes stack. The deployment consists of multiple pods, one per service, and each pod name is prefixed with `wandb-`. Configuration follows a hierarchy: **Release Channel Values** (defaults from W&B), **User Input Values** (overrides via the System Console), and **Custom Resource Values** (your spec overrides both). Use the following resources based on your deployment target:
- To deploy W&B Self-Managed in public cloud or on-premises infrastructure, see Deploy W&B with Kubernetes Operator.
- To deploy W&B Self-Managed to a custom cloud platform that isn’t AWS, the requirements are similar to the requirements to deploy in on-premises infrastructure.
- To deploy W&B Self-Managed in air-gapped environments, see Deploy on Air-Gapped Kubernetes.
You can optionally configure rate limits on your instance to maintain stability. For more information, see Rate limits.
Required infrastructure
Before you deploy, make sure the following infrastructure is available. All W&B Self-Managed deployment options depend on these components:
- Kubernetes
- MySQL 8.4.x database
- Amazon S3-compatible object storage
- Redis cache
W&B can provide recommendations for the different components and provide guidance through the installation process. For more information, see Requirements.
Obtain your W&B Server license
A W&B Server license authorizes your deployment. You must obtain a license before installation. For step-by-step instructions, see License on the Requirements page.
Was this page helpful?
YesNo
Suggest editsRaise issue
