<!-- https://www.kimi.ai/help/kimi-api/api-data-security -->
DownloadTry Kimi online
# Data processing & security
User data security and privacy protection FAQ for Kimi API.
Kimi API takes user data security and privacy protection very seriously.
## Is user data used for model training?
**No.** User data submitted through the API (including input content and model output) is **not used to train or improve Kimi's models**. Your data is used solely to fulfill the current API request and is not persistently stored for training purposes.
## How is private data security ensured?
Kimi API employs multiple measures to safeguard your private data:
| Measure | Description |
| **Encryption in Transit** | All API communication uses HTTPS/TLS |
| **Data Isolation** | Data from different users is strictly isolated |
| **Not Used for Training** | API data is not used for model training |
| **Access Control** | API Key authentication for authorized access only |
| **Compliance Certifications** | Platform has obtained relevant security certifications |
For higher security requirements, contact the sales team to learn about enterprise-grade security solutions.
## Content safety review
Kimi API includes a built-in content safety review mechanism:
- The system automatically detects and filters prohibited content (illegal activity, violence, explicit material, etc.)
- When triggered, the API returns an appropriate error response
- Content review does not store or expose your original data
- If you believe a review was triggered incorrectly, contact support with the `request_id`
## How to delete uploaded files?
Files uploaded via the file API can be deleted at any time:
Text
DELETE https://api.moonshot.ai/v1/files/{file_id}
Include your API Key in the request header and provide the file ID to delete it. Once deleted, the file can no longer be referenced and its data will be removed from the server.
You can also view and delete uploaded files on the file management page in the console.
Was this article helpful?
YesNo
Data processing & security - Kimi Help Center
