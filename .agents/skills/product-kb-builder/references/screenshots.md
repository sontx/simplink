# Screenshots

Screenshots make exported guides easier to follow: a reader sees the screen they should be on and
the control to press. Agents never see the image, only its alt text, so a screenshot helps the
agent only as much as its alt text describes the screen. A wrong or stale screenshot does more harm
than none, so add few, accurate ones.

## Contents

1. Which nodes get images
2. Which steps get one
3. Plan the shots
4. Launch the product
5. Write the shot list
6. Capture and compress
7. Link them in the node
8. Verify
9. Update mode

## 1. Which nodes get images

| Node type  | Image                                                       | How many                 |
| ---------- | ----------------------------------------------------------- | ------------------------ |
| procedure  | The screen at a step, with the control the step acts on     | 0–4; only steps that need one (§2) |
| state      | What the state looks like when it's true (badge, banner, status) | 0–1                  |
| capability | One overview of the feature's main screen                    | 0–1, only for a UI feature |
| goal       | **None.** Its guide shows its procedures' step images itself | 0                        |
| constraint | **None.** Quote the error message as text; it's searchable    | 0                        |
| `simp.md`  | None by default; one product overview only if the user asks  | 0–1                      |

Never add images to API-only or CLI-only procedures, or to screens behind data you can't show (§4).

## 2. Which steps get one

Give a step an image when a reader could get lost there:

- It lands on a **new screen or dialog** (the first step of a procedure, a wizard step, a modal).
- The control is **hard to find**: in a menu, a dropdown, an icon-only button, a crowded toolbar.
- The step fills a **dense form** where the reader needs to see which fields matter.
- The result is **visual**: a status badge, a preview, a highlighted row.

Skip the image when:

- The step is a plain click on an obvious, labeled button on a screen already shown.
- The screen is the same as the previous step's image.
- The step is a decision (`choice:` items); the options are text.
- The same screen is already shown in another procedure: link that procedure instead of copying.

Rule of thumb: at most one image per step, and usually fewer images than steps.

### One screen, many steps

When consecutive steps happen on the same screen, such as filling a form field by field and then
pressing Save, take **one** image and mark each step's control with its step number. Don't take one
image per field:

- One image covers a run of consecutive steps on one screen: `"steps": [2, 3, 4]`.
- Each marker's `label` is the number of the step that uses that control, so the reader matches
  marker 3 to step 3. Mark only the controls the steps name, not every field on the form.
- If the screen changes partway (a dialog opens, the page navigates), start a new image there.
- More than about six markers gets hard to read: split the run, or crop to the part that matters.

## 3. Plan the shots

Before launching anything, add a `screens` note per node in `kb/INVENTORY.md`, e.g.
`screens: step 1 (form), step 3 (beneficiary table)`. When the user reviews the inventory, they also
approve the screens. Ask about:

- The **data**: seeded or demo data only. Never real customer data, names, emails, account numbers,
  tokens, or API keys.
- **Sign-in**: which demo account or persona to use. Ask the user to sign in themselves when it needs
  a password; never type or store credentials in the shot list.
- **Language**: capture the UI in the KB's language, so labels in images match labels in steps.

## 4. Launch the product

1. Find the documented way to run it: a project skill (for example a `run` skill), `CLAUDE.md`,
   `AGENTS.md`, `README`, or the `package.json` / `Makefile` scripts. Use that way; don't invent one.
2. Start what the UI needs (backend, database, seed data) the same way. If it needs services you
   can't start, or credentials you don't have, stop and ask instead of capturing a broken screen.
3. Run long-lived servers in the background, wait until the URL answers, and stop them when done.
4. Open each screen once by hand (or with a quick script) to find stable selectors before writing
   the shot list.

## 5. Write the shot list

Keep the recipe in the KB as `kb/assets/shots.json`, so anyone can capture the images again after
the UI changes. The loader skips non-Markdown files, so it never enters the graph.

```json
{
  "baseUrl": "http://localhost:3000",
  "viewport": { "width": 1280, "height": 800 },
  "locale": "vi-VN",
  "timezoneId": "Asia/Ho_Chi_Minh",
  "highlightColor": "#2563eb",
  "setupUrl": "/",
  "setup": [{ "click": "role=button[name='Tài khoản demo']" }],
  "shots": [
    {
      "out": "assets/team/invite-member-open.webp",
      "node": "procedure.team.invite-member",
      "step": 1,
      "url": "/settings",
      "actions": [{ "click": "role=tab[name='Thành viên']" }],
      "highlight": ["role=button[name='Mời thành viên']"],
      "mask": ["[data-testid=member-email]"],
      "clip": "main"
    },
    {
      "out": "assets/team/invite-member-form.webp",
      "node": "procedure.team.invite-member",
      "steps": [2, 3, 4],
      "url": "/settings",
      "actions": [
        { "click": "role=tab[name='Thành viên']" },
        { "click": "role=button[name='Mời thành viên']" }
      ],
      "highlight": [
        { "selector": "role=textbox[name='Email']", "label": 2 },
        { "selector": "role=combobox[name='Vai trò']", "label": 3 },
        { "selector": "role=button[name='Gửi lời mời']", "label": 4 }
      ],
      "clip": "role=dialog"
    }
  ]
}
```

