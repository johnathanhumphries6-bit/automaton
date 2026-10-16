# AI Workflow Starter Kit — Private Prototype

**Status:** private sample; not launched or customer-validated  
**Cost to create:** $0 additional spend  
**Scope:** help a small team plan one repetitive, low-risk workflow that uses an existing approved AI tool. This is not a promise of automation, accuracy, legal compliance, or savings.

## Example workflow: turn meeting notes into a draft action list

Use fictional notes only. Do not paste customer records, personal information, confidential business information, credentials, or other sensitive material into an AI service unless its use is specifically authorized.

### 1. Define the job

- **Trigger:** a team member finishes a meeting and has notes.
- **Input:** non-sensitive meeting notes that the team is permitted to process.
- **Output:** a draft list of action items, owners if explicitly stated, and due dates if explicitly stated.
- **Human owner:** the person who took the notes.
- **Success condition:** every proposed action is traceable to the source notes; unstated owners or dates are marked “not specified.”
- **Failure condition:** the draft invents commitments, omits a key decision, or changes the meaning of the notes.

### 2. Procedure

1. Remove personal or confidential details that are not necessary.
2. Check that the notes may be processed by the chosen tool under the team's existing rules.
3. Ask the approved tool to extract only explicit decisions and action items.
4. Require it to label missing owners and dates as “not specified.”
5. Compare each proposed action against the original notes.
6. Correct errors before sharing or acting on the draft.
7. Store the final result only in the team's approved location.
8. If a source statement is ambiguous, ask the meeting owner rather than guessing.

### 3. Reusable prompt template

> Convert the following permitted, non-sensitive notes into a draft action list. Include only actions supported by the notes. For each action, quote or identify the supporting phrase, list the owner only if explicitly stated, and list the due date only if explicitly stated. Mark missing details as “not specified.” Do not invent decisions, deadlines, names, or commitments. End with a short “needs human review” list for ambiguous items.
>
> Notes:
> [Paste fictional or otherwise approved notes here.]

### 4. Acceptance checklist

- [ ] Every action item is supported by source text.
- [ ] Missing owner/date details are clearly marked.
- [ ] No new commitment or decision was invented.
- [ ] Ambiguous statements are flagged for human review.
- [ ] Output is checked against the source before anyone relies on it.
- [ ] Only an approved tool and approved storage location were used.
- [ ] No sensitive data was sent to an unapproved service.

### 5. Fictional test case

**Input**
- “We should check the onboarding email next week.”
- “Maya will draft a shorter version by Friday.”
- “The team liked the new outline.”

**Expected output**
- Action: check the onboarding email. Owner: not specified. Due date: next week (source is imprecise; confirm exact date).
- Action: draft a shorter version. Owner: Maya. Due date: Friday (confirm the intended calendar date).
- “The team liked the new outline” is feedback, not an action item.

**Pass/fail rule:** fail the test if the tool invents an owner for the first action, converts “next week” into a specific date, or treats the positive feedback as a new task.

## Limitations

- This is a static template, not an integrated product or an autonomous agent.
- It has not been tested with real users or real customer data.
- No willingness-to-pay or revenue claim has been validated.
- No external publication, customer contact, account creation, or spend has occurred.
