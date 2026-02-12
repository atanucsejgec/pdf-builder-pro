// popup.js
import { scanPageContent } from './scanner.js';
import { generateDOC } from './doc-generator.js';
import { generatePDFAsync } from './pdf-generator.js';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "captureVisibleTab") {
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
            else sendResponse({ dataUrl: dataUrl });
        });
        return true; 
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const fontModeSelect = document.getElementById("fontMode");
    const rowFontSize = document.getElementById("row-fontSize");
    const rowFontScale = document.getElementById("row-fontScale");

    function updateUI() {
        const mode = fontModeSelect.value;
        if (mode === 'uniform') {
            rowFontSize.classList.remove('hidden');
            rowFontScale.classList.add('hidden');
        } else if (mode === 'original') {
            rowFontSize.classList.add('hidden');
            rowFontScale.classList.add('hidden');
        } else if (mode === 'relative') {
            rowFontSize.classList.add('hidden');
            rowFontScale.classList.remove('hidden');
        }
    }
    fontModeSelect.addEventListener('change', updateUI);

    chrome.storage.local.get(['pdfSettings'], (result) => {
        if (result.pdfSettings) {
            const s = result.pdfSettings;
            if(s.exportFormat) document.getElementById("exportFormat").value = s.exportFormat; 
            if(s.fontSize) document.getElementById("fontSize").value = s.fontSize;
            if(s.lineHeightMultiplier) document.getElementById("lineHeight").value = s.lineHeightMultiplier; 
            if(s.paperSize) document.getElementById("paperSize").value = s.paperSize;
            if(s.columnCount) document.getElementById("columnCount").value = s.columnCount;
            if(s.margins) {
                document.getElementById("marginTop").value = s.margins.top;
                document.getElementById("marginBottom").value = s.margins.bottom;
                document.getElementById("marginLeft").value = s.margins.left;
                document.getElementById("marginRight").value = s.margins.right;
            }
            if(s.orientation) {
                const radio = document.querySelector(`input[name="orientation"][value="${s.orientation}"]`);
                if(radio) radio.checked = true;
            }
            document.getElementById("showPageNumbers").checked = s.showPageNumbers !== false;
            document.getElementById("cleanMode").checked = s.cleanMode !== false;
            document.getElementById("includeCode").checked = s.includeCode !== false;
            document.getElementById("fixMath").checked = s.fixMath !== false; 
            document.getElementById("tableAsImage").checked = s.tableAsImage === true;
            
            // NEW: Restore Include Images setting
            document.getElementById("includeImages").checked = s.includeImages !== false; 

            if(s.fontMode) { fontModeSelect.value = s.fontMode; updateUI(); }
            if(s.fontScale) document.getElementById("fontScale").value = s.fontScale;
            if(s.fontStyle) document.getElementById("fontStyle").value = s.fontStyle;
            if(s.bgColor) document.getElementById("bgColor").value = s.bgColor;
            if(s.textColor) document.getElementById("textColor").value = s.textColor;
        }
    });
});

document.getElementById("convertBtn").addEventListener("click", async () => {
  const statusDiv = document.getElementById("status");
  const progressBar = document.getElementById("progress-bar");
  const progressContainer = document.getElementById("progress-container");

  const config = {
    filename: document.getElementById("filename").value.trim() || "document",
    selectionOnly: document.getElementById("selectionOnly").checked,
    cleanMode: document.getElementById("cleanMode").checked,
    includeCode: document.getElementById("includeCode").checked,
    fixMath: document.getElementById("fixMath").checked, 
    tableAsImage: document.getElementById("tableAsImage").checked, 
    
    // NEW: Pass this to scanner
    includeImages: document.getElementById("includeImages").checked,

    exportFormat: document.getElementById("exportFormat").value, 
    fontStyle: document.getElementById("fontStyle").value,
    bgColor: document.getElementById("bgColor").value,
    textColor: document.getElementById("textColor").value,
    fontMode: document.getElementById("fontMode").value,
    fontScale: parseInt(document.getElementById("fontScale").value) || 0,
    fontSize: parseInt(document.getElementById("fontSize").value) || 12,
    lineHeightMultiplier: parseFloat(document.getElementById("lineHeight").value) || 1.0,
    columnCount: parseInt(document.getElementById("columnCount").value) || 1, 
    showPageNumbers: document.getElementById("showPageNumbers").checked,
    orientation: document.querySelector('input[name="orientation"]:checked').value,
    paperSize: document.getElementById("paperSize").value,
    margins: {
      top: parseFloat(document.getElementById("marginTop").value) || 1,
      bottom: parseFloat(document.getElementById("marginBottom").value) || 1,
      left: parseFloat(document.getElementById("marginLeft").value) || 1,
      right: parseFloat(document.getElementById("marginRight").value) || 1
    }
  };

  chrome.storage.local.set({ pdfSettings: config });

  statusDiv.textContent = "Scanning page content...";
  progressContainer.style.display = "block";
  progressBar.style.width = "10%";

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab.url.startsWith("chrome://")) {
      statusDiv.textContent = "Error: Cannot run on browser pages.";
      progressBar.style.width = "0%";
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: scanPageContent,
      // NEW: Added config.includeImages to the end
      args: [config.selectionOnly, config.cleanMode, config.includeCode, config.fixMath, config.textColor, config.tableAsImage, config.includeImages]
    }, (results) => {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = "Error: " + chrome.runtime.lastError.message;
        return;
      }

      if (results && results[0] && results[0].result) {
        const contentSegments = results[0].result;
        if (contentSegments.length === 0) {
            statusDiv.textContent = "No content found.";
            progressBar.style.width = "0%";
            return;
        }

        statusDiv.textContent = `Processing ${contentSegments.length} segments...`;
        progressBar.style.width = "30%";
        
        if (config.exportFormat === 'doc') {
             setTimeout(() => generateDOC(contentSegments, config, statusDiv, progressBar), 100);
        } else {
             setTimeout(() => generatePDFAsync(contentSegments, config, statusDiv, progressBar), 100);
        }
      } else {
        statusDiv.textContent = "Error: Could not read page content.";
      }
    });
  } catch (err) {
    statusDiv.textContent = "Error: " + err.message;
  }
});