| Key                         | Meaning                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `out`                       | Image path relative to the KB root, under `assets/<area>/`; `.webp` (default choice), `.png`, `.jpg` |
| `node`, `step` or `steps`   | The node and the step (or run of steps) it shows; the script warns when that node doesn't link the file yet |
| `url`, `actions`            | Where to go and what to do first: `click`, `fill` + `value`, `select` + `value`, `check`, `hover`, `press`, `waitFor`, `wait` (ms), `goto`, `evaluate` |
| `highlight`                 | Controls to frame: selectors, or `{ "selector", "label" }`. A `label` (1–3 letters or digits, usually the step number) puts a numbered marker beside the control; several plain selectors are numbered 1, 2, … in order. With `steps`, every number label must be one of them |
| `mask`                      | Anything personal or changing (emails, names, dates, avatars, IDs) gets painted over          |
| `clip`, `padding`           | Crop to this element plus padding (default 16 px; 44 px on the left when markers are labeled, so they fit), which keeps a highlight on the edge intact |
| `fullPage`                  | Whole scrolling page; avoid it, long images are big and hard to read                         |
| top: `setup`, `setupUrl`    | Run once before the shots (choose a demo persona, accept a banner)                           |
| top: `quality`, `maxWidth`, `budgetKB` | Compression (default 80), resize width (default 1600 px), size warning (default 250 KB) |
| top: `highlightColor`       | Pick a color that contrasts with the product's brand color                                    |

Selectors are Playwright selectors. Prefer roles and visible labels (`role=button[name='Lưu']`,
`text=Thành viên`) over CSS classes. They survive restyling, and they name the same labels as
your steps, so when a label is renamed the shot fails exactly where the step text is stale too. Use
the product's `data-testid` attributes for controls without a stable label.

Every selector must match **exactly one** element: a shot fails when it matches none or several.
Otherwise a UI change that adds a second "Lưu" button would silently highlight the wrong one. When
the first of several is really meant, say so: `role=row >> nth=0`. Masks are the exception; they
cover every match. Unknown keys are errors, so a misspelled key never silently does nothing.

Mask anything that moves or changes between runs: clocks, relative dates, counters, avatars,
animated backgrounds. Otherwise every run reports the image as changed (§9).

Framing:

- **First step of a procedure:** the whole viewport, so the reader sees where they are (menu, header).
- **Later steps:** `clip` to the panel, dialog, or form the step works in.
- **A run of steps on one form:** `clip` to the form, with a labeled marker per step (§2).
- **States:** `clip` to the indicator and the area around it; highlight the indicator itself.
- **Capabilities:** the main screen of the feature, with no highlight.

## 6. Capture and compress

### Dependencies

| Needs                                | Version                     | Where it comes from                                                                                  |
| ------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Node.js                              | 20 or newer (tested on 22)  | Already on the machine                                                                               |
| `playwright` (or `playwright-core`)  | 1.64.1, the tested version  | The current directory or `--deps <dir>`                                                              |
| `sharp`                              | 0.35.5, the tested version  | Same                                                                                                 |
| A browser                            | Any current one             | Installed Chrome or Edge; otherwise Playwright's Chromium                                            |

The pinned versions live in one place, `DEPS` at the top of `capture.mjs`. **Run `--check` first**,
before launching the product. It validates the shot list (or skips it while none exists), loads both packages, and starts and closes
a headless browser. Then it prints `ready: …` with the versions found, or exactly what's missing and
the install command with the pinned versions.

When something is missing, ask the user before installing anything, and never add these packages to
the product's own dependencies. Install them in a scratch folder:

```bash
npm i --prefix <scratch>/capture-deps playwright@1.64.1 sharp@0.35.5
npx --prefix <scratch>/capture-deps playwright install chromium   # only if Chrome and Edge are missing
#   Linux: playwright install --with-deps chromium (installs system libraries, needs root: ask first)
node <skill>/scripts/capture.mjs --kb kb --deps <scratch>/capture-deps --check
```

sharp downloads a prebuilt binary for the platform during `npm i`; an offline or proxied machine
needs the user's help. When `--check` reports other versions than the tested ones, capture one shot
and look at it before capturing the rest.

### Run

```bash
node <skill>/scripts/capture.mjs --kb kb --deps <dir> --check   # shot list, dependencies, browser
node <skill>/scripts/capture.mjs --kb kb --deps <dir>           # capture every shot
node <skill>/scripts/capture.mjs --kb kb --deps <dir> --only procedure.team.invite-member
```

Leave out `--deps` when the packages are already installed in the current directory.

