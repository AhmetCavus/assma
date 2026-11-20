# assma

**A local assistant for freelance project acquisition.** A freelancer can open a listing, see which requirements their work actually supports, tailor a CV and later recover exactly what went into the application.

[Open the interactive design](assma-Landingpage.html#home) · [Design book](assma-Design.pdf) · [Logo](brand/assma-logo.png)

## The landing page

**“Deine Erfahrung. Dein nächstes Projekt.”** The page follows the composition of ellma. A short promise sits on the left. On the right, a live project card and a reply from assma change together when the visitor chooses one of three questions.

| Visitor’s question | What assma shows |
| --- | --- |
| Does this project fit my experience? | A score with supporting references and an explicitly open requirement. |
| Which experience belongs in my CV? | The two projects that demonstrate the work requested in the listing. |
| Who needs a follow-up today? | The company, contact and due date of a recorded application. |

Below the example, three grape clusters illustrate **capture the project → match experience → apply with a tailored CV**. A short list of product facts and a final listing-link or brief input complete the page. The header provides GitHub, language, theme and workspace access. The light and dark themes retain the same hierarchy and darken or brighten the violet accent for contrast. The desktop layout becomes a single column on a phone.

The lowercase wordmark is **assma**. The grape cluster carries the same large white four-point star and small upper-right glint as ellma’s apple. The same mark identifies the local assistant in the hero, the workspace and the pulsing grape button. GitHub currently links to the owner’s public profile. The product can later lead into Yunome through its project and profile data.

## Capability map

| Capability | Minimum useful outcome |
| --- | --- |
| Maintain experience | Review general profile data, dates, roles and the freelancer’s own contributions. Confirm facts imported from a CV or enter them manually. |
| Understand a project | Store source, end client, agency, contact, requirements and tech stack. Review suggested fields and assess experience against each requirement. |
| Prepare an application | Select and order supported references, approve the wording and export Markdown or PDF. Use the chosen CV for email or record what was submitted through a portal. |
| Manage acquisition | Use Dashboard to find due follow-ups. In Progress, compare submissions by week or calendar month and see their channels. Open an application to recover its data and exact attachment, record a reply or set a follow-up. |

[Open the capability map](architecture/capability-map.png)

## The experience assessment

Each required skill carries two points and each preferred skill one. A confirmed contribution earns its full weight, partial evidence earns half and a missing reference earns zero. The result is scaled to 1–10 and rounded. A role without assessable requirements stays unscored. The assistant explains which reference supports each finding. Working terms such as location or remote share remain visible separately.

In the fictional Aster Care example, Mara built an offline Android check-in using Kotlin and Compose at Juniper Health, and tested ticket purchasing with TalkBack at Kite Transit. Her CI work at Atelier Tools partly supports release responsibility. She has no recorded FHIR R4 project. That gives **6.5 of 8 weighted points, or 8/10**. The CV draft selects Juniper and Kite. The user can edit it before applying.

## C3 component view

The proposed production system reuses Yappio. A React workspace calls private Node.js/TypeScript API controllers through the Yappio client and shares request and response types. The diagram opens the **assma backend** container.

| Component | Responsibility |
| --- | --- |
| API controllers and assistant context | Validate requests and select the active project, referenced evidence and permitted operation. |
| Profile and intake | Manage confirmed experience, preserve the original brief, fetch a public listing where possible and suggest fields from its text. For a gated portal, accept pasted text or manual entry. |
| Fit assessment | Associate each requirement with confirmed references. Return strengths, partial evidence, gaps and the explained score. |
| CV composition | Build a draft from selected evidence and export the approved wording as Markdown or PDF. |
| Application history | Coordinate mail-provider acceptance and manual portal records. Freeze each submission, track replies and follow-ups, and keep the original attachment. Compute period totals and channel counts from those submissions. |

The local inference adapter can use an installed open-weight model through Ollama. Yappio collections use a dedicated logical database in the existing MongoDB instance. Private file storage holds submitted artifacts. Yappio’s existing deployment infrastructure hosts the workspace and API. The mail provider and public listing sites are external systems. The portal submission itself is performed by the freelancer.

[Open the C3 component diagram](architecture/c3.png)

## What the application remembers

At confirmed email delivery or when the user records a portal submission, assma freezes the listing and company, channel and timestamp, profile fields, supporting references, requirement assessment, selected CV wording and any original file. For email it also retains recipient, subject and message. A portal record can explicitly state that no CV was uploaded.

Subsequent edits affect future drafts. From an application, the freelancer can choose the original submission, download the exact attached PDF, or generate a fresh Markdown or PDF from the frozen data. Notes, replies and follow-up dates belong to the existing application.

## Screen designs

The workspace opens on **Dashboard**, followed by **Projects**, **Experience** and **Progress**. All four views support German and English, light and dark themes, and the same keyboard shortcuts.

The assistant opens at the bottom centre of the workspace. Its pulsing grape, suggested next action and quick commands reflect the current screen. On Dashboard it identifies the first overdue contact. On Progress it can summarise the selected period. Opening the keyboard guide brings up a centred dialog. The grape also acts as a microphone button on touchscreens. The pulse respects reduced-motion preferences.

Hold **Space** to speak and release it to ask. **/** opens the text field and **?** shows all shortcuts. **Ctrl/Cmd + J** toggles listening and **Esc** cancels the current input or reply. **1–4** open the four pages in navigation order. Typing in a field preserves spaces, punctuation and letters.

| Screen | What to inspect |
| --- | --- |
| [Landing page](assma-Landingpage.html#home) | Interactive project and dialogue, three steps, final project input and GitHub. |
| [Dashboard](assma-Landingpage.html#dashboard) | First navigation item. See due follow-ups, total submissions, open applications and recent activity. |
| [Progress](assma-Landingpage.html#progress) | Switch between week and calendar month. Compare the preceding period, count companies and projects currently interviewing, inspect email versus portal and open individual submissions. |
| [Assistant](assma-Landingpage.html#dashboard?assma=chat) · [Keyboard shortcuts](assma-Landingpage.html#dashboard?assma=shortcuts) | Inspect the centred dock, push-to-talk, quick commands and keyboard guide. |
| [Project register](assma-Landingpage.html#opportunities) · [Archive](assma-Landingpage.html#archived) | Title, company, status, date/time, stack, filters and row actions. |
| [Capture a listing](assma-Landingpage.html#capture) · [Manual entry](assma-Landingpage.html#manual) | Review source and suggested fields side by side or enter the information directly. |
| [Experience profile](assma-Landingpage.html#experience) · [Review CV import](assma-Landingpage.html#import) | Confirm personal details, individual contributions and imported evidence. |
| [Experience fit](assma-Landingpage.html#fit) | Follow the 8/10 score back to its strengths, gaps and source references. |
| [Tailored CV](assma-Landingpage.html#cv) | Edit the summary, choose and reorder references, export Markdown or PDF. |
| [Email application](assma-Landingpage.html#email) · [Record portal application](assma-Landingpage.html#portal) | Select the CV, review the recipient or enter the actual portal submission time. |
| [Application detail](assma-Landingpage.html#application) · [Submission snapshot](assma-Landingpage.html#snapshot) | Compare activity with the recorded application and recover the exact original PDF. |
| [Reply, note or follow-up](assma-Landingpage.html#note) | Update the existing application’s status and next contact date. |

**How Progress counts.** Each recorded submission contributes one application on its submission date, including submissions to archived projects. Multiple submissions to the same company count once under companies. The interview metric counts distinct projects from that period whose current status is Interview. A note or planned follow-up does not create a submission.

## Running the design

The online preview uses fictional records and selectable example conversations. Email delivery is simulated. The browser keeps project edits for the page session and remembers the chosen language and theme.

The downloadable package also runs locally with `python3 serve_local.py`. Voice input can use the browser’s on-device language pack or, in a local installation, FFmpeg and whisper.cpp with a multilingual model. With an installed Ollama chat model, assma answers free-text questions and suggests fields from pasted listing text. In the static demonstration, the supplied example link opens the sample listing. For other links, paste the description or enter the fields. Live public-listing retrieval, persistent Yappio storage and mail-provider delivery belong to the production implementation.

