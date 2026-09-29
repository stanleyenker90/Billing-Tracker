# Mobo Group of Companies Limited Billing Tracker

A lightweight billing tracker for Mobo Group of Companies Limited to monitor invoices, quotations, and payment receipts in one place.

## Features

- Dashboard overview for revenue, collected totals, and open quotations
- Record management for invoices, quotes, and receipts
- Search and filtering across all billing records
- Local browser persistence using `localStorage`
- Document autofill for invoices, receipts, and quotations from PDF, DOCX, Excel, CSV, and text files
- Quick actions to mark records as paid
- Delete records and their saved attachments
- Persistent Activity Log for record creation, payment, and deletion, with CSV export

## Run it locally

### Option 1: Open directly in a browser

Open `index.html` in your browser.

### Option 2: Use a local web server

From this folder, run:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Project files

- `index.html` — app structure
- `styles.css` — dashboard styling
- `app.js` — billing logic and data handling

## Notes

The app stores record details in `localStorage` and attachment files in IndexedDB, so records remain available after refreshes in the same browser. PDF, DOCX, and Excel readers load from public CDNs when first needed, so an internet connection is required for those formats. Scanned PDFs, legacy `.doc` files, password-protected or damaged documents, and currencies other than PGK need manual review or entry. Extracted values are suggestions; review them before saving.
