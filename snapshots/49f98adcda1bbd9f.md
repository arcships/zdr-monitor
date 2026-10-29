<!-- https://docs.windsurf.com/windsurf/agent-command-center.md -->
> ## Documentation Index
> Fetch the complete documentation index at: /llms.txt
> Use this file to discover all available pages before exploring further.
Skip to main content
Assistant
Responses are generated using AI and may contain mistakes.
Devin Docs home page
English
Search...
⌘KAsk Assistant⌘I
Search...
Navigation
Agent Command Center
Cloud
CLI
Desktop
Enterprise
Use Cases
API
Federal
Agent Command Center
# Agent Command Center
Copy pageCopy page
Manage all of your Devin Desktop agents — local and cloud — from a single view inside Devin Desktop.
Copy pageCopy page
The Agent Command Center is a new surface inside Devin Desktop 2.0 for managing every agent you have running, both local and cloud, in one place.
- **Local agents** — Agent sessions running in your editor.
- **Cloud agents** — Devin sessions running on their own VMs.
Opening the Agent Command Center
You can switch to the Agent Command Center directly from Devin Desktop without leaving the editor.
Working in a session
A few things make it faster to drive a session from the agent window:
- **Add to chat** — select text inside a message transcript and send it to the input with the **Add to chat** button or `Cmd/Ctrl+L`.
- **Duplicate session** — branch off a conversation from the response footer to explore an alternative without losing the original (Devin Local).
- **Rules in the @-mention menu** — pull a manual-trigger rule into the conversation (Devin Local).
- **Editable queued messages** — a message queued while the agent is working can be edited before it sends (Devin Local).
Sessions are locked while their agent is running: they appear greyed out and are read-only until the agent finishes. If you are signed out, session tabs show a sign-in prompt rather than an error.
Agent sidebar
The sidebar lists every session in the workspace and can be shaped to fit how you work:
- Filter, sort, and group sessions per workspace.
- Right-click a session for its context menu, or double-click it to rename it.
Notifications
Devin Desktop can send a single native OS notification when an agent session finishes or needs your input while Devin Desktop is in the background. One setting covers every agent — Devin Local and ACP agents alike — so you get one notification per session rather than one per surface. Notifications are off by default. Turn them on with the `devin.agentNotifications` setting.
Working with the editor
The Agent Command Center does not replace the editor. It is integrated with the existing Devin Desktop editor features so you can always jump back into a session and make last-mile edits manually. You can always go back to the Devin Desktop you know and love.
