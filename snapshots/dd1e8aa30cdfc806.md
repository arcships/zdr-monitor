<!-- https://docs.github.com/en/copilot/using-github-copilot/asking-github-copilot-questions-in-github -->
Skip to main content
Skip to content
Search or ask Copilot/
Menu
Collapse sidebarExpand sidebar
Scroll breadcrumbs left
Scroll breadcrumbs right
In this article
# Asking GitHub Copilot questions in GitHub
Get instant answers about your code, repositories, and development questions — right from GitHub.
Copy markdown
## In this article
## Submitting a question to Copilot Chat
Copilot Chat is available from any page on GitHub. Some questions work best in a specific context, such as a repository, issue, or pull request.
1. Navigate to https://github.com/copilot.
2. In the prompt box, type a question and press Enter.
Some examples of general questions you could ask are:
- `What are the advantages of the Go programming language?`
- `What is Agile software development?`
- `What is the most popular JavaScript framework?`
- `Give me some examples of regular expressions.`
- `Write a bash script to output today's date.`
3. Optionally, after submitting a question, you can click in the text box to stop the response.
4. Within a conversation thread, you can ask follow-up questions. Copilot will answer within the context of the conversation.
### Viewing an editing generated files
Note
This feature is currently in public preview and subject to change.
Copilot may generate files as part of its response, which you can view, edit, and download from the side panel.
### Changing and comparing AI models
You can choose from a selection of AI models, each with different strengths. Different models consume AI credits at different rates based on their token pricing. For details, see Models and pricing for GitHub Copilot.
If you access Copilot Chat through a Copilot Business subscription, your organization must grant members the ability to switch to a different model. See Managing policies and features for GitHub Copilot in your organization.
1. At the bottom of Copilot Chat, select the **CURRENT-MODEL** dropdown menu, then click the AI model of your choice.
After submitting a prompt, you can also regenerate a response using a different model by clicking the retry icon () below the response. You can switch between responses to compare results.
### Using subthreads in a conversation
Subthreads are branches of a conversation that let you explore aspects of a topic, or new topics, all within the same thread.
To create a subthread, hover over one of your previous questions and click the button. Edit the question, then click **Send**. You cannot edit any attachments.
The response to your edited question is displayed in a new subthread. An edit counter appears below the question. Hover over the counter, then click or to navigate between subthreads.
### Using images in Copilot Chat
You can attach images and PDFs to your prompts when using a model that supports image input.
Copilot supports the following file types:
- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- GIF (`.gif`)
- WEBP (`.webp`)
- PDF (`.pdf`)
- HEIC (`.heic`)
- HEIF (`.heif`)
For example, you can attach:
- A screenshot of a code snippet and ask Copilot to explain the code.
- A mockup of the user interface for an application and ask Copilot to generate the code.
- A flowchart and ask Copilot to describe the processes shown in the image.
- A screenshot of a web page and ask Copilot to generate HTML for a similar page.
Image and PDF attachments are available on all Copilot plans and are enabled by default, with no policy required to turn the feature on or off.
To attach a file, drag and drop it into the prompt box, or click and select **Upload from computer**. Select a model that supports image input from the model picker.
### Continuing a conversation alongside an agent session
When you start a Copilot cloud agent task from Copilot Chat—for example, by asking Copilot to create a pull request or research a repository—you can keep chatting while the cloud agent session runs. Copilot Chat reflects the status of the in-progress session and draws on its context, so you can ask follow-up questions about what the agent is doing. When the session is complete, you can ask further questions about the work or start another session from Copilot Chat. For more information, see Managing agent sessions.
### Conversation history and retention
Copilot Chat stores up to 100 of your most recent conversations. Messages within each conversation are kept for 28 days before being permanently deleted. Once a conversation has no messages left, it's automatically removed from your history.
## Further reading
- Using GitHub Copilot to explore a codebase
