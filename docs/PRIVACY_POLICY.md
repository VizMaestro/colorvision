# ColorVision Privacy Policy (draft)

*Draft for review by the publisher's legal/privacy team before publication. Replace the bracketed items.*

**Last updated:** [date]  **Publisher:** [name / organization]  **Contact:** [email]

## Summary

ColorVision does not collect, transmit, sell or share any personal data. It has no accounts, no analytics, no advertising, no tracking and no servers. All processing happens on your device.

## What the extension stores

Stored **only on your device** in `chrome.storage.local`:

* your chosen color vision profile, correction intensity and mode;
* your on/off and "apply automatically" preferences, and per-website pause/enable choices (website host names you set a rule for);
* if you run Personal calibration: a relative severity number, a strength and a mode.

The calibration result is a display setting. It is **not** a medical record and is not a diagnosis. Your individual answers during calibration are not saved; only the resulting settings are.

You can erase everything with **Reset settings** in the popup, or by removing the extension.

## What the extension does with web pages

On pages you visit, it adds a color filter to the page's display. It does not read, copy, store or transmit page content, form data, URLs, cookies or browsing history. The extension's code does not make network requests; this is checked by an automated test that fails if any request leaves the local machine.

## Permissions, explained

* **Storage**: to save the settings above.
* **Run on web pages (http/https)**: required to apply the color filter on the sites you browse. Chrome therefore shows this as access to "all sites" (it may warn that the extension can "read and change all your data on all websites"). ColorVision uses that access only to add the color filter: it does not read, store or send page content, form data, URLs or history. You can restrict it at any time in Chrome ("Site access": *On click* or *On specific sites*). The extension does not request the `tabs`, `activeTab`, `scripting`, `webRequest` or history permissions.

## Remote code

ColorVision executes no remotely hosted code. All JavaScript ships inside the extension package.

## Health information

Having selected a color vision profile may imply information about your health. That choice never leaves your device. ColorVision does not ask for, receive or process diagnoses. Nothing is sent to any server, with or without consent, because the extension has no server component.

## Children

The extension collects no data from anyone, including children.

## Changes

If a future version ever needs to collect data (for example opt-in anonymous diagnostics), this policy will be updated first and the feature will require explicit opt-in consent. Version 1.0 has no such feature.

## Contact

[email / issue tracker URL]
