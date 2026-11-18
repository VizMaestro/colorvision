# Installation

## From the packaged build (recommended for testers)

1. Unzip `release/colorvision-1.0.0.zip` into a folder you will keep (Chrome loads the extension from that folder).
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped folder.
4. Pin ColorVision from the puzzle-piece menu so the icon is always visible.
5. Click the icon, pick your **color vision profile**, switch the toggle **on**. Open or reload a website.

Tabs that were already open when you installed need a reload (the popup tells you when this applies).

## From source

```bash
npm install
npm run build          # type-checks, then builds dist/
```

Then **Load unpacked** and choose the `dist/` folder.

## Using it

| Control | What it does |
| --- | --- |
| Switch (top right) | Master on/off. Turning it off removes correction from every open page immediately. |
| Status card | What is happening on the current site, with *Pause on this site* / *Resume*. |
| Profile | Protanomaly, Protanopia, Deuteranomaly, Deuteranopia, Tritanomaly, Tritanopia. The two "-omaly" profiles are milder; the "-opia" profiles assume the cone type is missing. If unsure, start with the "-omaly" profile for your type and use *Personal calibration*. |
| Intensity | 0 to 100 %. Lower is more natural; higher separates colors more. |
| Natural / Enhanced | Natural keeps pages familiar; Enhanced separates confusable colors more strongly and changes hues more. |
| Preview | Original vs corrected on a sample scene. "Simulate my profile" shows an approximate model of how each may look with your profile (a model, not your actual vision). |
| Apply automatically | On: every website. Off: only sites you enable one by one. |
| Correct video | On by default. Off applies a partial, approximate reversal to video. |
| Personal calibration | A short guided comparison that tunes strength, mode and a relative severity for your selected profile. |
| Alt+Shift+C | Keyboard shortcut to toggle correction (can be changed at `chrome://extensions/shortcuts`). |

## Troubleshooting

* **Nothing changes on a page**: ColorVision cannot run on `chrome://` pages, the Chrome Web Store, the built-in PDF viewer or `file://` pages. For ordinary sites, reload the tab. In Incognito you must allow the extension in its details page.
* **Colors look too strong**: lower the intensity or choose Natural.
* **A page looks wrong**: use *Pause on this site* and please report it (see `KNOWN_LIMITATIONS.md`).

## About the "all sites" access warning

ColorVision applies its color filter by running on web pages, so Chrome lists its **Site access** as *On all sites* and the install prompt can say it may "read and change all your data on all websites". ColorVision only adds the filter and never reads, stores or sends page content (see `PRIVACY_POLICY.md`). To limit it, open `chrome://extensions`, click **Details** on ColorVision and set **Site access** to *On click* or *On specific sites*. On pages where Chrome withholds access, the popup shows the page as not adjustable.
