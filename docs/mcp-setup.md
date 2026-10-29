# Project MCP connections

Verified on 29 October 2026 in this chat. Connections belong to the signed-in app account; they are not credentials to commit or copy into `.env`.

| Integration | Project use | Verified state |
| --- | --- | --- |
| GitHub | Read repository changes, PRs, Actions jobs/artifacts and commit statuses; make authorized repository changes | Authenticated as `Mikazukiangus`; access to `Mikazukiangus/NYP_Bus_tracker` on `main`; current account reports read/push/admin access |
| Vercel | Inspect deployments/build/runtime logs, exact release status, domains and project configuration; perform authorized releases/settings changes | Existing `nypbus-tracker` project under `carbon-bc04` is accessible; Node 24 / Vite; production deployment is READY |
| Browser automation | Inspect the rendered app, click controls and capture screenshots during interactive work | Available in the current environment; no additional connector is required |
| Playwright Test | Repeatable browser regression tests, screenshot comparisons and failure traces | Installed as a pinned project development dependency; see [browser testing](testing.md#real-browser-regression-tests) |

GitHub commit status for `46ef251dd9d07c5290ed60caf8c7204156255a00` reports Vercel success. Vercel project readback identifies production deployment `dpl_EuHF4uakxR8vfLCNLdL6mxmYvLru` as READY, with `nypbus-tracker.vercel.app` among its domains. These are connection/readback checks, not a new deployment or a mutation test. Existing access was reused; no token, new account, duplicate project or permission change was needed.

## Using the connections

Ask, for example, “Check GitHub CI for this commit and inspect the matching Vercel deployment logs,” or “Run the Playwright critical flows and inspect the screenshots before changing the UI.” Repository changes are made locally so they can be reviewed and tested together. Continue using the existing Git-triggered Vercel build gate for releases.

In a new chat, check whether the GitHub and Vercel tools are available and perform a repository/project read before assuming the connections transferred. If missing, connect the named service through the app's plugin connection UI and select this repository/team in the provider's authorization flow. Keep authentication in that flow; do not paste personal access tokens into chat or add credentials to MCP configuration in the repository. This project does not need a database connector because it currently has no application database or login.

Playwright Test is separate from a Playwright MCP server: the former runs assertions in this repository, while an MCP server exposes interactive browser tools to an agent. The plugin directory search returned no Playwright plugin in this session; native browser access and the local runner already cover the present task. No additional browser server was installed. Broad filesystem/shell or database MCP servers add no necessary capability here.
