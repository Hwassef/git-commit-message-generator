# Git Commit Message Generator

This is a Visual Studio Code extension that generates commit message suggestions based on the changes in your Git repository. The extension uses a combination of Git diffs and AI-powered content generation to suggest well-formatted commit messages that can be copied to your clipboard with a single click.

## Features

- **Automatically Generate Commit Message**: The extension analyzes your Git changes (modified, added, or deleted files) and generates a commit message based on the context.
- **AI-Powered Commit Suggestions**: The extension uses a generative language model to craft a concise commit message with a brief description and a detailed explanation.
- **One-Click Commit Message Copy**: The generated commit message is automatically copied to your clipboard so that you can use it with the `git commit` command.

## Prerequisites

- Visual Studio Code (VSCode)
- Git installed and initialized in the workspace
- An active internet connection (required to fetch commit suggestions from the API)

## Installation

1. Open **VSCode**.
2. Navigate to the Extensions view by clicking on the Extensions icon in the Activity Bar on the side of the window.
3. Search for `Git Commit Message Generator`.
4. Click the **Install** button.

Alternatively, you can install it from the marketplace or by downloading the `.vsix` file and running the command:

```bash
code --install-extension <extension-file>.vsix
