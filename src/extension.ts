import * as vscode from 'vscode';
import fetch from 'node-fetch';
import simpleGit from 'simple-git';

// Define the expected response structure
interface CommitSuggestionResponse {
	candidates: Array<{
		content: {
			parts: Array<{ text: string }>;
		};
	}>;
}

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('extension.generateCommitMessage', async () => {
		// Fetch git status or diff to find the changes
		const commitMessage = await generateCommitMessageFromGitChanges();

		if (!commitMessage) {
			return; // Exit if no commit message is generated
		}

		// Make the API call to generate the commit message suggestion
		const generatedCommit = await fetchCommitSuggestion(commitMessage);

		if (generatedCommit) {
			// Clean the commit message and copy it to the clipboard
			const cleanedCommit = cleanCommitMessage(generatedCommit);
			await vscode.env.clipboard.writeText(cleanedCommit);
			vscode.window.showInformationMessage('Commit message copied to clipboard!');
		}
	});

	context.subscriptions.push(disposable);
}

// Function to clean the commit message and remove anything before 'git commit -m'
function cleanCommitMessage(commitMessage: string): string {
	// This regular expression will match 'git commit -m' followed by quoted text.
	// It will capture multiple occurrences of '-m "text"'.
	const gitCommitPattern = /git commit -m "([^"]*)"/g;

	// Find all matches of the commit message with -m
	const matches = [...commitMessage.matchAll(gitCommitPattern)];

	// If there are any matches, join them together with the commit command format
	if (matches.length > 0) {
		// Construct the commit string by joining all -m parts
		const commitCommand = matches.map(match => `git commit -m "${match[1]}"`).join(' ');
		return commitCommand;
	}

	// If no matches were found, return the original commit message (or handle if needed)
	return commitMessage.trim();
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Clean up if necessary
}

// Function to generate a commit message from Git changes
async function generateCommitMessageFromGitChanges(): Promise<string | null> {
	try {
		// Get the current workspace folder
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('No workspace folder found.');
			return null;
		}

		// Detailed logging
		console.log('Workspace Folder Path:', workspaceFolder.uri.fsPath);

		// Initialize the Git client with the workspace folder path
		const gitClient = simpleGit(workspaceFolder.uri.fsPath);

		try {
			// Check if it's a git repository first
			const isRepo = await gitClient.checkIsRepo();
			console.log('Is Git Repository:', isRepo);

			if (!isRepo) {
				vscode.window.showErrorMessage('Not a Git repository. Please initialize a Git repository first.');
				return null;
			}
		} catch (repoError) {
			console.error('Repository Check Error:', repoError);
			vscode.window.showErrorMessage(`Repository check failed: ${repoError instanceof Error ? repoError.message : 'Unknown error'}`);
			return null;
		}

		// Get the status of the git repository
		const status = await gitClient.status();
		const detailedChanges = {
			modified: [] as Array<{
				file: string;
				additions: number;
				deletions: number;
				changes: string[];
				diffDetails: string[];
			}>,
			created: status.created,
			deleted: status.deleted,
			renamed: status.renamed
		};

		// For each modified file, get detailed diff stats
		for (const file of status.modified) {
			const diffSummary = await gitClient.diffSummary([file]);
			const diff = await gitClient.diff([file]);

			// Parse the diff output to get specific changes
			const changes = diff
				.split('\n')
				.filter(line => line.startsWith('+') || line.startsWith('-'))
				.filter(line => !line.startsWith('+++') && !line.startsWith('---'))
				.map(line => {
					const prefix = line.startsWith('+') ? 'Added' : 'Removed';
					return `${prefix}: ${line.substring(1).trim()}`;
				})
				.filter(line => line.length > 0);

			detailedChanges.modified.push({
				file,
				additions: diffSummary.insertions,
				deletions: diffSummary.deletions,
				changes,
				diffDetails: changes
			});
		}

		// If no changes are detected
		if (!detailedChanges.modified.length &&
			!detailedChanges.created.length &&
			!detailedChanges.deleted.length) {
			return null;
		}

		// Construct a detailed commit message
		const commitMessageParts: string[] = [];

		if (detailedChanges.modified.length > 0) {
			for (const change of detailedChanges.modified) {
				const fileMessage = `Modified ${change.file} (+${change.additions}/-${change.deletions}):`;
				const changeDetails = change.diffDetails
					.map(detail => `    ${detail}`)
					.join('\n');

				if (changeDetails.trim()) {
					commitMessageParts.push(`${fileMessage}\n${changeDetails}`);
				} else {
					commitMessageParts.push(fileMessage);
				}
			}
		}

		if (detailedChanges.created.length > 0) {
			commitMessageParts.push(`Added: ${detailedChanges.created.join(', ')}`);
		}

		if (detailedChanges.deleted.length > 0) {
			commitMessageParts.push(`Deleted: ${detailedChanges.deleted.join(', ')}`);
		}

		const commitMessage = commitMessageParts.join('\n\n');
		console.log('Detailed Changes:', detailedChanges);

		return commitMessage;

	} catch (error) {
		console.error('Error getting detailed changes:', error);
		vscode.window.showErrorMessage(`Error fetching Git changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return null;
	}
}

async function fetchCommitSuggestion(commitMessage: string): Promise<string | null> {
	try {
		console.log('Sending Commit Message to API:', commitMessage);

		const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyBrVRiYVnxlFDIFrvuJOVKJVw0CVWhxOEU', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: [{ role: 'user', parts: [{ text: "Changes made " + commitMessage.replace(/['\n\r"]/g, '') }] }],
				systemInstruction: {
					role: 'user',
					parts: [{
						text: 'Generate commit suggestion under context only one commit make it the best and show it as commit command also make sure to add commit description follow this format of commit git commit -m "brief desciption" -m "detailed description" don"t make it way too long'
					}]
				},
				generationConfig: {
					temperature: 1,
					topK: 40,
					topP: 0.95,
					maxOutputTokens: 8192,
					responseMimeType: 'text/plain'
				}
			})
		});

		console.log('API Response Status:', response.status);

		if (!response.ok) {
			const errorText = await response.text();
			console.error('API Error Response:', errorText);
			throw new Error(`Failed to fetch commit suggestion: ${errorText}`);
		}

		const data = await response.json() as CommitSuggestionResponse;
		console.log('API Response Data:', JSON.stringify(data));

		// Ensure that the response contains the expected data structure
		if (data && data.candidates && data.candidates[0].content.parts[0].text) {
			const commitSuggestion = data.candidates[0].content.parts[0].text;
			console.log('Generated Commit Suggestion:', commitSuggestion);
			return commitSuggestion;
		} else {
			console.error('Invalid commit suggestion structure');
			vscode.window.showErrorMessage('Invalid commit suggestion structure.');
			return null;
		}
	} catch (error) {
		console.error('Full Fetch Error:', error);
		if (error instanceof Error) {
			vscode.window.showErrorMessage('Error generating commit suggestion: ' + error.message);
		} else {
			vscode.window.showErrorMessage('An unknown error occurred');
		}
		return null;
	}
}