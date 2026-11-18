# Publishing to the Chrome Web Store

Status: the package builds, validates and passes the e2e suite. **It has not been submitted**; submission requires your developer account and a $5 one-time registration fee.

## 1. Before you submit

* [ ] Real-user feedback from people with diagnosed CVD (see `TESTING.md`), or at minimum clear wording that effectiveness varies.
* [ ] Fill the bracketed items in `PRIVACY_POLICY.md`, host it at a public HTTPS URL.
* [ ] Replace the generated icon if you have brand artwork (`public/icons/*.png`: 16/32/48/128).
* [ ] Decide the publisher name and support contact.
* [ ] Bump the version if this is not the first upload.

## 2. Build and verify the package

```bash
npm ci
npm test
npm run package
CV_DIST=$(mktemp -d) && unzip -q release/colorvision-1.0.0.zip -d "$CV_DIST" && CV_DIST="$CV_DIST" npm run e2e
```

Upload `release/colorvision-1.0.0.zip` (about 99 KB). The zip root must contain `manifest.json` (it does).

## 3. Developer dashboard

1. Go to https://chrome.google.com/webstore/devconsole and register as a developer (one-time fee).
2. **New item**, upload the zip.
3. **Store listing**
   * *Name*: ColorVision. *Category*: Accessibility.
   * *Short description (≤132 chars)*: "Makes colors easier to tell apart for people with color vision deficiency. Personal calibration, no tracking, works offline."
   * *Detailed description*: lead with what it does and does not do:
     > ColorVision adjusts website colors so that hard-to-distinguish colors become easier to tell apart. Choose your profile (protan, deutan, tritan; mild or complete), set the intensity, and optionally run a short personal calibration. It keeps brightness, works on images, charts, canvas and video, and runs entirely on your device. ColorVision does **not** restore normal color vision, is not a medical device, and cannot diagnose color vision deficiency.
   * *Screenshots* (1280×800 or 640×400, 1-5 required): derive from `docs/screenshots/compare-*.png` and `popup.png` (crop/scale to the required size). Use the simulated-view comparisons with their "model, not real vision" captions intact.
   * *Small promo tile* 440×280 (required), marquee 1400×560 (optional).
4. **Privacy practices** (expect the install prompt to show the broad "read and change all your data on all websites" warning because of the content-script match; the justification below is what addresses it)
   * *Single purpose*: "Adjust the colors of web pages so people with color vision deficiency can distinguish them more easily."
   * *Permission justifications*: **storage**: "Saves the user's profile, intensity and calibration locally." **Content script on all http/https sites**: "The color adjustment must be applied to the pages the user browses; no page data is read, stored or sent."
   * *Data usage*: tick **none** of the collected-data categories; certify no sale/transfer, no use unrelated to the single purpose, no creditworthiness use.
   * *Remote code*: **No**, all code is in the package.
   * *Privacy policy URL*: your hosted copy of `PRIVACY_POLICY.md`.
5. **Distribution**: public/unlisted/private as appropriate; regions; pricing free.
6. **Submit for review.** Broad-host content scripts typically trigger a *longer, in-depth review*; the single-purpose statement and the permission justifications above are what reviewers read.

## 4. Review tips specific to this extension

* Reviewers will ask why it runs on all sites: the answer is the single purpose above (the filter must be applied to whatever page the user opens). The manifest has no `host_permissions` entry, but the content-script match is still all-sites access (Chrome shows *Site access: On all sites*). Alternatives that narrow it, at the cost of the automatic experience, are `activeTab` + on-click injection or `optional_host_permissions`; not implemented in 1.0.
* Keep health claims out of the listing, screenshots and name. Avoid words such as "cure", "correct your color blindness", "diagnose", "treat".
* If you add telemetry later, the privacy fields, policy and listing must be updated *before* that release.

## 5. After publishing

* Watch the dashboard for policy emails and user reviews; accessibility feedback is the best source of real-world validation.
* For each update: bump version, `npm run package`, re-run e2e on the artifact, upload.
