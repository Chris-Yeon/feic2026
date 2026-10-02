/**
 * =========================================================================
 * FEIC 2026 - GOOGLE APPS SCRIPT BACKEND (OPTION 1)
 * Automated Google Sheets Registration Database & Google Drive Receipt Storage
 * =========================================================================
 * 
 * HOW TO SET THIS UP IN 2 MINUTES:
 * 1. Go to https://sheets.new and create a new Google Sheet named "FEIC 2026 Registrations".
 * 2. In the menu bar at the top, click: Extensions > Apps Script.
 * 3. Delete any code in the editor, paste this entire file, and click Save (Ctrl + S).
 * 4. Click the blue "Deploy" button at the top right > select "New deployment".
 * 5. Click the gear icon next to "Select type" > select "Web app".
 * 6. Set the following options:
 *    - Description: "FEIC 2026 Registration Handler"
 *    - Execute as: "Me (your email)"
 *    - Who has access: "Anyone" (VERY IMPORTANT: this allows website visitors to submit without logging in).
 * 7. Click "Deploy", click "Authorize access", and approve permissions.
 * 8. Copy the generated "Web App URL" (it ends with /exec).
 * 9. In index.html, update:
 *    window.FEIC_CONFIG.googleScriptUrl = 'YOUR_COPIED_WEB_APP_URL';
 * =========================================================================
 */

function doPost(e) {
  try {
    var rawContents = e.postData.contents;
    var data = JSON.parse(rawContents);
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    
    // Auto-create and format header row on first submission
    if (sheet.getLastRow() === 0) {
      var headers = [
        "Timestamp",
        "Registration Ref",
        "Full Name",
        "Email Address",
        "Phone Number",
        "Institution / Organisation",
        "Conference Category",
        "Amount Due",
        "Remita RRR / Ref",
        "Receipt File Name",
        "Google Drive Receipt Link"
      ];
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#1B2A4A");
      headerRange.setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
    
    // Handle File Upload to Google Drive
    var driveFileUrl = "No file attached";
    if (data.receiptBase64 && data.receiptName) {
      var folderName = "FEIC 2026 Registration Receipts";
      var folders = DriveApp.getFoldersByName(folderName);
      var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
      
      // Strip Data URL prefix if present
      var base64Data = data.receiptBase64;
      if (base64Data.indexOf(",") > -1) {
        base64Data = base64Data.split(",")[1];
      }
      
      var decodedBlob = Utilities.base64Decode(base64Data);
      var mimeType = data.receiptType || "application/octet-stream";
      var filename = (data.refCode || "FEIC") + "_" + data.receiptName.replace(/[^a-zA-Z0-9._-]/g, "_");
      
      var blob = Utilities.newBlob(decodedBlob, mimeType, filename);
      var file = folder.createFile(blob);
      
      // Make accessible to anyone with the link (or committee members)
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      driveFileUrl = file.getUrl();
    }
    
    // Append the registrant record
    var newRow = [
      data.timestamp || new Date().toLocaleString(),
      data.refCode || "FEIC-000000",
      data.name || "",
      data.email || "",
      data.phone || "",
      data.affiliation || "",
      data.category || "",
      data.fee || "",
      data.rrr || "Pending",
      data.receiptName || "N/A",
      driveFileUrl
    ];
    
    sheet.appendRow(newRow);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      refCode: data.refCode,
      driveUrl: driveFileUrl
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Simple test function to verify deployment in Apps Script editor
function testDoPost() {
  var sample = {
    postData: {
      contents: JSON.stringify({
        refCode: "FEIC-TEST12",
        name: "Test Delegate",
        email: "test@unilag.edu.ng",
        phone: "+2348000000000",
        affiliation: "University of Lagos",
        category: "National Student",
        fee: "₦30,000",
        rrr: "1234-5678-9012",
        receiptName: "sample_receipt.png",
        receiptType: "image/png",
        receiptBase64: "",
        timestamp: new Date().toLocaleString()
      })
    }
  };
  var result = doPost(sample);
  Logger.log(result.getContent());
}