The script opens a headless Chrome or Edge, runs each shot's actions, paints the masks, crops, and
measures each highlighted control. It draws the frames and markers onto the captured image, not into
the page, so a modal dialog, a popover, a sticky header or an `overflow: hidden` container can never
hide them, and the page's layout never shifts. A marker sits beside its control on the left, so it
covers neither the control nor its field label. Then it compresses with sharp: it resizes to `maxWidth` and writes WebP at `quality`
(a PNG output is palette-quantized; a JPEG output uses mozjpeg). It prints each file's size and warns
over `budgetKB`. Over budget, crop with `clip` before lowering `quality`: a crop removes bytes and
noise, a lower quality blurs text.

Options: `--base-url` overrides `baseUrl`; `--storage-state auth.json` reuses a signed-in session the
user saved (keep that file out of the KB and out of Git); `--headed` shows the browser while you fix
a shot.

Then look at every image yourself (open it). Recapture when the highlight is on the wrong control,
a mask missed personal data, a spinner or toast is visible, or the screen isn't the one the step
describes.

## 7. Link them in the node

Write the image as Markdown inside the step it belongs to, indented under the step, with a path
relative to the node file:

```md
## Steps

1. Mở **Cài đặt**, chọn thẻ **Thành viên** rồi bấm **Mời thành viên**.

   ![Thẻ Thành viên trong Cài đặt: nút Mời thành viên ở góc phải phía trên danh sách thành viên](../../assets/team/invite-member-open.webp)

2. Nhập **Email** và chọn **Vai trò**.
```

- An image inside a `## Steps` item belongs to that step: plans attach it there, agents read its alt
  text as a `Screen:` line, and goal guides show it under the step.
- **One image for several steps** (§2): put it under the **first** step it covers. In its alt text,
  list the markers in order, so an agent knows every control without the image. In the later steps,
  name the marker after the label, so a reader can find it in the image above:

  ```md
  2. Nhập địa chỉ **Email** của người được mời (2).

     ![Hộp thoại Mời thành viên: (2) Email, (3) Vai trò, (4) nút Gửi lời mời](../../assets/team/invite-member-form.webp)

  3. Chọn **Vai trò** (3).
  4. Bấm **Gửi lời mời** (4).
  ```
- A state's image goes in its body; a capability's image goes in its body, near the top.
- **Alt text** is all an agent sees. Write it in the KB's language and describe the screen and what is
  highlighted: _"Trang Hồ sơ: trường Tên hiển thị và Múi giờ, nút Lưu thay đổi được đánh dấu"_. Not _"ảnh chụp màn hình"_, not the file name. About one sentence; lint flags empty alt
  text (W111).
- Never put the image on a `choice:` step line, and never inline image data (base64).

## 8. Verify

1. `npx simp-lint kb`: no W110 (missing file) or W111 (no alt text).
2. Every shot with a `node` is linked (the capture script prints `UNLINKED` otherwise).
3. `npx simp-resolve <goal> --kb kb`: each image's alt text appears as `Screen:` under the right step.
4. `npx simp-docs --kb kb --out <scratch>/docs`, then open a goal guide and a procedure page: the
   images load next to their steps, and the copied files are under `<scratch>/docs/assets/`.
5. Report the image count and total size of `kb/assets/`.

## 9. Update mode

Screens change, so the shot list breaks over time. The script is built to tell you how, instead of
quietly producing a wrong image. Recapture the shots of every node whose `sources` changed
(`capture.mjs --only <node id>`), or all of them after a large UI change, and read each line:

| Result                               | Meaning                                                                                  | What to do                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `same`                               | Nothing visible changed. The file is not rewritten, so Git shows no change               | Nothing                                                                                                                                                                 |
| `CHANGED … (n% of pixels)`, `REVIEW` | Every selector still matched, but the screen looks different. The new image is written   | Open it. If labels, fields, or order changed, update the alt text and the steps it covers; the step text is usually stale too. Check the old one with `git diff`       |
| `CHANGED … (layout changed)`         | The crop changed shape: something was added to or removed from the screen               | The same, and check that the crop still shows what the steps need                                                                                                      |
| `FAIL … matches nothing; <role> names on the page now: …` | A control was renamed, moved, or removed. The **previous image is kept** | A rename: put the new name in the selector **and** in the step text and alt text. A removal: the procedure changed, so update the node first, then the shot           |
| `FAIL … matches N elements`          | A selector became ambiguous, often because a second similar control appeared             | Make it specific (scope it: `form >> role=button[name='Lưu']`), or add `>> nth=0` if the first is meant                                                                  |
| `FAIL … is outside the captured area` | A highlighted control moved out of the crop                                              | Fix `clip`, or split the shot                                                                                                                                           |

Then:

1. If steps were added, removed, or reordered, move each image with its step, and update `step` /
   `steps` and the marker labels so they match the new step numbers.
2. Never "fix" a failing shot by deleting its highlight or image unless the step itself is gone.
3. Delete image files that no node links anymore, and their shots.
4. A `CHANGED` on every run means something on screen moves (a clock, an animation): mask it.
