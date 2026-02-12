// doc-generator.js
export function generateDOC(segments, config, statusDiv, progressBar) {
    try {
        let docContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${config.filename}</title>
        <style>
            body { font-family: '${config.fontStyle === 'times' ? 'Times New Roman' : config.fontStyle === 'courier' ? 'Courier New' : 'Arial'}', sans-serif; background-color: ${config.bgColor}; color: ${config.textColor}; }
            p { margin: 0in; margin-bottom: 0.0001pt; line-height: ${config.lineHeightMultiplier}; mso-pagination:widow-orphan; mso-margin-top-alt:0in; mso-margin-bottom-alt:0in; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
            td, th { border: 1px solid ${config.textColor}; padding: 5px; vertical-align: top; }
            pre { background-color: #f0f0f0; padding: 5px 8px; font-family: 'Courier New', monospace; white-space: pre-wrap; font-size: 0.9em; line-height: 1.0; margin: 5px 0; border: 1px solid #ddd; }
        </style>
        </head><body>`;

        let currentParagraph = "";
        let hasContent = false;

        segments.forEach(seg => {
            if (seg.type === 'image') {
                let align = seg.isInline ? 'vertical-align: middle; margin: 0 4px;' : 'display: block; margin: 10px auto;';
                let htmlImg = `<img src="${seg.src}" width="${seg.width * 0.75}px" style="${align}">`;
                if (seg.isInline) {
                    currentParagraph += htmlImg;
                    hasContent = true;
                } else {
                    if (hasContent) { docContent += `<p>${currentParagraph}</p>`; currentParagraph = ""; hasContent = false; }
                    docContent += `<div>${htmlImg}</div>`;
                }
            }
            else if (seg.type === 'code') {
                if (hasContent) { docContent += `<p>${currentParagraph}</p>`; currentParagraph = ""; hasContent = false; }
                docContent += `<pre>${seg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
            }
            else if (seg.type === 'table') {
                if (hasContent) { docContent += `<p>${currentParagraph}</p>`; currentParagraph = ""; hasContent = false; }
                docContent += "<table>";
                seg.rows.forEach(row => {
                    docContent += "<tr>";
                    row.forEach(cell => { docContent += `<td>${cell}</td>`; });
                    docContent += "</tr>";
                });
                docContent += "</table><br/>";
            }
            else if (seg.type === 'text') {
                if (seg.newline) {
                    if (hasContent) { docContent += `<p>${currentParagraph}</p>`; currentParagraph = ""; hasContent = false; } 
                } else {
                    let size = config.fontSize;
                    if (config.fontMode === 'original') size = seg.fontSize;
                    else if (config.fontMode === 'relative') size = (seg.fontSize || 12) + config.fontScale;
                    if (size < 6) size = 6; if (size > 72) size = 72;

                    let style = `font-size:${size}pt;`;
                    if (seg.bold) style += "font-weight:bold;";
                    if (seg.italic) style += "font-style:italic;";
                    if (seg.underline) style += "text-decoration:underline;";

                    let safeText = seg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    if (seg.sub) safeText = `<sub>${safeText}</sub>`;
                    if (seg.sup) safeText = `<sup>${safeText}</sup>`;

                    currentParagraph += `<span style="${style}">${safeText}</span>`; 
                    hasContent = true;
                }
            }
        });

        if (hasContent) { docContent += `<p>${currentParagraph}</p>`; }
        docContent += "</body></html>";

        const blob = new Blob(['\ufeff', docContent], { type: 'application/msword' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = (config.filename || "document") + ".doc";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        statusDiv.textContent = "Done!";
        progressBar.style.width = "100%";
        setTimeout(() => { document.getElementById("progress-container").style.display = "none"; }, 2000);
    } catch (err) {
        console.error(err);
        statusDiv.textContent = "DOC Error: " + err.message;
    }
}