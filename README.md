# OpenClaw Code (OCC)

OpenClaw AI chat assistant for VSCode/Windsurf.

## Features

- 💬 Chat with OpenClaw AI
- 🔄 Real-time streaming responses
- 📝 Automatic code context inclusion
- 🎨 Markdown rendering with code highlighting

## Setup

1. Install the extension
2. Configure your OpenClaw Gateway token in settings:
   - Open Settings (Cmd+,)
   - Search for "OpenClaw"
   - Set `OCC: Gateway Token`

## Usage

1. Click the OpenClaw icon in the sidebar
2. Type your message in the input box
3. Press Send or Enter to chat
4. Select code in editor to automatically include it in context

## Requirements

- OpenClaw Gateway running locally at http://127.0.0.1:18789
- Valid authentication token

## Configuration

- `occ.gatewayUrl`: OpenClaw Gateway URL (default: http://127.0.0.1:18789)
- `occ.gatewayToken`: Authentication token for Gateway

## Version

0.1.0 - MVP Release
