**title** — `task#3869d1c2-a68b-4c91-bf03-b87a243113ef: create gh issue after spec creation`

**summary** — After a spec is completed in Legion, the workflow should allow the user to create a GitHub issue from that finished spec so the work can move directly into issue tracking.

**userStories**

`US1: create GitHub issue from finished spec`  
User story: `I want to create a GitHub issue after finishing a spec, so that I can turn the approved spec into a tracked work item without leaving the workflow.`  
Acceptance Criteria:
- When a spec has been finished, the system shall provide an action to create a GitHub issue from that spec.
- When the user triggers GitHub issue creation from a finished spec, the system shall create exactly one GitHub issue using the spec content required by the integration.
- When the GitHub issue is created successfully, the system shall display the created issue reference to the user.
- If GitHub issue creation fails, then the system shall throw an explicit error and shall not report the issue as created.

Edge Case:
- Finished spec exists but required issue data is missing.
- External GitHub request fails or returns an error.
- User retries after a failed creation attempt.
- Duplicate issue creation is triggered for the same finished spec.
