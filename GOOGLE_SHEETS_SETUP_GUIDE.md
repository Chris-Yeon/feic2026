# FEIC 2026 — Google Sheets & Google Drive Integration Guide (Option 1)

This integration allows the FEIC 2026 conference webpage to automatically save participant registrations directly into a **Google Sheet** and save all uploaded payment receipts directly into a **Google Drive folder**.

---

## ⚡ 2-Minute Setup Instructions

### Step 1: Create a Google Sheet
1. Open [Google Sheets](https://sheets.new) and name the spreadsheet:  
   **`FEIC 2026 Registrations`**

### Step 2: Open Apps Script
1. In the Google Sheets top menu bar, click:  
   **`Extensions`** > **`Apps Script`**

### Step 3: Paste the Script
1. Erase all existing placeholder code in the editor.
2. Open [`google_apps_script_backend.js`](file:///c:/Users/USER/.gemini/antigravity/scratch/feic2026/google_apps_script_backend.js) in your project.
3. Copy all of the code and paste it into the Apps Script editor.
4. Click the disk icon or press **Ctrl + S** to save.

### Step 4: Deploy as a Web App
1. Click the blue **`Deploy`** button at the top right, then select **`New deployment`**.
2. Click the gear icon next to *Select type* and choose **`Web app`**.
3. Set the fields:
   * **Description**: `FEIC 2026 Registration Handler`
   * **Execute as**: `Me (your email)`
   * **Who has access**: **`Anyone`** *(Crucial: allows conference delegates to submit registrations and receipts through the webpage)*
4. Click **`Deploy`**.
5. Click **`Authorize access`**, pick your Google account, and grant permissions.
6. Copy the generated **Web App URL** (ends with `/exec`).

### Step 5: Paste Your URL in `index.html`
1. Open [`index.html`](file:///c:/Users/USER/.gemini/antigravity/scratch/feic2026/index.html) and locate line ~1324:
   ```javascript
   window.FEIC_CONFIG = {
     googleScriptUrl: 'PASTE_YOUR_COPIED_WEB_APP_URL_HERE',
     googleFormEmbedUrl: 'YOUR_OPTIONAL_GOOGLE_FORM_EMBED_URL'
   };
   ```
2. Replace `'https://script.google.com/macros/s/...'` with your copied Web App URL.

---

## 📂 What Happens Automatically?

1. **Google Sheet Columns Populated:**
   * Timestamp
   * Registration Ref (`FEIC-XXXXXX`)
   * Full Name
   * Email Address
   * Phone Number
   * Institution / Organisation
   * Conference Category (Student / Non-Student / International)
   * Amount Due
   * Remita RRR / Ref
   * Receipt File Name
   * Clickable Google Drive Receipt Link

2. **Google Drive Storage:**
   * A folder named **`FEIC 2026 Registration Receipts`** is created automatically in your Google Drive.
   * Every uploaded PDF, PNG, or JPG receipt is saved into that folder with a prefix matching the delegate's reference number (e.g. `FEIC-592814_receipt.pdf`).
   * The link to view each receipt is placed directly in the spreadsheet row.

3. **Fallback & Local Storage Backup:**
   * Even without internet or during testing, every record is also securely cached in the browser's `localStorage` and can be downloaded anytime via `exportFEICRegistrations()`.
