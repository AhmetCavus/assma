# assma

An interactive, bilingual design for a local project acquisition assistant. Open the German or English landing page, switch themes and try all three example questions. The **Demo öffnen** / **Open demo** button opens a fictional freelancer's workspace.

## Run locally

Run `python3 serve_local.py` from this directory, then open `http://127.0.0.1:8788/`. Python 3.9 or later is sufficient. The static screens, example dialogue, CV editor, PDF and Markdown exports work without a model.

For free-form questions and extraction from pasted listings, start Ollama on this computer with an installed local chat model. You can set `ASSMA_MODEL` to its installed name before starting the server. The assistant shows the connected model name when available. The adapter's only model endpoint is the loopback address on port 11434. No cloud fallback is configured.

## Dashboard, progress and the assistant

The workspace opens on **Dashboard**. **Progress** counts recorded email and portal submissions by week or calendar month. The same application can have more than one submission. Notes and follow-ups do not increase that count. The interview metric shows the current status of projects submitted during the selected period.

The assistant opens at the bottom centre of the workspace. Hold **Space** to speak, release to ask, press **/** to type and **?** for the shortcuts. **Ctrl/Cmd + J** or the grape button starts and stops the microphone. **Esc** cancels a recording or pending reply. Keys **1–4** open Dashboard, Projects, Experience and Progress. Single-key shortcuts leave text fields and native controls alone.

Voice input uses an installed on-device browser language pack when supported. If one is offered, install it from the assistant and hold Space again. For local voice on other browsers, install FFmpeg and the **whisper-cli** executable from whisper.cpp. Set the environment variable `ASSMA_WHISPER_MODEL` to the absolute path of a local multilingual whisper.cpp model before starting `serve_local.py`. The adapter transcribes up to 60 seconds on this computer and removes the temporary audio and transcript when it finishes. Optional spoken replies use an installed system voice for the chosen language.

## Scope of the walkthrough

The online design uses fictional data. Project and application edits last for the current page session. Theme and language preferences persist in the browser. Email delivery is simulated. The portal flow records a manual submission, with an optional copy of the uploaded PDF. Reopen an original attachment or generate Markdown or PDF from the frozen submission data.

The example listing link can be used directly. For other listings paste the visible description or enter the fields manually. Production URL retrieval, the freelancer's mail account and persistent Yappio storage are described in the English concept.

## Brand and links

The grape uses the two four-point white highlights of ellma’s apple mark. The interface follows the public [ellma landing page](https://ellma.yappai.de/). The GitHub button currently opens [Ahmet Cavus on GitHub](https://github.com/AhmetCavus). Its destination is set in `dist/model.js`.

The bundled font and PDF library carry their licences under `dist/licenses`.


## Design files

Open **assma-Landingpage.html** for the standalone walkthrough. **assma-Concept.md** links the screens. **assma-Design.pdf** contains the illustrated directory, capability map and C3 component diagram. The **brand**, **architecture** and **screens** directories contain the logo, diagrams and browser captures.

The individual PNG screen exports are in **screens/png**. The landing-page theme comparison is in **screens/assma-dark-light.jpg**.
