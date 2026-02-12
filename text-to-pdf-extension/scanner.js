// scanner.js
export async function scanPageContent(selectionOnly, cleanMode, includeCode, fixMath, pdfTextColor, tableAsImage, includeImages) {
    const segments = [];
    const originalScrollY = window.scrollY;
    const originalScrollX = window.scrollX;
    
    function isJunk(elem) {
      if (!cleanMode) return false;
      const tagName = elem.tagName;
      const classId = (elem.className + " " + elem.id).toLowerCase();
      if (['NAV', 'ASIDE', 'FOOTER', 'HEADER', 'AD'].includes(tagName)) return true;
      const badKeywords = ['sidebar', 'ad-container', 'advertisement', 'popup', 'promo', 'related-posts', 'cookie-notice', 'newsletter', 'share-buttons', 'menu'];
      if (badKeywords.some(keyword => classId.includes(keyword))) return true;
      return false;
    }
  
    function isVisible(elem) {
      const style = window.getComputedStyle(elem);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    function applyDarkModeEraser(ctx, width, height, textColor) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        let tr = 0, tg = 0, tb = 0;
        if (textColor && textColor.startsWith('#')) {
            tr = parseInt(textColor.slice(1, 3), 16) || 0;
            tg = parseInt(textColor.slice(3, 5), 16) || 0;
            tb = parseInt(textColor.slice(5, 7), 16) || 0;
        }

        const bgLum = (data[0] * 0.299 + data[1] * 0.587 + data[2] * 0.114);
        const isDarkMode = bgLum < 128;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            const lum = (r * 0.299 + g * 0.587 + b * 0.114);
            let alpha = 0;
            if (isDarkMode) alpha = lum > (bgLum + 30) ? lum : 0; 
            else alpha = lum < (bgLum - 30) ? (255 - lum) : 0;
            
            if (alpha > 0) alpha = Math.min(255, alpha * 1.5);
            data[i] = tr; data[i+1] = tg; data[i+2] = tb; 
            data[i+3] = alpha; 
        }
        ctx.putImageData(imageData, 0, 0);
    }
  
    let rootNode = document.body;
    if (selectionOnly) {
       const sel = window.getSelection();
       if (sel.rangeCount > 0 && !sel.isCollapsed) {
          rootNode = sel.getRangeAt(0).commonAncestorContainer;
          if (rootNode.nodeType === Node.TEXT_NODE) rootNode = rootNode.parentNode;
       } else {
           return [];
       }
    }
  
    async function traverse(node, listState = null) {
      if (node.nodeType === Node.ELEMENT_NODE) {
          if (!isVisible(node)) return;
          // REMOVED 'IMG' FROM EXCLUSION LIST BELOW
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IFRAME'].includes(node.tagName)) return;
          if (isJunk(node)) return;
  
          // --- PRIORITY 1: CODE BLOCKS ---
          if (node.tagName === 'PRE') {
              if (!includeCode) return; 
              const codeText = node.innerText || node.textContent;
              if (codeText.trim().length > 0) {
                  segments.push({ type: 'code', text: codeText });
              }
              return; 
          }

          // --- PRIORITY 2: STANDARD IMAGES (NEW) ---
          if (node.tagName === 'IMG') {
              if (includeImages) {
                  try {
                      const rect = node.getBoundingClientRect();
                      // Only capture visible, reasonably sized images
                      if (rect.width > 20 && rect.height > 20 && rect.height < 2000) {
                          node.scrollIntoView({behavior: 'instant', block: 'center'});
                          await new Promise(r => setTimeout(r, 150)); 
                          
                          const finalRect = node.getBoundingClientRect();
                          const response = await chrome.runtime.sendMessage({action: "captureVisibleTab"});
                          if (!response || !response.dataUrl) throw new Error("Native capture failed");
          
                          const dpr = window.devicePixelRatio || 1;
                          const canvas = document.createElement('canvas');
                          canvas.width = finalRect.width * dpr;
                          canvas.height = finalRect.height * dpr;
                          const ctx = canvas.getContext('2d');
          
                          const img = new Image();
                          img.src = response.dataUrl;
                          await new Promise(r => { img.onload = r; });
          
                          ctx.drawImage(img, 
                              finalRect.left * dpr, finalRect.top * dpr, finalRect.width * dpr, finalRect.height * dpr, 
                              0, 0, canvas.width, canvas.height
                          );
          
                          // Note: We do NOT use the Dark Mode eraser here, we want the photo as-is.
                          const isInline = window.getComputedStyle(node).display.includes('inline');
                          segments.push({ type: 'image', src: canvas.toDataURL('image/png'), width: finalRect.width, height: finalRect.height, isInline: isInline });
                      }
                  } catch (e) {
                      console.warn("Image capture failed:", e);
                  }
              }
              return; // Stop traversing inside the IMG (it has no children anyway)
          }
  
          // --- PRIORITY 3: MATH & CHEMISTRY CAPTURE ---
          let isEquation = false;
          if (!node.querySelector('pre') && !node.closest('pre')) {
              if (node.matches && node.matches('mjx-container, .katex, math, .mwe-math-element, .math, .chem, .mhchem')) {
                  isEquation = true;
              } else if (['P', 'DIV', 'SPAN', 'TD', 'LI'].includes(node.tagName)) {
                  if (!node.querySelector('p, div, article, section, iframe, table, pre, img')) {
                      const text = node.innerText || "";
                      const hasArrows = text.includes('→') || text.includes('⇌') || text.includes('⇄') || text.includes('↔') || text.includes('⟶');
                      const subSupCount = node.querySelectorAll('sub, sup').length;
                      if ((hasArrows || subSupCount >= 2) && text.length < 300) isEquation = true;
                  }
              }
          }
  
          if (fixMath && isEquation) {
              try {
                  const rect = node.getBoundingClientRect();
                  if (rect.width === 0 || rect.height === 0 || rect.height > 1000) throw new Error("Invalid dims");
  
                  node.scrollIntoView({behavior: 'instant', block: 'center'});
                  await new Promise(r => setTimeout(r, 150)); 
                  
                  const finalRect = node.getBoundingClientRect();
                  const response = await chrome.runtime.sendMessage({action: "captureVisibleTab"});
                  if (!response || !response.dataUrl) throw new Error("Native capture failed");
  
                  const dpr = window.devicePixelRatio || 1;
                  const canvas = document.createElement('canvas');
                  canvas.width = finalRect.width * dpr;
                  canvas.height = finalRect.height * dpr;
                  const ctx = canvas.getContext('2d');
  
                  const img = new Image();
                  img.src = response.dataUrl;
                  await new Promise(r => { img.onload = r; });
  
                  ctx.drawImage(img, 
                      finalRect.left * dpr, finalRect.top * dpr, finalRect.width * dpr, finalRect.height * dpr, 
                      0, 0, canvas.width, canvas.height
                  );
  
                  applyDarkModeEraser(ctx, canvas.width, canvas.height, pdfTextColor);
  
                  const isInline = window.getComputedStyle(node).display.includes('inline') || ['SPAN', 'SUB', 'SUP'].includes(node.tagName);
  
                  segments.push({ type: 'image', src: canvas.toDataURL('image/png'), width: finalRect.width, height: finalRect.height, isInline: isInline });
                  return; 
              } catch (e) {
                  console.warn("Skipping equation screenshot:", e.message);
              }
          }
  
          // --- PRIORITY 4: TABLES ---
          const isStandardTable = node.tagName === 'TABLE';
          const isDivTable = (node.tagName === 'DIV' || node.tagName === 'SECTION') && (node.getAttribute('role') === 'table' || node.getAttribute('role') === 'grid');
  
          if (isStandardTable || isDivTable) {
              if (tableAsImage) {
                  try {
                      const rect = node.getBoundingClientRect();
                      if (rect.width > 0 && rect.height > 0 && rect.height < window.innerHeight) {
                          node.scrollIntoView({behavior: 'instant', block: 'center'});
                          await new Promise(r => setTimeout(r, 150)); 
                          
                          const finalRect = node.getBoundingClientRect();
                          const response = await chrome.runtime.sendMessage({action: "captureVisibleTab"});
                          if (!response || !response.dataUrl) throw new Error("Native capture failed");
          
                          const dpr = window.devicePixelRatio || 1;
                          const canvas = document.createElement('canvas');
                          canvas.width = finalRect.width * dpr;
                          canvas.height = finalRect.height * dpr;
                          const ctx = canvas.getContext('2d');
          
                          const img = new Image();
                          img.src = response.dataUrl;
                          await new Promise(r => { img.onload = r; });
          
                          ctx.drawImage(img, 
                              finalRect.left * dpr, finalRect.top * dpr, finalRect.width * dpr, finalRect.height * dpr, 
                              0, 0, canvas.width, canvas.height
                          );
          
                          applyDarkModeEraser(ctx, canvas.width, canvas.height, pdfTextColor);
                          segments.push({ type: 'image', src: canvas.toDataURL('image/png'), width: finalRect.width, height: finalRect.height, isInline: false });
                          return; 
                      }
                  } catch (e) {
                      console.warn("Table image capture failed, falling back to text:", e);
                  }
              }

              const rows = [];
              let trs = node.querySelectorAll('tr, [role="row"]');
              if (trs.length === 0 && isDivTable) { trs = node.querySelectorAll('.row, .tr'); }
  
              let maxCols = 0;
              trs.forEach(tr => {
                  const rowData = [];
                  const cells = tr.querySelectorAll('th, td, [role="gridcell"], [role="cell"], [role="columnheader"]');
                  if (cells.length > maxCols) maxCols = cells.length;
                  cells.forEach(cell => { rowData.push((cell.innerText || cell.textContent || "").trim()); });
                  if (rowData.length > 0) rows.push(rowData);
              });
  
              if (rows.length > 0) {
                  segments.push({ type: 'table', rows: rows, maxCols: maxCols });
                  return; 
              }
          }
  
          const isBlock = ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'TR', 'BR', 'ARTICLE', 'SECTION', 'LI'].includes(node.tagName);
          if (isBlock) segments.push({ type: 'text', text: "", newline: true });
  
          let currentListState = listState;
          if (node.tagName === 'LI') currentListState = { needsBullet: true };
  
          const children = Array.from(node.childNodes);
          for (let child of children) { await traverse(child, currentListState); }
  
          if (isBlock) segments.push({ type: 'text', text: "", newline: true });
      }
      else if (node.nodeType === Node.TEXT_NODE) {
          let rawText = node.textContent;
          let text = rawText.replace(/\s+/g, ' '); 
          if (text.trim().length === 0) return; 
  
          if (node.parentNode && !isVisible(node.parentNode)) return;
          if (node.parentNode && node.parentNode.closest('table, [role="table"], [role="grid"]')) return; 
          if (node.parentNode && node.parentNode.closest('mjx-container, .katex, math, .math, .chem, .mhchem')) return;
  
          const parent = node.parentNode;
          const style = window.getComputedStyle(parent);
          const fontSizePx = parseFloat(style.fontSize) || 16;
          const fontSizePt = fontSizePx * 0.75;
  
          if (selectionOnly && !window.getSelection().containsNode(node, true)) return;
  
          if (listState && listState.needsBullet) {
               text = String.fromCharCode(149) + " " + text;
               listState.needsBullet = false; 
          }
  
          segments.push({
              type: 'text',
              text: text,
              fontSize: fontSizePt, 
              bold: parseInt(style.fontWeight) >= 600 || style.fontWeight === 'bold',
              italic: style.fontStyle === 'italic',
              underline: style.textDecorationLine.includes('underline'),
              sub: parent.tagName === 'SUB' || !!parent.closest('sub'),
              sup: parent.tagName === 'SUP' || !!parent.closest('sup'),
              startsWithSpace: text.startsWith(' '),
              endsWithSpace: text.endsWith(' '),
              newline: false
          });
      } 
    }
  
    await traverse(rootNode);
    window.scrollTo(originalScrollX, originalScrollY);
    return segments;
}